import { describe, expect, it } from 'vitest'
import {
  aging,
  dailySeries,
  monthlyHistory,
  outstanding,
  payablesFrom,
  salesSummaryFrom,
  stockFrom,
  topDebtorsFrom,
} from '@/core/connectors/impl/file/shape'

const NOW = new Date('2026-09-08T10:00:00Z')

describe('prodaja iz uvezene tabele', () => {
  const sales = [
    { doc_date: '2026-09-07', amount: '100000' }, // juče
    { doc_date: '2026-09-07', amount: '50000' },
    { doc_date: '2026-09-06', amount: '120000' }, // prekjuče
    { doc_date: '2026-09-01', amount: '80000' },
    { doc_date: '2026-08-07', amount: '200000' }, // prethodni mesec
  ]

  it('stavke istog dana se sabiraju', () => {
    const summary = salesSummaryFrom(sales, NOW, 'RSD')
    expect(summary.yesterday.total).toBe('150000.00')
  })

  /*
   * „Juče", ne „danas": dan koji je u toku nije uporediv ni sa čim, a prikazan
   * kao pad izgleda kao loša vest umesto kao nepotpun podatak.
   */
  it('poredi se juče sa prekjuče, ne sa danas', () => {
    const summary = salesSummaryFrom(sales, NOW, 'RSD')
    expect(summary.asOf).toBe('2026-09-07')
    expect(summary.yesterday.previousTotal).toBe('120000.00')
    expect(summary.yesterday.changePercent).toBe(25)
  })

  it('mesec se poredi sa ISTIM brojem dana prethodnog meseca', () => {
    // Sedam dana septembra prema prvih sedam dana avgusta — pun avgust bi uvek
    // izgledao veći i svaki početak meseca bi lažno prijavljivao pad.
    const summary = salesSummaryFrom(sales, NOW, 'RSD')
    expect(summary.monthToDate.total).toBe('350000.00')
    expect(summary.monthToDate.previousTotal).toBe('200000.00')
  })

  it('bez prethodnog perioda promena je nula, ne beskonačno', () => {
    const summary = salesSummaryFrom([{ doc_date: '2026-09-07', amount: '100' }], NOW, 'RSD')
    expect(summary.yesterday.changePercent).toBe(0)
  })

  /*
   * Dan bez ijedne stavke je NULA, ne izostavljen red. Preskočen dan bi
   * grafikon sabio i pomerio ostale, pa bi neradna nedelja izgledala kao da je
   * nije ni bilo.
   */
  it('dan bez prometa je nula u nizu, ne rupa', () => {
    const days = dailySeries(sales, NOW, 7)
    expect(days).toHaveLength(7)
    expect(days.at(-1)).toEqual({ date: '2026-09-07', total: '150000.00' })
    expect(days.find((d) => d.date === '2026-09-05')?.total).toBe('0.00')
  })

  it('mesečna istorija izostavlja tekući mesec', () => {
    const months = monthlyHistory(sales, NOW, 1)
    expect(months).toHaveLength(12)
    expect(months.some((m) => m.month === '2026-09')).toBe(false)
    expect(months.at(-1)?.month).toBe('2026-08')
    expect(months.at(-1)?.total).toBe('200000.00')
  })

  it('numeric kao string iz baze se sabira ispravno', () => {
    // PostgREST vraća `numeric` kao string, da ne izgubi preciznost.
    const summary = salesSummaryFrom([{ doc_date: '2026-09-07', amount: '1234.56' }], NOW, 'RSD')
    expect(summary.yesterday.total).toBe('1234.56')
  })
})

