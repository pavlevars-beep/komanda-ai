import { describe, expect, it } from 'vitest'
import { parseToolInput, toolsFor } from '@/core/ai/tool-definitions'
import type { IntentKey } from '@/core/ai/question-matcher'

describe('spisak alata', () => {
  it('nastaje od namera koje su prosleđene, i ni od jedne druge', () => {
    const alati = toolsFor(['get_daily_sales', 'get_payables'])
    expect(alati.map((a) => a.name)).toEqual(['get_daily_sales', 'get_payables'])
  })

  it('svaki alat ima opis i šemu', () => {
    for (const alat of toolsFor(['get_daily_sales', 'get_top_debtors', 'get_headcount'])) {
      expect(alat.description.length).toBeGreaterThan(10)
      expect(alat.parameters).toHaveProperty('type', 'object')
    }
  })

  it('prazan spisak namera ne daje nijedan alat', () => {
    expect(toolsFor([])).toEqual([])
  })
})

/*
 * JSON shema je MOLBA modelu da pošalje ispravan oblik; Zod je provera da je
 * stvarno poslao. Sve ispod proverava tu drugu.
 */
describe('provera ulaza koji model pošalje', () => {
  it('ispravan datum prolazi', () => {
    expect(parseToolInput('get_daily_sales', { date: '2026-09-14' })).toEqual({
      ok: true,
      input: { date: '2026-09-14' },
    })
  })

  it('besmislen datum se odbija sa razlogom', () => {
    const r = parseToolInput('get_daily_sales', { date: 'juče' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('GGGG-MM-DD')
  })

  it('datum kao broj se odbija', () => {
    expect(parseToolInput('get_daily_sales', { date: 20260914 }).ok).toBe(false)
  })

  it('izostavljen obavezan parametar se odbija', () => {
    expect(parseToolInput('get_daily_sales', {}).ok).toBe(false)
  })

  it('podrazumevana vrednost se popunjava kada je model izostavi', () => {
    const r = parseToolInput('get_top_debtors', {})
    expect(r).toEqual({ ok: true, input: { limit: 10 } })
  })

  it('obrnut opseg se odbija', () => {
    const r = parseToolInput('get_sales_by_period', { from: '2026-09-30', to: '2026-09-01' })
    expect(r.ok).toBe(false)
  })

  /*
   * Model ume da na „oduvek" pošalje opseg od deset godina. Takav upit ne daje
   * uvid nego čekanje, pa se granica kaže naglas umesto da se tiho poseče.
   */
  it('predugačak opseg se odbija sa razlogom, ne seče se tiho', () => {
    const r = parseToolInput('get_sales_by_period', { from: '2016-01-01', to: '2026-01-01' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('730')
  })

  it('broj van granica se odbija', () => {
    expect(parseToolInput('get_top_debtors', { limit: 5000 }).ok).toBe(false)
    expect(parseToolInput('get_payables', { withinDays: 0 }).ok).toBe(false)
  })

  it('alat bez parametara prima prazno i ništa ne traži', () => {
    expect(parseToolInput('get_headcount', {})).toEqual({ ok: true, input: {} })
    expect(parseToolInput('get_inventory_alerts', undefined)).toEqual({ ok: true, input: {} })
  })

  it('svaka namera ima šemu — nijedna ne prolazi neproverena', () => {
    const sve: IntentKey[] = [
      'get_financial_summary',
      'get_daily_sales',
      'get_sales_by_period',
      'get_outstanding_invoices',
      'get_top_debtors',
      'get_payables',
      'get_headcount',
      'get_inventory_alerts',
      'get_stock_status',
    ]
    for (const namera of sve) {
      expect(() => parseToolInput(namera, {})).not.toThrow()
    }
  })
})
