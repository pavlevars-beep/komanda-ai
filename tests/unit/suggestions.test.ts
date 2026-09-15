import { describe, expect, it } from 'vitest'
import { suggestQuestions } from '@/core/ai/suggestions'
import type { AttentionItem } from '@/core/brief/attention'
import type { IntentKey } from '@/core/ai/question-matcher'

const SVE: readonly IntentKey[] = [
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

function stavka(kind: AttentionItem['kind'], params = {}): AttentionItem {
  return { kind, severity: 'warning', params, evidence: [] }
}

describe('predlozi pitanja', () => {
  it('bez ijedne stavke nudi uobičajena pitanja', () => {
    const s = suggestQuestions({ attention: [], answerable: SVE })
    expect(s).toHaveLength(4)
    expect(s.every((x) => !x.grounded)).toBe(true)
    expect(s[0]?.key).toBe('salesYesterday')
  })

  /*
   * Stavka koja traži pažnju je pitanje koje rukovodilac ionako ima. Zato ide
   * ispred uobičajenih, a redosled ozbiljnosti je već odlučen u motoru pažnje.
   */
  it('ono što traži pažnju ide ispred uobičajenog', () => {
    const s = suggestQuestions({
      attention: [stavka('stock_critical'), stavka('receivables_overdue')],
      answerable: SVE,
    })
    expect(s[0]).toMatchObject({ key: 'stockRunningOut', grounded: true })
    expect(s[1]).toMatchObject({ key: 'overdueDebtors', grounded: true })
    expect(s[2]?.grounded).toBe(false)
  })

  it('brojevi iz stavke se prenose u predlog', () => {
    const s = suggestQuestions({
      attention: [stavka('receivables_overdue', { days: 90, amount: '1200000' })],
      answerable: SVE,
    })
    expect(s[0]?.params).toMatchObject({ days: 90 })
  })

  /*
   * Tri dospela računa ne daju tri skoro ista predloga. Spisak od deset
   * predloga je meni, a meni se ne čita nego preskače.
   */
  it('više stavki iste vrste daje jedan predlog', () => {
    const s = suggestQuestions({
      attention: [
        stavka('receivables_overdue'),
        stavka('receivables_overdue'),
        stavka('receivables_overdue'),
      ],
      answerable: SVE,
    })
    expect(s.filter((x) => x.key === 'overdueDebtors')).toHaveLength(1)
  })

  it('dve vrste zaliha vode na isto pitanje, pa se nude jednom', () => {
    const s = suggestQuestions({
      attention: [stavka('stock_critical'), stavka('stock_low')],
      answerable: SVE,
    })
    expect(s.filter((x) => x.key === 'stockRunningOut')).toHaveLength(1)
  })

  it('ne nudi se više od granice', () => {
    const s = suggestQuestions({ attention: [], answerable: SVE, limit: 2 })
    expect(s).toHaveLength(2)
  })
})

/*
 * Najvažnije pravilo modula. Ponuđeno pitanje je OBEĆANJE: kada se na njega
 * dobije „ne mogu da odgovorim", korisnik ne zaključi da nema prava nego da
 * alat ne radi — i prestane da proba i ono što radi.
 */
describe('predlog na koji se ne može odgovoriti se ne nudi', () => {
  it('namera koja nije dostupna se preskače, i kada stavka postoji', () => {
    const s = suggestQuestions({
      attention: [stavka('receivables_overdue')],
      answerable: ['get_daily_sales'],
    })
    expect(s.map((x) => x.intent)).toEqual(['get_daily_sales'])
  })

  it('bez ijedne dostupne namere nema nijednog predloga', () => {
    const s = suggestQuestions({
      attention: [stavka('stock_critical'), stavka('payables_due')],
      answerable: [],
    })
    expect(s).toEqual([])
  })

  it('uobičajena pitanja se takođe filtriraju po dostupnosti', () => {
    const s = suggestQuestions({ attention: [], answerable: ['get_payables'] })
    expect(s).toHaveLength(1)
    expect(s[0]?.key).toBe('payablesWeek')
  })
})