describe('potraživanja iz uvezene tabele', () => {
  const receivables = [
    { customer: 'Gradnja Plus', amount: '1000000', due_date: '2026-05-01' }, // 130 dana
    { customer: 'Gradnja Plus', amount: '500000', due_date: '2026-07-20' }, // 50 dana
    { customer: 'Metalac', amount: '300000', due_date: '2026-08-20' }, // 19 dana
    { customer: 'Alfa', amount: '200000', due_date: '2026-10-01' }, // još nije dospelo
  ]

  it('opsezi se slažu sa ukupnim iznosom', () => {
    const result = aging(receivables, NOW, 'RSD')
    const sum = result.buckets.reduce((s, b) => s + Number(b.amount), 0)
    // Nedospelo je van opsega kašnjenja, pa je zbir opsega manji od ukupnog —
    // i to je ispravno; ukupno obuhvata sve otvoreno.
    expect(Number(result.total)).toBe(2_000_000)
    expect(sum).toBe(1_800_000)
  })

  /*
   * Stavka koja još nije dospela ulazi u ukupno ali NE u dospelo. Da ulazi,
   * „dospelo" bi bilo jednako ukupnom — a to knjigovođa primeti prvi.
   */
  it('nedospelo se ne broji kao dospelo', () => {
    const result = aging(receivables, NOW, 'RSD')
    expect(Number(result.overdue)).toBe(1_800_000)
  })

  it('opseg preko 90 dana hvata najstariji dug', () => {
    const result = aging(receivables, NOW, 'RSD')
    const oldest = result.buckets.find((b) => b.toDays === null)
    expect(oldest?.amount).toBe('1000000.00')
    expect(oldest?.invoiceCount).toBe(1)
  })

  it('dužnici se grupišu po kupcu, sa najstarijim kašnjenjem', () => {
    const debtors = topDebtorsFrom(receivables, NOW, 'RSD')
    const gradnja = debtors.items.find((i) => i.customer === 'Gradnja Plus')
    expect(gradnja?.amount).toBe('1500000.00')
    expect(gradnja?.invoiceCount).toBe(2)
    expect(gradnja?.oldestOverdueDays).toBe(130)
  })

  it('kupac bez kašnjenja ima nula dana, ne negativan broj', () => {
    const debtors = topDebtorsFrom(receivables, NOW, 'RSD')
    expect(debtors.items.find((i) => i.customer === 'Alfa')?.oldestOverdueDays).toBe(0)
  })

  it('otvorene fakture se filtriraju po pragu kašnjenja', () => {
    expect(outstanding(receivables, NOW, 'RSD', 60).items).toHaveLength(1)
    expect(outstanding(receivables, NOW, 'RSD', 0).items).toHaveLength(3)
  })
})

describe('obaveze iz uvezene tabele', () => {
  const payables = [
    { supplier: 'Stakloplast', amount: '300000', due_date: '2026-09-02' }, // dospelo
    { supplier: 'Profil', amount: '450000', due_date: '2026-09-12' }, // za 4 dana
    { supplier: 'Logistika', amount: '180000', due_date: '2026-10-20' }, // daleko
  ]

  it('dospelo nosi negativan broj dana', () => {
    const result = payablesFrom(payables, NOW, 'RSD')
    expect(result.items[0]?.daysUntilDue).toBeLessThan(0)
  })

  it('u sedam dana ulazi i ono što je već dospelo', () => {
    // Dospela obaveza je hitnija od one koja tek dospeva; izostavljanje bi je
    // sakrilo baš iz iznosa koji se gleda pri planiranju plaćanja.
    const result = payablesFrom(payables, NOW, 'RSD')
    expect(Number(result.dueWithin7Days)).toBe(750_000)
    expect(Number(result.total)).toBe(930_000)
  })
})

describe('zalihe iz uvezene tabele', () => {
  it('pokrivenost se računa iz potrošnje, ne iz minimuma', () => {
    const items = stockFrom([
      { item: 'Profil', on_hand: '500', minimum: '100', average_daily_sales: '18', lead_time_days: 10 },
    ])
    expect(items[0]?.daysOfCover).toBe(28)
  })

  /*
   * Kada izvoz ne nosi potrošnju, pokrivenost je nula i artikal ne ulazi u
   * upozorenja. Izmišljanje potrošnje iz minimuma dalo bi broj koji izgleda
   * kao podatak a nije izveden ni iz čega.
   */
  it('bez potrošnje pokrivenost je nula, ne beskonačno', () => {
    const items = stockFrom([{ item: 'Retko', on_hand: '5', minimum: '2' }])
    expect(items[0]?.daysOfCover).toBe(0)
    expect(items[0]?.averageDailySales).toBe(0)
  })

  it('nedostajući rok isporuke ne obara red', () => {
    const items = stockFrom([{ item: 'X', on_hand: '10', average_daily_sales: '1' }])
    expect(items[0]?.leadTimeDays).toBe(0)
    expect(items[0]?.daysOfCover).toBe(10)
  })
})
