import { z } from 'zod'
import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { connectorContext, getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import { freshnessState, type FreshnessState } from '../shared/freshness'
import type { Provenance } from '../shared/provenance'

/**
 * Podaci za tablu sa pokazateljima.
 *
 * Tabla i brif čitaju kroz ISTI runner i iste sposobnosti. Poseban put do
 * podataka značio bi da isti broj na dva mesta jednog dana ispadne različit —
 * a to je prva stvar koju korisnik primeti i poslednja u koju posle poveruje.
 *
 * Blok koji se ne učita NE prikazuje nulu. Nula i „ne mogu da pročitam" su
 * različite vesti, i tabla to mora da razlikuje isto kao i brif.
 */

const BOARD_TIMEOUT_MS = 8_000

export interface BoardBlock<T> {
  readonly data?: T
  readonly provenance?: Provenance
  readonly freshness?: FreshnessState
  readonly unavailable?: boolean
}

const dailySeries = z.object({
  currency: z.string(),
  days: z.array(z.object({ date: z.string(), total: z.string() })),
})

const history = z.object({
  currency: z.string(),
  months: z.array(z.object({ month: z.string(), total: z.string() })),
})

const financial = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.string(),
  expenses: z.string(),
  profit: z.string(),
  marginPercent: z.number(),
  previousRevenue: z.string(),
  currency: z.string(),
})

const headcount = z.object({
  total: z.number().int(),
  departments: z.array(z.object({ name: z.string(), count: z.number().int() })),
})

export type DailySeries = z.infer<typeof dailySeries>
export type History = z.infer<typeof history>
export type Financial = z.infer<typeof financial>
export type Headcount = z.infer<typeof headcount>

export interface Board {
  readonly daily: BoardBlock<DailySeries>
  readonly history: BoardBlock<History>
  readonly financial: BoardBlock<Financial>
  readonly headcount: BoardBlock<Headcount>
  /** Vreme čitanja, ne vreme na koje se podatak odnosi. Dve različite stvari. */
  readonly readAt: string
}

async function loadBlock<T>(
  db: Db,
  ctx: OrgContext,
  integrationId: string,
  connectorType: string,
  enabled: readonly { capabilityKey: string; mode: 'read' | 'prepare' | 'execute'; requiredPermission: string }[],
  capabilityKey: string,
  input: Record<string, unknown>,
  schema: z.ZodType<T>,
  now: Date,
): Promise<BoardBlock<T>> {
  const connector = getConnector(connectorType)
  if (!connector) return { unavailable: true }

  const result = await runCapability({
    connector,
    capabilityKey,
    input,
    enabled: enabled.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: BOARD_TIMEOUT_MS,
    ctx: connectorContext({ db, ctx, integrationId }),
  })

  if (!result.ok) return { unavailable: true }

  const parsed = schema.safeParse(result.value.data)
  if (!parsed.success) return { unavailable: true }

  return {
    data: parsed.data,
    provenance: result.value.provenance,
    freshness: freshnessState(result.value.provenance.freshness, now),
  }
}

export async function loadBoard(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  historyYears: number,
  now: Date = new Date(),
): Promise<Board> {
  const empty: Board = {
    daily: { unavailable: true },
    history: { unavailable: true },
    financial: { unavailable: true },
    headcount: { unavailable: true },
    readAt: now.toISOString(),
  }

  if (!integrationId || !connectorType) return empty

  const enabled = await listEnabledCapabilities(db, ctx.organizationId, integrationId)
  if (!enabled.ok) return empty

  // Trideset dana je najkraći period u kojem se vidi i nedeljni ritam i
  // mesečni tok; kraći niz izgleda kao šum, duži se na ovoj širini stisne.
  const monthAgo = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)

  const [daily, historyBlock, financialBlock, headcountBlock] = await Promise.all([
    loadBlock(db, ctx, integrationId, connectorType, enabled.value, 'get_sales_daily', { days: 30 }, dailySeries, now),
    loadBlock(db, ctx, integrationId, connectorType, enabled.value, 'get_sales_history', { years: historyYears }, history, now),
    loadBlock(db, ctx, integrationId, connectorType, enabled.value, 'get_financial_summary', { from: monthAgo, to: yesterday }, financial, now),
    loadBlock(db, ctx, integrationId, connectorType, enabled.value, 'get_headcount', {}, headcount, now),
  ])

  return {
    daily,
    history: historyBlock,
    financial: financialBlock,
    headcount: headcountBlock,
    readAt: now.toISOString(),
  }
}
