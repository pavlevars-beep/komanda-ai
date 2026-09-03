import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import type { Classification, Provenance } from '../shared/provenance'
import { freshnessState, type FreshnessState } from '../shared/freshness'
import { getConnector } from '../connectors/registry'
import { runCapability } from '../connectors/runner'
import { listEnabledCapabilities } from '../integrations/repository'
import { listDashboardCards, type DashboardCardConfig } from './repository'

/**
 * Učitavanje vrednosti za KPI kartice.
 *
 * Tri pravila koja oblikuju ovaj modul:
 *
 * 1. Vrednost se NE kešira u bazi. Keširan broj vremenom prestane da odgovara
 *    stvarnosti, a korisnik nema način da to primeti. Umesto toga se uz svaku
 *    vrednost prikazuje vreme na koje se odnosi.
 *
 * 2. Kartica koja ne uspe da se učita NE ruši stranicu i ne prikazuje nulu.
 *    Prikazuje se sa razlogom zašto vrednosti nema. Nula i "nedostupno" su
 *    različite stvari, a u poslovnom kontekstu razlika je ozbiljna.
 *
 * 3. Sve kartice se učitavaju uporedo, svaka sa sopstvenim vremenskim
 *    ograničenjem. Jedan spor sistem ne sme da zaustavi celu početnu stranu.
 */

export type CardUnavailableReason =
  | 'no_integration'
  | 'connector_missing'
  | 'capability_disabled'
  | 'no_permission'
  | 'integration_down'
  | 'no_data'

export interface DashboardCard {
  readonly cardId: string
  readonly title: Readonly<Record<string, string>>
  readonly format: 'money' | 'number' | 'percent' | 'count'
  readonly classification: Classification
  /** Izostaje kada vrednost nije dostupna. */
  readonly value?: string
  readonly currency?: string
  /** Promena u odnosu na prethodni period, u procentima. */
  readonly changePercent?: number
  /**
   * Da li je promena dobra vest. Izvodi se iz konfiguracije kartice, ne iz
   * znaka broja: rast dospelih potraživanja je pozitivan broj i loša vest.
   */
  readonly changeIsGood?: boolean
  readonly provenance?: Provenance
  readonly freshness?: FreshnessState
  readonly unavailable?: CardUnavailableReason
}

const CARD_TIMEOUT_MS = 8_000

/** Dinamički deo ulaza koji server popunjava — datum nikad ne dolazi iz konfiguracije. */
function resolveInput(card: DashboardCardConfig, now: Date): Record<string, unknown> {
  const today = now.toISOString().slice(0, 10)
  const base = { ...card.input }

  if (card.ai_tool_key === 'get_daily_sales') {
    return { date: today }
  }

  if (card.ai_tool_key === 'get_financial_summary') {
    // Poslednjih 30 dana, zaključno sa danas. Period popunjava server iz istog
    // razloga kao i datum: konfiguracija ne sme da fiksira „danas".
    const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10)
    return { from, to: today }
  }

  if (card.ai_tool_key === 'get_sales_by_period') {
    const period = base.period === 'month' ? 29 : 6
    const from = new Date(now.getTime() - period * 86_400_000).toISOString().slice(0, 10)
    return { from, to: today }
  }

  // Ostale sposobnosti primaju ulaz iz konfiguracije, ali bez polja koja
  // server popunjava — da konfiguracija ne bi mogla da podmetne datum.
  delete base.period
  return base
}

/** Čita vrednost iz izlaza sposobnosti po nazivu polja iz konfiguracije. */
function readValue(
  data: unknown,
  field: string,
  format: DashboardCard['format'],
): { value: string; currency?: string } | null {
  if (data === null || typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  const raw = record[field]

  // Kartica tipa "count" broji stavke u nizu umesto da čita broj.
  if (format === 'count') {
    if (Array.isArray(raw)) return { value: String(raw.length) }
    if (typeof raw === 'number') return { value: String(raw) }
    return null
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    const currency = typeof record.currency === 'string' ? record.currency : undefined
    return { value: String(raw), ...(currency ? { currency } : {}) }
  }

  return null
}

function changeBetween(current: string, previous: unknown): number | undefined {
  if (typeof previous !== 'string' && typeof previous !== 'number') return undefined
  const prev = Number(previous)
  const now = Number(current)
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev === 0) return undefined
  return Math.round(((now - prev) / prev) * 1000) / 10
}

async function loadCard(
  db: Db,
  ctx: OrgContext,
  card: DashboardCardConfig,
  now: Date,
): Promise<DashboardCard> {
  const base = {
    cardId: card.card_id,
    title: card.title,
    format: card.format,
    classification: card.classification,
  } as const

  if (!card.integration_id || !card.connector_type) {
    return { ...base, unavailable: 'no_integration' }
  }

  const connector = getConnector(card.connector_type)
  if (!connector) return { ...base, unavailable: 'connector_missing' }

  const enabled = await listEnabledCapabilities(db, ctx.organizationId, card.integration_id)
  if (!enabled.ok) return { ...base, unavailable: 'integration_down' }

  const capabilityKey = card.capability_key ?? card.ai_tool_key

  const result = await runCapability({
    connector,
    capabilityKey,
    input: resolveInput(card, now),
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      // Runner ionako uzima permisiju iz definicije sposobnosti; ovo je samo
      // prenos onoga što je u bazi zapisano.
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: CARD_TIMEOUT_MS,
    ctx: {
      organizationId: ctx.organizationId,
      integrationId: card.integration_id,
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
    const reason: CardUnavailableReason =
      result.error.code === 'forbidden'
        ? 'no_permission'
        : result.error.code === 'capability_disabled'
          ? 'capability_disabled'
          : 'integration_down'
    return { ...base, unavailable: reason }
  }

  const read = readValue(result.value.data, card.value_field, card.format)
  if (!read) return { ...base, unavailable: 'no_data' }

  const compare =
    card.compare_field && typeof result.value.data === 'object' && result.value.data !== null
      ? changeBetween(
          read.value,
          (result.value.data as Record<string, unknown>)[card.compare_field],
        )
      : undefined

  return {
    ...base,
    value: read.value,
    ...(read.currency ? { currency: read.currency } : {}),
    ...(compare !== undefined
      ? { changePercent: compare, changeIsGood: compare >= 0 === card.higher_is_better }
      : {}),
    provenance: result.value.provenance,
    freshness: freshnessState(result.value.provenance.freshness, now),
  }
}

/**
 * Učitava sve kartice organizacije uporedo.
 *
 * `Promise.all` je ovde bezbedan jer `loadCard` nikad ne odbacuje obećanje —
 * neuspeh se vraća kao stanje kartice, ne kao izuzetak. Jedna nedostupna
 * integracija time ne obara ceo ekran.
 */
export async function loadDashboard(
  db: Db,
  ctx: OrgContext,
  now = new Date(),
): Promise<DashboardCard[]> {
  const cards = await listDashboardCards(db, ctx.organizationId)
  if (!cards.ok) return []

  return Promise.all(cards.value.map((card) => loadCard(db, ctx, card, now)))
}
