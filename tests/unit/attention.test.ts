import { describe, expect, it } from 'vitest'
import { whatNeedsAttention, type AttentionInput } from '@/core/brief/attention'
import { DEFAULT_BUSINESS_RULES, resolveBusinessRules } from '@/core/rules/business-rules'
import { briefSections } from '@/core/brief/focus'
import type { Permission } from '@/core/auth/permissions'

const rules = DEFAULT_BUSINESS_RULES

function run(input: Omit<AttentionInput, 'rules'> & { rules?: typeof rules }) {
  return whatNeedsAttention({ rules, ...input })
}

describe('normalno ćuti', () => {
  it('bez ijednog odstupanja spisak je prazan', () => {
    const items = run({
      receivables: { total: '100', overdue: '0', currency: 'RSD', buckets: [
        { fromDays: 0, toDays: 30, amount: '100', invoiceCount: 1 },
        { fromDays: 30, toDays: 60, amount: '0', invoiceCount: 0 },
        { fromDays: 60, toDays: 90, amount: '0', invoiceCount: 0 },
        { fromDays: 90, toDays: null, amount: '0', invoiceCount: 0 },
      ] },
      stock: [
        // 500 komada, 18 dnevno → 27 dana. Iznad praga upozorenja, ispod
        // praga prekomerne zalihe: zdravo, i ćuti.
        { item: 'A', onHand: 500, minimum: 100, averageDailySales: 18, daysOfCover: 27, leadTimeDays: 10 },
      ],
      payables: [],
      sales: {
        currency: 'RSD',
        last7Days: { total: '1000', changePercent: 3 },
        monthToDate: { total: '4000', changePercent: 8.4 },
      },
    })

    expect(items).toEqual([])
  })

  /*
   * Primer iz brifa, doslovno: artikal sa pet komada koji se prodaje dvaput
   * GODIŠNJE nije problem, iako je apsolutno stanje mnogo niže od zdravog
   * artikla iznad. Po samom broju izgleda obrnuto.
   */
  it('nizak apsolutni broj bez potrošnje ne traži pažnju', () => {
    const items = run({
      stock: [
        { item: 'Retko traženo', onHand: 5, minimum: 2, averageDailySales: 0.0055, daysOfCover: 909, leadTimeDays: 30 },
      ],
    })

    // Jedina stavka je moguća prekomerna zaliha — obaveštenje, ne hitnost.
    expect(items.map((i) => [i.kind, i.severity])).toEqual([['stock_overstock', 'info']])
  })
})

describe('potraživanja', () => {
  const buckets = [
    { fromDays: 0, toDays: 30, amount: '1000000', invoiceCount: 3 },
    { fromDays: 30, toDays: 60, amount: '500000', invoiceCount: 2 },
    { fromDays: 60, toDays: 90, amount: '2000000', invoiceCount: 4 },
    { fromDays: 90, toDays: null, amount: '8400000', invoiceCount: 5 },
  ]

  it('preko kritičnog praga je kritično, sa iznosom i brojem faktura', () => {
    const items = run({
      receivables: { total: '11900000', overdue: '10900000', currency: 'RSD', buckets },
    })

    const critical = items.find((i) => i.kind === 'receivables_overdue' && i.severity === 'critical')
    expect(critical?.params).toMatchObject({ amount: 8_400_000, count: 5, days: 90 })
  })

  /*
   * Isti novac ne sme da se prijavi dvaput. Bez izuzimanja kritičnog dela iz
   * srednjeg opsega, iznos preko 90 dana bi ušao i u upozorenje — pa bi zbir
   * na ekranu bio veći od stvarnog duga.
   */
  it('kritični iznos se ne broji ponovo u upozorenju', () => {
    const items = run({
      receivables: { total: '11900000', overdue: '10900000', currency: 'RSD', buckets },
    })

    const warning = items.find((i) => i.kind === 'receivables_overdue' && i.severity === 'warning')
    expect(warning?.params.amount).toBe(2_000_000)
  })

  it('promena praga u pravilima stvarno menja šta se prijavljuje', () => {
    const strict = resolveBusinessRules({ receivableWarningDays: 30, receivableCriticalDays: 60 })
    const items = whatNeedsAttention({
      rules: strict,
      receivables: { total: '11900000', overdue: '10900000', currency: 'RSD', buckets },
    })

    const critical = items.find((i) => i.severity === 'critical')
    // Sada su i opseg 60–90 i preko 90 kritični: 2.0M + 8.4M.
    expect(critical?.params.amount).toBe(10_400_000)
  })

  it('veliki pojedinačni dužnik se izdvaja', () => {
    const items = run({
      debtors: [
        { customer: 'Gradnja Plus', amount: '2400000', currency: 'RSD', oldestOverdueDays: 117 },
        { customer: 'Sitni Kupac', amount: '40000', currency: 'RSD', oldestOverdueDays: 200 },
      ],
    })

    const large = items.filter((i) => i.kind === 'receivables_large')
    expect(large).toHaveLength(1)
    expect(large[0]?.params).toMatchObject({ name: 'Gradnja Plus', days: 117 })
  })
})

