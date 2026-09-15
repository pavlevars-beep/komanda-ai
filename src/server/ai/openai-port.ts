import 'server-only'
import { env } from '../env'
import { logger } from '../logger'
import type {
  ChatPort,
  ModelReply,
  ModelToolCall,
  ToolDefinition,
  Turn,
} from '@/core/ai/conversation'

/**
 * Port ka modelu, preko OpenAI Chat Completions.
 *
 * Jedino mesto u projektu koje zna kako izgleda taj API. Jezgro razgovora radi
 * nad našim oblikom poruke, pa promena dobavljača modela menja samo ovaj fajl.
 *
 * Ovde se NE drži nijedna granica. Provera alata, ograničenje koraka i provera
 * ulaza stoje u jezgru — ovde je samo prevod oblika i mreža.
 */

const API_URL = 'https://api.openai.com/v1/chat/completions'

/** Jedan poziv ne sme da visi duže od ovoga; korisnik gleda u prazan ekran. */
const REQUEST_TIMEOUT_MS = 45_000

interface ApiToolCall {
  id?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

interface ApiResponse {
  choices?: { message?: { content?: unknown; tool_calls?: unknown } }[]
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
}

/** Naši redovi razgovora → oblik koji API očekuje. */
function toApiMessages(system: string, turns: readonly Turn[]): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }]

  for (const turn of turns) {
    if (turn.role === 'user' || turn.role === 'assistant') {
      out.push({ role: turn.role, content: turn.content })
      continue
    }

    if (turn.role === 'assistant_tools') {
      out.push({
        role: 'assistant',
        content: null,
        tool_calls: turn.calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      })
      continue
    }

    out.push({ role: 'tool', tool_call_id: turn.callId, content: turn.content })
  }

  return out
}

function toApiTools(tools: readonly ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/**
 * Argumenti stižu kao NISKA sa JSON-om, i ume da bude pokvarena.
 *
 * Pokvaren JSON se ne baca kao izuzetak nego daje prazan objekat: provera ulaza
 * u jezgru će ga odbiti sa razlogom koji se modelu vraća, pa ume da se ispravi.
 * Izuzetak bi srušio ceo razgovor zbog jednog promašenog navodnika.
 */
function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readToolCalls(value: unknown): ModelToolCall[] {
  if (!Array.isArray(value)) return []

  const out: ModelToolCall[] = []
  for (const entry of value as ApiToolCall[]) {
    const name = entry?.function?.name
    if (typeof name !== 'string' || name === '') continue
    out.push({
      id: typeof entry.id === 'string' ? entry.id : name,
      name,
      args: parseArguments(entry.function?.arguments),
    })
  }
  return out
}

function readUsage(usage: ApiResponse['usage']): { input: number; output: number } | undefined {
  const input = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null
  const output = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null
  return input === null && output === null ? undefined : { input: input ?? 0, output: output ?? 0 }
}

/**
 * Port, ili `null` kada model nije podešen.
 *
 * `null` je ISPRAVNO stanje, ne greška: bez ključa razgovor radi u
 * determinističkom režimu, nad istim sposobnostima, samo bez planiranja. Bacanje
 * izuzetka ovde bi oborilo ekran koji i bez modela ima šta da prikaže.
 */
export function openAiPort(): ChatPort | null {
  const config = env()
  if (config.AI_PROVIDER !== 'openai') return null

  const key = config.OPENAI_API_KEY
  if (!key) return null

  return {
    async reply({ system, turns, tools }) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.OPENAI_MODEL,
          messages: toApiMessages(system, turns),
          ...(tools.length > 0 ? { tools: toApiTools(tools), tool_choice: 'auto' } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        // Telo greške ume da nosi deo prompta, a prompt nosi podatke klijenta.
        // Zato se beleži samo status.
        logger.error('ai.model.odbio', { component: 'ai', status: response.status })
        throw new Error(`model_http_${response.status}`)
      }

      const body = (await response.json()) as ApiResponse
      const message = body.choices?.[0]?.message
      const calls = readToolCalls(message?.tool_calls)
      const usage = readUsage(body.usage)

      if (calls.length > 0) {
        return { kind: 'tools', calls, ...(usage ? { usage } : {}) } satisfies ModelReply
      }

      return {
        kind: 'text',
        text: typeof message?.content === 'string' ? message.content : '',
        ...(usage ? { usage } : {}),
      } satisfies ModelReply
    },
  }
}
