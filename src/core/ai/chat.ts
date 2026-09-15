import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import type { Locale } from '@/i18n/config'
import { connectorContext, getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import type { BusinessRules } from '../rules/business-rules'
import { answerableIntents, intentPermission, type IntentKey } from './question-matcher'
import { converse, type ChatPort, type ConversationResult, type Turn } from './conversation'
import { parseToolInput, toolsFor } from './tool-definitions'
import { buildSystemPrompt } from './system-prompt'
import {
  appendMessage,
  createConversation,
  latestConversation,
  listMessages,
  recordToolCall,
  touchConversation,
} from './repository'

/**
 * Razgovor nad podacima klijenta.
 *
 * Spaja model, alate i upis u istoriju. Model je PORT — prosleđuje se, ne pravi
 * se ovde — pa se ceo tok može voziti lažnim modelom u testu.
 *
 * Kada modela nema, ovo se ne poziva: ekran tada radi u determinističkom režimu
 * kroz `ask`, nad istim sposobnostima. Razlika je u planiranju, ne u pristupu.
 */

const TOOL_TIMEOUT_MS = 10_000

/** Koliko se prethodnih poruka nosi u kontekst. */
const HISTORY_LIMIT = 20

export interface ChatInput {
  readonly port: ChatPort
  readonly question: string
  readonly integrationId: string | null
  readonly connectorType: string | null
  readonly locale: Locale
  readonly rules: BusinessRules
  readonly organizationName: string
  readonly currency: string
  readonly now?: Date
}

export interface ChatOutcome {
  readonly conversationId: string
  readonly result: ConversationResult
  /** Alati koji su stvarno dali podatak — poreklo odgovora. */
  readonly sources: readonly { readonly tool: string; readonly dataAsOf: string | null }[]
}

/**
 * Istorija razgovora u redove koje model razume.
 *
 * Nose se SAMO tekstualne poruke, ne i pozivi alata iz prošlih pitanja. Rezultat
 * alata od pre sat vremena je zastareo podatak koji bi model mogao da ponovi kao
 * današnji — a ako mu opet treba, pozvaće alat ponovo i dobiti svež.
 */
function toTurns(
  messages: readonly { role: string; content: string | null }[],
): readonly Turn[] {
  const out: Turn[] = []
  for (const m of messages) {
    if (!m.content) continue
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') out.push({ role: 'assistant', content: m.content })
  }
  return out
}

export async function chat(
  db: Db,
  ctx: OrgContext,
  input: ChatInput,
): Promise<ChatOutcome | null> {
  const now = input.now ?? new Date()

  const enabled = input.integrationId
    ? await listEnabledCapabilities(db, ctx.organizationId, input.integrationId)
    : null
  const enabledKeys = enabled?.ok ? enabled.value.map((c) => c.capabilityKey) : []

  /*
   * Spisak alata se pravi ISTOM funkcijom koja hrani predloge pitanja. Zbog toga
   * ne može da se desi da se pitanje predloži a model nema čime da odgovori, ni
   * obrnuto — da model ima alat koji korisnik ne sme da vidi.
   */
  const intents = answerableIntents(ctx.permissions, enabledKeys)
  const tools = toolsFor(intents)

  const conversationId = await ensureConversation(db, ctx, input.locale)
  if (!conversationId) return null

  await appendMessage(db, {
    organizationId: ctx.organizationId,
    conversationId,
    role: 'user',
    content: input.question,
  })

  const history = await listMessages(db, conversationId, HISTORY_LIMIT)
  const turns = history.ok ? toTurns(history.value.slice(0, -1)) : []

  const sources: { tool: string; dataAsOf: string | null }[] = []
  const connector = input.connectorType ? getConnector(input.connectorType) : null

  /*
   * Pozivi alata se SKUPLJAJU pa upisuju posle poruke.
   *
   * `ai_tool_calls.message_id` je obavezan, a alati se pozivaju pre nego što
   * odgovor postoji. Vezivanje za poruku nije formalnost: trag koji ne zna uz
   * koji je odgovor nastao ne odgovara na pitanje zbog kojeg se i vodi.
   */
  const pendingCalls: Omit<Parameters<typeof recordToolCall>[1], 'messageId'>[] = []

  const result = await converse({
    port: input.port,
    system: buildSystemPrompt({
      organizationName: input.organizationName,
      currency: input.currency,
      today: now.toISOString().slice(0, 10),
      locale: input.locale,
      role: ctx.memberRole,
      toolNames: tools.map((t) => t.name),
      thresholds: {
        receivableWarningDays: input.rules.receivableWarningDays,
        receivableCriticalDays: input.rules.receivableCriticalDays,
        largeReceivableAmount: input.rules.largeReceivableAmount,
        payableHorizonDays: input.rules.payableHorizonDays,
      },
    }),
    history: turns,
    question: input.question,
    tools,
    run: async ({ name, args }) => {
      /*
       * Ulaz koji je model poslao proverava se PRE izvršavanja. Šema koju je
       * model dobio je molba; ovo je provera da je molbu poslušao.
       */
      const parsed = parseToolInput(name, args)
      if (!parsed.ok) return { ok: false, reason: parsed.reason }

      if (!connector || !enabled?.ok || !input.integrationId) {
        return { ok: false, reason: 'not_connected' }
      }

      const started = Date.now()
      const outcome = await runCapability({
        connector,
        capabilityKey: name,
        input: parsed.input,
        enabled: enabled.value.map((c) => ({
          capabilityKey: c.capabilityKey,
          mode: c.mode,
          requiredPermission: c.requiredPermission as never,
        })),
        timeoutMs: TOOL_TIMEOUT_MS,
        ctx: connectorContext({ db, ctx, integrationId: input.integrationId }),
      })

      const latency = Date.now() - started
      const dataAsOf = outcome.ok ? (outcome.value.provenance.freshness?.asOf ?? null) : null

      pendingCalls.push({
        organizationId: ctx.organizationId,
        aiToolKey: name,
        integrationId: input.integrationId,
        input: parsed.input,
        rowCount: null,
        status: outcome.ok ? 'ok' : outcome.error.code === 'forbidden' ? 'denied' : 'error',
        ...(outcome.ok ? {} : { deniedReason: outcome.error.key }),
        permissionChecked: intentPermission(name),
        dataAsOf,
        latencyMs: latency,
      })

      if (!outcome.ok) return { ok: false, reason: outcome.error.key }

      sources.push({ tool: name, dataAsOf })
      return { ok: true, data: outcome.value.data, dataAsOf }
    },
  })

  /*
   * Poruka se upisuje I KADA ODGOVORA NEMA, kao i u determinističkom režimu.
   * Spisak pitanja koja su ostala bez odgovora je najkorisniji podatak za
   * sledeću sposobnost koju treba napraviti; ako se upisuju samo uspesi, taj
   * spisak ne postoji.
   */
  const message = await appendMessage(db, {
    organizationId: ctx.organizationId,
    conversationId,
    role: 'assistant',
    content: result.text,
    provenance: { sources, steps: result.steps.length, end: result.end },
  })

  if (message.ok) {
    for (const call of pendingCalls) {
      await recordToolCall(db, { ...call, messageId: message.value })
    }
  }

  await touchConversation(db, ctx.organizationId, conversationId)

  return { conversationId, result, sources }
}

async function ensureConversation(
  db: Db,
  ctx: OrgContext,
  locale: Locale,
): Promise<string | null> {
  const existing = await latestConversation(db, ctx.organizationId, ctx.userId)
  if (existing.ok && existing.value) return existing.value.id

  const created = await createConversation(db, ctx.organizationId, ctx.userId, locale)
  return created.ok ? created.value : null
}

/** Namere koje model može da koristi — isti spisak koji hrani i predloge. */
export function chatIntents(
  permissions: OrgContext['permissions'],
  enabledCapabilities: readonly string[],
): readonly IntentKey[] {
  return answerableIntents(permissions, enabledCapabilities)
}