describe('zalihe', () => {
  it('pokrivenost ispod kritičnog praga je kritična', () => {
    const items = run({
      stock: [
        { item: 'Profil PVC', onHand: 40, minimum: 120, averageDailySales: 10, daysOfCover: 4, leadTimeDays: 5 },
      ],
    })

    expect(items[0]?.kind).toBe('stock_critical')
    expect(items[0]?.evidence).toContainEqual({ label: 'evidence.coverage', value: 4 })
  })

  /*
   * Pokrivenost od 21 dan je IZNAD praga upozorenja od 14, pa bi po samom
   * pragu ova zaliha ćutala. Ali isporuka stiže tek za 30 dana, dakle devet
   * dana pošto se zaliha istroši.
   *
   * To je jedina vrsta problema sa zalihom koja se ne može popraviti kasnije,
   * i golo stanje je ne pokazuje.
   */
  it('zaliha koja se istroši pre isporuke je kritična i kada je iznad praga', () => {
    const items = run({
      stock: [
        { item: 'Okov', onHand: 420, minimum: 100, averageDailySales: 20, daysOfCover: 21, leadTimeDays: 30 },
      ],
    })

    expect(items[0]?.kind).toBe('stock_critical')
    expect(items[0]?.evidence).toContainEqual({ label: 'evidence.leadTime', value: 30 })
  })

  it('artikal bez potrošnje se preskače umesto da daje beskonačnu pokrivenost', () => {
    const items = run({
      stock: [
        { item: 'Mrtva zaliha', onHand: 900, minimum: 10, averageDailySales: 0, daysOfCover: 0, leadTimeDays: 10 },
      ],
    })

    expect(items).toEqual([])
  })
})

describe('obaveze', () => {
  it('već dospelo je kritično, a ono što tek dospeva se prijavljuje odvojeno', () => {
    const items = run({
      payables: [
        { supplier: 'Stakloplast', amount: '300000', currency: 'RSD', dueDate: '2026-08-28', daysUntilDue: -6 },
        { supplier: 'Profil Sistem', amount: '1500000', currency: 'RSD', dueDate: '2026-09-05', daysUntilDue: 2 },
        { supplier: 'Logistika', amount: '180000', currency: 'RSD', dueDate: '2026-10-10', daysUntilDue: 37 },
      ],
    })

    const kinds = items.filter((i) => i.kind === 'payables_due')
    expect(kinds.map((i) => i.severity)).toEqual(['critical', 'warning'])
    // Obaveza za 37 dana je van horizonta i ne ulazi ni u jedan iznos.
    expect(kinds[1]?.params.amount).toBe(1_500_000)
  })
})

describe('prodaja', () => {
  it('pad preko praga otvara upozorenje, dvostruki pad je kritičan', () => {
    const items = run({
      sales: {
        currency: 'RSD',
        last7Days: { total: '1000', changePercent: -16 },
        monthToDate: { total: '4000', changePercent: -31 },
      },
    })

    const drops = items.filter((i) => i.kind === 'sales_drop')
    expect(drops).toHaveLength(2)
    expect(drops.find((d) => d.params.period === 'month')?.severity).toBe('critical')
    expect(drops.find((d) => d.params.period === 'week')?.severity).toBe('warning')
  })

  it('rast ne otvara ništa', () => {
    const items = run({
      sales: {
        currency: 'RSD',
        last7Days: { total: '1000', changePercent: 22 },
        monthToDate: { total: '4000', changePercent: 8.4 },
      },
    })
    expect(items).toEqual([])
  })
})

