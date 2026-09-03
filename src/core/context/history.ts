import { z } from 'zod'
import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import type { Provenance } from '../shared/provenance'
import { annotateMonths, compareYearOverYear, type AnnotatedMonth, type Comparison } from './events'
import { listContextEvents, type StoredContextEvent } from './repository'

/**
 * Istorija prodaje sa primenjenim kontekstom.
 *
 * Ide kroz isti runner kao sve ostalo. Događaji se učitavaju uporedo sa
 * istorijom, a primenjuju TEK POSLE — poređenje izvedeno iz podataka koji se
 * nisu učitali bilo bi tvrdnja bez pokrića.
 */

const HISTORY_TIMEOUT_MS = 10_000

const historySchema = z.object({
  currency: z.string(),
  months: z.array(z.object({ month: z.string(), total: z.string() })),
})

export type HistoryUnavailable =
  | 'no_integration'
  | 'connector_missing'
  | 'no_permission'
  | 'capability_disabled'
  | 'integration_down'
  | 'unreadable'

export interface SalesHistory {
  readonly currency?: string
  readonly months?: readonly AnnotatedMonth[]
  /** Poređenje poslednjeg punog meseca sa istim mesecom prethodne godine. */
  readonly yearOverYear?: Comparison | null
  readonly events?: readonly StoredContextEvent[]
  readonly provenance?: Provenance
  readonly unavailable?: HistoryUnavailable
}

export async function loadSalesHistory(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  years: number,
): Promise<SalesHistory> {
  if (!integrationId || !connectorType) return { unavailable: 'no_integration' }

  const connector = getConnector(connectorType)
  if (!connector) return { unavailable: 'connector_missing' }

  const [enabled, events] = await Promise.all([
    listEnabledCapabilities(db, ctx.organizationId, integrationId),
    listContextEvents(db, ctx.organizationId),
  ])

  if (!enabled.ok) return { unavailable: 'integration_down' }

  const result = await runCapability({
    connector,
    capabilityKey: 'get_sales_history',
    input: { years },
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: HISTORY_TIMEOUT_MS,
    ctx: {
      organizationId: ctx.organizationId,
      integrationId,
      userId: ctx.userId,
      permissions: ctx.permissions,
      requestId: ctx.requestId,
      environment: 'sandbox',
      isDemo: true,
      config: {},
      secret: () => Promise.resolve(null),
    },
  })

  if (!result.ok) {
    const unavailable: HistoryUnavailable =
      result.error.code === 'forbidden'
        ? 'no_permission'
        : result.error.code === 'capability_disabled'
          ? 'capability_disabled'
          : 'integration_down'
    return { unavailable }
  }

  const parsed = historySchema.safeParse(result.value.data)
  if (!parsed.success) return { unavailable: 'unreadable' }

  // Događaji koji se nisu učitali NE ruše istoriju — prikazuje se bez konteksta.
  // Prazan spisak i „ne mogu da pročitam" ovde vode na isti prikaz, ali ni u
  // jednom slučaju se ne izmišlja prilagođena osnovica.
  const contextEvents = events.ok ? events.value : []
  const months = annotateMonths(parsed.data.months, contextEvents)

  // Poslednji mesec u nizu je poslednji PUN mesec — konektor izostavlja tekući.
  const last = months.at(-1)

  return {
    currency: parsed.data.currency,
    months,
    yearOverYear: last ? compareYearOverYear(months, last.month) : null,
    events: contextEvents,
    provenance: result.value.provenance,
  }
}
