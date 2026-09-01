import { beforeEach, describe, expect, it } from 'vitest'
import { loadDashboard } from '@/core/dashboard/loader'
import { clearRegistry, registerConnector } from '@/core/connectors/registry'
import { demoConnector } from '@/core/connectors/impl/demo'
import type { OrgContext } from '@/core/tenancy/org-context'

const ORG = '00000000-0000-0000-0000-00000000d002'
const INTEGRATION = '00000000-0000-0000-0000-00000000e001'

const ctx: OrgContext = {
  organizationId: ORG,
  organizationSlug: 'demo-distribucija',
  organizationName: 'Demo Distribucija',
  locale: 'sr',
  currency: 'RSD',
  timezone: 'Europe/Belgrade',
  isDemo: true,
  userId: '00000000-0000-0000-0000-0000000000b1',
  userName: 'Jelena',
  permissions: ['view_sales', 'view_financial_data', 'view_inventory'],
  requestId: 'test-dashboard',
}

function cardRow(over: Record<string, unknown> = {}) {
  return {
    card_id: '00000000-0000-0000-0000-0000000000c1',
    ai_tool_key: 'get_daily_sales',
    integration_id: INTEGRATION,
    title: { sr: 'Prodaja danas', en: 'Sales today' },
    format: 'money',
    value_field: 'total',
    compare_field: null,
    higher_is_better: true,
    input: {},
    step_order: 1,
    classification: 'fact',
    connector_type: 'demo',
    capability_key: 'get_daily_sales',
    ...over,
  }
}

/**
 * Dvojnik baze. Vraća zadate kartice i zadate uključene sposobnosti, pa se
 * ponašanje loader-a proverava bez podizanja Postgresa.
 */
function fakeDb(cards: unknown[], capabilities: unknown[] | 'error') {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (v: unknown) => void) =>
      resolve(
        capabilities === 'error'
          ? { data: null, error: { message: 'baza nedostupna' } }
          : { data: capabilities, error: null },
      ),
  }

  return {
    rpc: () => Promise.resolve({ data: cards, error: null }),
    from: () => query,
  } as never
}

const ENABLED = [
  { capability_key: 'get_daily_sales', mode: 'read', required_permission: 'view_sales', enabled: true },
  {
    capability_key: 'get_outstanding_invoices',
    mode: 'read',
    required_permission: 'view_financial_data',
    enabled: true,
  },
]

describe('učitavanje KPI kartica', () => {
  beforeEach(() => {
    clearRegistry()
    registerConnector(demoConnector)
  })

  it('učitava vrednost sa poreklom i svežinom', async () => {
    const [card] = await loadDashboard(fakeDb([cardRow()], ENABLED), ctx)

    expect(card?.value).toBeDefined()
    expect(card?.unavailable).toBeUndefined()
    expect(card?.provenance?.sources[0]?.isDemo).toBe(true)
    expect(card?.freshness).toBe('fresh')
  })

  it('kartica bez integracije se ne prikazuje kao nula', async () => {
    // Ovo je suština: nula i „nedostupno" su različite stvari, a razlika je
    // u poslovnom kontekstu ozbiljna.
    const [card] = await loadDashboard(
      fakeDb([cardRow({ integration_id: null, connector_type: null })], ENABLED),
      ctx,
    )

    expect(card?.value).toBeUndefined()
    expect(card?.unavailable).toBe('no_integration')
  })

  it('nedostupna integracija ne ruši ostale kartice', async () => {
    const cards = await loadDashboard(
      fakeDb([cardRow(), cardRow({ card_id: '00000000-0000-0000-0000-0000000000c2' })], 'error'),
      ctx,
    )

    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.unavailable === 'integration_down')).toBe(true)
    expect(cards.every((c) => c.value === undefined)).toBe(true)
  })

  it('sposobnost koja nije uključena daje jasan razlog', async () => {
    const [card] = await loadDashboard(
      fakeDb([cardRow({ ai_tool_key: 'get_inventory_alerts', capability_key: 'get_inventory_alerts' })], ENABLED),
      ctx,
    )

    expect(card?.unavailable).toBe('capability_disabled')
  })

  it('bez permisije kartica ne otkriva vrednost', async () => {
    const [card] = await loadDashboard(
      fakeDb(
        [cardRow({ ai_tool_key: 'get_outstanding_invoices', capability_key: 'get_outstanding_invoices', input: { overdueDays: 30 } })],
        ENABLED,
      ),
      { ...ctx, permissions: ['view_sales'] },
    )

    expect(card?.value).toBeUndefined()
    expect(card?.unavailable).toBe('no_permission')
  })

  it('konektor koji nije registrovan ne obara stranicu', async () => {
    const [card] = await loadDashboard(
      fakeDb([cardRow({ connector_type: 'tim_erp' })], ENABLED),
      ctx,
    )

    expect(card?.unavailable).toBe('connector_missing')
  })

  it('rast dospelih potraživanja se ne prikazuje kao dobra vest', async () => {
    // higher_is_better = false, pa pozitivna promena mora biti označena kao loša.
    const [card] = await loadDashboard(
      fakeDb(
        [
          cardRow({
            ai_tool_key: 'get_sales_by_period',
            capability_key: 'get_sales_by_period',
            compare_field: 'previousTotal',
            higher_is_better: false,
            input: { period: 'week' },
          }),
        ],
        [
          {
            capability_key: 'get_sales_by_period',
            mode: 'read',
            required_permission: 'view_sales',
            enabled: true,
          },
        ],
      ),
      ctx,
    )

    expect(card?.changePercent).toBeDefined()
    if ((card?.changePercent ?? 0) > 0) {
      expect(card?.changeIsGood).toBe(false)
    } else {
      expect(card?.changeIsGood).toBe(true)
    }
  })

  it('datum ne dolazi iz konfiguracije nego sa servera', async () => {
    // Konfiguracija pokušava da podmetne datum; server ga popunjava sam.
    const fixed = new Date('2026-03-16T10:00:00Z')
    const [a] = await loadDashboard(
      fakeDb([cardRow({ input: { date: '1999-01-01' } })], ENABLED),
      ctx,
      fixed,
    )
    const [b] = await loadDashboard(fakeDb([cardRow()], ENABLED), ctx, fixed)

    expect(a?.value).toBe(b?.value)
  })
})