describe('redosled', () => {
  it('kritično uvek stoji iznad upozorenja i obaveštenja', () => {
    const items = run({
      sales: {
        currency: 'RSD',
        last7Days: { total: '1', changePercent: -16 },
        monthToDate: { total: '1', changePercent: -40 },
      },
      stock: [
        { item: 'Prekomerno', onHand: 9000, minimum: 10, averageDailySales: 1, daysOfCover: 9000, leadTimeDays: 5 },
      ],
    })

    const order = items.map((i) => i.severity)
    expect(order).toEqual([...order].sort((a, b) =>
      ({ critical: 0, warning: 1, info: 2 })[a] - ({ critical: 0, warning: 1, info: 2 })[b]))
    expect(order[0]).toBe('critical')
    expect(order.at(-1)).toBe('info')
  })
})

describe('poslovna pravila', () => {
  it('nepoznat ključ se odbacuje, poznat se primenjuje', () => {
    const resolved = resolveBusinessRules({ stockWarningDays: 21, izmisljeno: true })
    expect(resolved.stockWarningDays).toBe(21)
    expect(resolved).not.toHaveProperty('izmisljeno')
  })

  /*
   * Svaka vrednost može da bude u dozvoljenom opsegu, a par da bude besmislen.
   * Kritično kašnjenje kraće od upozorenja znači da srednja kategorija nikad
   * ne bi postojala — a to se na ekranu vidi samo kao „upozorenja su prestala".
   */
  it('međusobno nedosledna pravila se odbijaju u celini', () => {
    expect(resolveBusinessRules({ receivableWarningDays: 90, receivableCriticalDays: 60 })).toEqual(
      DEFAULT_BUSINESS_RULES,
    )
    expect(resolveBusinessRules({ stockCriticalDays: 30, stockWarningDays: 14 })).toEqual(
      DEFAULT_BUSINESS_RULES,
    )
  })

  it('neispravna vrednost ne prolazi delimično', () => {
    expect(resolveBusinessRules({ stockWarningDays: -5 })).toEqual(DEFAULT_BUSINESS_RULES)
    expect(resolveBusinessRules({ salesDropPercent: 15 })).toEqual(DEFAULT_BUSINESS_RULES)
  })
})

describe('redosled brifa po ulozi', () => {
  const all: Permission[] = [
    'view_sales',
    'view_financial_data',
    'view_inventory',
  ]

  it('nabavci su zalihe prve, prodaji prodaja', () => {
    expect(briefSections('procurement', all)[0]).toBe('stock')
    expect(briefSections('sales', all)[0]).toBe('sales')
    expect(briefSections('finance', all)[0]).toBe('receivables')
  })

  it('svaka rola vidi SVE odeljke, samo drugim redom', () => {
    const roles = ['client_owner', 'manager', 'sales', 'finance', 'procurement']
    for (const role of roles) {
      expect([...briefSections(role, all)].sort()).toEqual(
        ['debtors', 'payables', 'receivables', 'sales', 'stock'],
      )
    }
  })

  /*
   * Redosled ne sme da bude zaštita. Odeljak nestaje zato što korisnik nema
   * PRAVO, ne zato što ga rola ne stavlja visoko — inače bi se zaštita mogla
   * zaobići preuređivanjem spiska.
   */
  it('bez prava odeljak nestaje, bez obzira na rolu', () => {
    expect(briefSections('client_owner', ['view_sales'])).toEqual(['sales'])
    expect(briefSections('finance', ['view_inventory'])).toEqual(['stock'])
    expect(briefSections('procurement', [])).toEqual([])
  })

  it('nepoznata rola dobija širi, ne uži redosled', () => {
    expect(briefSections('nova_rola_klijenta', all)).toEqual(
      briefSections('client_owner', all),
    )
    // Osoblje u sesiji pristupa nema rolu u organizaciji klijenta.
    expect(briefSections(null, all)).toEqual(briefSections('client_owner', all))
  })
})
