import { z } from 'zod'
import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import { freshnessState, type FreshnessState } from '../shared/freshness'
import type { Provenance } from '../shared/provenance'
import { DEFAULT_BUSINESS_RULES, type BusinessRules } from '../rules/business-rules'
import { whatNeedsAttention, type AttentionItem } from './attention'

/**
 * Jutarnji brif.
 *
 * Svaki blok ide kroz ISTI runner kao KPI kartice i kao pitanja — ista provera
 * permisije, isto vremensko ograničenje, ista validacija izlaza, isto poreklo.
 * Drugi put do podataka klijenta značio bi drugi skup propusta.
 *
 * Blok koji ne uspe da se učita NE ruši brif i ne prikazuje nulu. Prikazuje se
 * sa razlogom. Nula i „ne mogu da pročitam" su različite stvari, a u
 * upravljačkom kontekstu ta razlika menja odluku.
 */

const BLOCK_TIMEOUT_MS = 8_000

export type BlockUnavailable =
  | 'no_integration'
  | 'connector_missing'
  | 'no_permission'
  | 'capability_disabled'
  | 'integration_down'
  | 'unreadable'

export interface Block<T> {
  readonly data?: T
  readonly provenance?: Provenance
  readonly freshness?: FreshnessState
  readonly unavailable?: BlockUnavailable
}

const salesPeriod = z.object({
  total: z.string(),
  previousTotal: z.string(),
  changePercent: z.number(),
})

const salesSchema = z.object({
  currency: z.string(),
  asOf: z.string(),
  yesterday: salesPeriod,
  last7Days: salesPeriod,
  monthToDate: salesPeriod,
})

const agingSchema = z.object({
  total: z.string(),
  overdue: z.string(),
  currency: z.string(),
  asOf: z.string(),
  buckets: z.array(
    z.object({
      fromDays: z.number().int(),
      toDays: z.number().int().nullable(),
      amount: z.string(),
      invoiceCount: z.number().int(),
    }),
  ),
})

const debtorsSchema = z.object({
  total: z.string(),
  currency: z.string(),
  items: z.array(
    z.object({
      customer: z.string(),
      amount: z.string(),
      currency: z.string(),
      invoiceCount: z.number().int(),
      oldestOverdueDays: z.number().int(),
    }),
  ),
})

const payablesSchema = z.object({
  total: z.string(),
  dueWithin7Days: z.string(),
  currency: z.string(),
  items: z.array(
    z.object({
      supplier: z.string(),
      amount: z.string(),
      currency: z.string(),
      dueDate: z.string(),
      daysUntilDue: z.number().int(),
    }),
  ),
})

const stockSchema = z.object({
  items: z.array(
    z.object({
      item: z.string(),
      onHand: z.number(),
      minimum: z.number(),
      averageDailySales: z.number(),
      daysOfCover: z.number(),
      leadTimeDays: z.number().int(),
    }),
  ),
})

export type Sales = z.infer<typeof salesSchema>
export type Aging = z.infer<typeof agingSchema>
export type Debtors = z.infer<typeof debtorsSchema>
export type Payables = z.infer<typeof payablesSchema>
export type Stock = z.infer<typeof stockSchema>

export interface MorningBrief {
  readonly sales: Block<Sales>
  readonly receivables: Block<Aging>
  readonly debtors: Block<Debtors>
  readonly payables: Block<Payables>
  readonly stock: Block<Stock>
  readonly attention: readonly AttentionItem[]
  readonly rules: BusinessRules
  /**
   * Najstarije vreme na koje se odnosi bilo koji prikazan podatak.
   *
   * Brif je jedan ekran sastavljen iz više izvora; ako je bilo koji zastario,
   * ceo zaključak može da bude pogrešan. Prikazuje se NAJSTARIJE vreme, ne
   * najnovije — najnovije bi ceo brif predstavilo svežijim nego što jeste.
   */
  readonly oldestAsOf: string | null
  readonly staleBlocks: number
}

