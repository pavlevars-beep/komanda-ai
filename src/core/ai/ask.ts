import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import type { Locale } from '@/i18n/config'
import { getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import { freshnessState } from '../shared/freshness'
import { err, ok, type Result } from '../shared/result'
import type { Provenance } from '../shared/provenance'
import {
  answerableIntents,
  intentPermission,
  matchQuestion,
  type IntentKey,
  type MatchOutcome,
} from './question-matcher'
import { buildAnswer, inputFor, type Answer, type AnswerFormat } from './answer'
import {
  appendMessage,
  createConversation,
  latestConversation,
  recordToolCall,
  touchConversation,
} from './repository'

/**
 * Postavljanje pitanja nad podacima klijenta.
 *
 * Tok je namerno isti kao za KPI kartice: sposobnost → runner → poreklo.
 * Razlika je samo u tome ko bira sposobnost. Zbog toga pitanje ne može da
 * dobije podatak koji kartica ne bi smela da prikaže — provera je jedna, na
 * istom mestu.
 *
 * Ono što se NE dešava nigde u ovom modulu: sastavljanje upita nad bazom
 * klijenta iz teksta pitanja. Tekst bira između imenovanih sposobnosti i
 * ništa više.
 */

const ASK_TIMEOUT_MS = 10_000

export type AskFailure =
  | { readonly kind: 'unmatched'; readonly suggestions: readonly IntentKey[] }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly IntentKey[] }
  | { readonly kind: 'no_permission'; readonly permission: string }
  | { readonly kind: 'not_connected' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unreadable' }

export interface AskResult {
  readonly intent: IntentKey
  readonly answer: Answer
  readonly provenance: Provenance
  readonly freshness: ReturnType<typeof freshnessState>
}

export interface AskInput {
  readonly question: string
  readonly integrationId: string | null
  readonly connectorType: string | null
  readonly locale: Locale
  readonly format: AnswerFormat
  readonly now?: Date
}

/**
 * Sposobnosti koje su i uključene i dozvoljene ovom korisniku.
 *
 * Isti spisak služi za prepoznavanje i za predloge, pa korisnik ne može da
 * dobije predlog pitanja na koje sistem ne bi umeo da odgovori.
 */
export async function askableIntents(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
): Promise<readonly IntentKey[]> {
  if (!integrationId) return []
  const enabled = await listEnabledCapabilities(db, ctx.organizationId, integrationId)
  if (!enabled.ok) return []
  return answerableIntents(
    ctx.permissions,
    enabled.value.map((c) => c.capabilityKey),
  )
}

function outcomeToFailure(outcome: MatchOutcome, suggestions: readonly IntentKey[]): AskFailure {
  switch (outcome.kind) {
    case 'ambiguous':
      return { kind: 'ambiguous', candidates: outcome.candidates }
    case 'no_permission':
      return { kind: 'no_permission', permission: outcome.permission }
    default:
      return { kind: 'unmatched', suggestions }
  }
}

/**
 * Pitanje → odgovor, uz upis u razgovor.
 *
 * Pitanje se upisuje i kada odgovora nema. Spisak neodgovorenih pitanja je
 * najkorisniji podatak za sledeću sposobnost koju treba napraviti; ako se
 * upisuju samo uspesi, taj spisak ne postoji.
 */
export async function ask(
  db: Db,
  ctx: OrgContext,
  input: AskInput,
): Promise<Result<AskResult, AskFailure>> {
  const now = input.now ?? new Date()

  const enabled = input.integrationId
    ? await listEnabledCapabilities(db, ctx.organizationId, input.integrationId)
    : null

  const enabledKeys = enabled?.ok ? enabled.value.map((c) => c.capabilityKey) : []
  const suggestions = answerableIntents(ctx.permissions, enabledKeys)

  const conversationId = await ensureConversation(db, ctx, input.locale)
  if (!conversationId.ok) return err({ kind: 'no_permission', permission: 'ask_ai' })

  await appendMessage(db, {
    organizationId: ctx.organizationId,
    conversationId: conversationId.value,
    role: 'user',
    content: input.question,
  })

  const outcome = matchQuestion(input.question, ctx.permissions, enabledKeys)

  if (outcome.kind !== 'matched') {
    const failure = outcomeToFailure(outcome, suggestions)
    await recordFailure(db, ctx, conversationId.value, input.question, failure)
    return err(failure)
  }

  if (!input.integrationId || !input.connectorType) {
    await recordFailure(db, ctx, conversationId.value, input.question, { kind: 'not_connected' })
    return err({ kind: 'not_connected' })
  }

  const connector = getConnector(input.connectorType)
  if (!connector || !enabled?.ok) {
    await recordFailure(db, ctx, conversationId.value, input.question, { kind: 'unavailable' })
    return err({ kind: 'unavailable' })
  }

  const capabilityInput = inputFor(outcome.intent, outcome.period, now)
  const started = Date.now()

  const result = await runCapability({
    connector,
    capabilityKey: outcome.intent,
    input: capabilityInput,
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: ASK_TIMEOUT_MS,
    ctx: {
      organizationId: ctx.organizationId,
      integrationId: input.integrationId,
      userId: ctx.userId,
      permissions: ctx.permissions,
      requestId: ctx.requestId,
      environment: 'sandbox',
      isDemo: true,
      config: {},
      secret: () => Promise.resolve(null),
    },
  })

  const latency = Date.now() - started

  if (!result.ok) {
    const failure: AskFailure =
      result.error.code === 'forbidden'
        ? { kind: 'no_permission', permission: intentPermission(outcome.intent) }
        : result.error.code === 'capability_disabled'
          ? { kind: 'not_connected' }
          : { kind: 'unavailable' }

    const messageId = await recordFailure(
      db,
      ctx,
      conversationId.value,
      input.question,
      failure,
      input.format,
    )

    if (messageId) {
      await recordToolCall(db, {
        organizationId: ctx.organizationId,
        messageId,
        aiToolKey: outcome.intent,
        integrationId: input.integrationId,
        input: capabilityInput,
        rowCount: null,
        status: result.error.code === 'forbidden' ? 'denied' : 'error',
        deniedReason: result.error.key,
        permissionChecked: intentPermission(outcome.intent),
        dataAsOf: null,
        latencyMs: latency,
      })
    }

    return err(failure)
  }

  const answer = buildAnswer(outcome.intent, result.value.data, input.format)

  if (!answer) {
    // Izlaz ne odgovara očekivanom obliku. Rečenica se NE sastavlja od onoga
    // što je uspelo da se pročita — polovičan odgovor izgleda isto kao pun.
    await recordFailure(db, ctx, conversationId.value, input.question, { kind: 'unreadable' })
    return err({ kind: 'unreadable' })
  }

  const provenance = result.value.provenance

  const messageId = await appendMessage(db, {
    organizationId: ctx.organizationId,
    conversationId: conversationId.value,
    role: 'assistant',
    content: answer.text,
    provenance: {
      classification: provenance.classification,
      sources: provenance.sources,
      ...(provenance.freshness ? { freshness: provenance.freshness } : {}),
      facts: answer.facts,
      capabilityKey: outcome.intent,
    },
  })

  if (messageId.ok) {
    await recordToolCall(db, {
      organizationId: ctx.organizationId,
      messageId: messageId.value,
      aiToolKey: outcome.intent,
      integrationId: input.integrationId,
      input: capabilityInput,
      rowCount: answer.facts.length,
      status: 'ok',
      permissionChecked: intentPermission(outcome.intent),
      dataAsOf: provenance.freshness?.asOf ?? null,
      latencyMs: latency,
    })
  }

  await touchConversation(db, conversationId.value, titleFrom(input.question))

  return ok({
    intent: outcome.intent,
    answer,
    provenance,
    freshness: freshnessState(provenance.freshness, now),
  })
}

async function ensureConversation(
  db: Db,
  ctx: OrgContext,
  locale: Locale,
): Promise<Result<string>> {
  const existing = await latestConversation(db, ctx.organizationId, ctx.userId)
  if (existing.ok && existing.value) return ok(existing.value.id)
  return createConversation(db, ctx.organizationId, ctx.userId, locale)
}

/** Prvih nekoliko reči pitanja kao naslov razgovora. */
function titleFrom(question: string): string {
  const trimmed = question.trim()
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}…`
}

/**
 * Upis odgovora „ne mogu" u razgovor.
 *
 * Poruka nosi razlog u `provenance.unanswered`, pa se pri kasnijem čitanju
 * razlikuje neuspeh od odgovora — bez toga bi istorija izgledala kao da je
 * sistem odgovorio.
 */
async function recordFailure(
  db: Db,
  ctx: OrgContext,
  conversationId: string,
  question: string,
  failure: AskFailure,
  format?: AnswerFormat,
): Promise<string | null> {
  const text = format ? format.t('ask.unanswered') : ''

  const stored = await appendMessage(db, {
    organizationId: ctx.organizationId,
    conversationId,
    role: 'assistant',
    content: text,
    provenance: { unanswered: failure.kind, question: question.slice(0, 200) },
  })

  await touchConversation(db, conversationId, titleFrom(question))
  return stored.ok ? stored.value : null
}