interface LoadContext {
  readonly db: Db
  readonly ctx: OrgContext
  readonly integrationId: string | null
  readonly connectorType: string | null
  readonly enabled: readonly { capabilityKey: string; mode: 'read' | 'prepare' | 'execute'; requiredPermission: string }[]
  readonly now: Date
}

async function loadBlock<T>(
  load: LoadContext,
  capabilityKey: string,
  schema: z.ZodType<T>,
): Promise<Block<T>> {
  if (!load.integrationId || !load.connectorType) return { unavailable: 'no_integration' }

  const connector = getConnector(load.connectorType)
  if (!connector) return { unavailable: 'connector_missing' }

  const result = await runCapability({
    connector,
    capabilityKey,
    input: {},
    enabled: load.enabled.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: BLOCK_TIMEOUT_MS,
    ctx: {
      organizationId: load.ctx.organizationId,
      integrationId: load.integrationId,
      userId: load.ctx.userId,
      permissions: load.ctx.permissions,
      requestId: load.ctx.requestId,
      environment: 'sandbox',
      isDemo: true,
      config: {},
      secret: () => Promise.resolve(null),
    },
  })

  if (!result.ok) {
    const unavailable: BlockUnavailable =
      result.error.code === 'forbidden'
        ? 'no_permission'
        : result.error.code === 'capability_disabled'
          ? 'capability_disabled'
          : 'integration_down'
    return { unavailable }
  }

  const parsed = schema.safeParse(result.value.data)
  // Neispravan oblik NE prolazi delimično. Blok sastavljen od onoga što je
  // uspelo da se pročita izgleda isto kao pun blok.
  if (!parsed.success) return { unavailable: 'unreadable' }

  return {
    data: parsed.data,
    provenance: result.value.provenance,
    freshness: freshnessState(result.value.provenance.freshness, load.now),
  }
}

/**
 * Sve u brifu odjednom.
 *
 * Blokovi se učitavaju uporedo — jedan spor izvor ne sme da zadrži ceo ekran.
 * Ono što traži pažnju se izvodi TEK POSLE, iz onoga što je stvarno stiglo:
 * upozorenje izvedeno iz bloka koji se nije učitao bilo bi tvrdnja bez
 * pokrića.
 */
export async function loadMorningBrief(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  rules: BusinessRules = DEFAULT_BUSINESS_RULES,
  now: Date = new Date(),
): Promise<MorningBrief> {
  const enabledResult = integrationId
    ? await listEnabledCapabilities(db, ctx.organizationId, integrationId)
    : null

  const load: LoadContext = {
    db,
    ctx,
    integrationId,
    connectorType,
    enabled: enabledResult?.ok ? enabledResult.value : [],
    now,
  }

  const [sales, receivables, debtors, payables, stock] = await Promise.all([
    loadBlock(load, 'get_sales_summary', salesSchema),
    loadBlock(load, 'get_receivables_aging', agingSchema),
    loadBlock(load, 'get_top_debtors', debtorsSchema),
    loadBlock(load, 'get_payables', payablesSchema),
    loadBlock(load, 'get_stock_status', stockSchema),
  ])

  const attention = whatNeedsAttention({
    rules,
    ...(receivables.data ? { receivables: receivables.data } : {}),
    ...(debtors.data ? { debtors: debtors.data.items } : {}),
    ...(stock.data ? { stock: stock.data.items } : {}),
    ...(payables.data ? { payables: payables.data.items } : {}),
    ...(sales.data ? { sales: sales.data } : {}),
  })

  const blocks = [sales, receivables, debtors, payables, stock]
  const timestamps = blocks
    .map((b) => b.provenance?.freshness?.asOf)
    .filter((t): t is string => typeof t === 'string')
    .sort()

  return {
    sales,
    receivables,
    debtors,
    payables,
    stock,
    attention,
    rules,
    oldestAsOf: timestamps[0] ?? null,
    staleBlocks: blocks.filter((b) => b.freshness === 'stale' || b.freshness === 'unknown').length,
  }
}
