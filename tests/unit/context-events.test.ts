import { describe, expect, it } from 'vitest'
import {
  annotateMonths,
  compareYearOverYear,
  forecastExclusions,
  overlapsMonth,
  type ContextEvent,
} from '@/core/context/events'

function event(overrides: Partial<ContextEvent> = {}): ContextEvent {
  return {
    id: 'e1',
    kind: 'one_off_project',
    title: 'Veliki jednokratni projekat',
    startsOn: '2025-03-01',
    endsOn: '2025-04-30',
    revenueImpact: 32_000_000,
    excludeFromBaseline: true,
    keepInTotals: true,
    excludeFromForecast: true,
    annotateComparison: true,
    ...overrides,
  }
}

/*
 * Slučaj iz razgovora sa klijentom, doslovno.
 *
 * Firma je imala veliki jednokratni projekat u martu i aprilu 2025, vredan
 * 32M. Bez konteksta, mart 2026. prijavljuje pad — a nikakav pad se nije
 * dogodio; poređenje ide sa nečim što se ne ponavlja.
 */
describe('jednokratni projekat ne sme da napravi lažni pad', () => {
  const months = [
    { month: '2025-03', total: '40000000' }, // 24M redovno + 16M projekat
    { month: '2025-04', total: '40000000' },
    { month: '2026-03', total: '25000000' },
    { month: '2026-04', total: '26000000' },
  ]

  it('izvorna vrednost ostaje netaknuta', () => {
    const annotated = annotateMonths(months, [event()])
    expect(annotated.find((m) => m.month === '2025-03')?.total).toBe(40_000_000)
  })

  it('osnovica isključuje uticaj, raspoređen po mesecima trajanja', () => {
    const annotated = annotateMonths(months, [event()])
    // 32M kroz dva meseca = 16M po mesecu.
    expect(annotated.find((m) => m.month === '2025-03')?.baseline).toBe(24_000_000)
    expect(annotated.find((m) => m.month === '2025-04')?.baseline).toBe(24_000_000)
  })

  it('bez konteksta poređenje pokazuje pad, sa kontekstom rast', () => {
    const bez = compareYearOverYear(annotateMonths(months, []), '2026-03')
    expect(bez?.rawChangePercent).toBe(-37.5)
    expect(bez?.adjustedChangePercent).toBeUndefined()

    const sa = compareYearOverYear(annotateMonths(months, [event()]), '2026-03')
    // Ista izvorna brojka i dalje stoji — ne krije se.
    expect(sa?.rawChangePercent).toBe(-37.5)
    // A poređenje sa osnovicom pokazuje pravu sliku: blag rast.
    expect(sa?.adjustedChangePercent).toBeCloseTo(4.2, 1)
  })

  /*
   * Oba procenta se prikazuju kada se razlikuju. Samo prilagođeni bi sakrio da
   * je poređenje dirano; samo izvorni vraća lažni pad. Jedino oba, jedno pored
   * drugog, mogu da se provere.
   */
  it('poređenje koje je dirano nosi vidljivu napomenu', () => {
    const sa = compareYearOverYear(annotateMonths(months, [event()]), '2026-03')
    expect(sa?.needsNote).toBe(true)
    expect(sa?.previous?.adjusted).toBe(true)
  })

  it('kada nema šta da se prilagodi, drugi procenat izostaje', () => {
    const annotated = annotateMonths(months, [event({ excludeFromBaseline: false })])
    const c = compareYearOverYear(annotated, '2026-03')
    expect(c?.adjustedChangePercent).toBeUndefined()
    // Napomena ipak ostaje: događaj postoji i tiče se ovog poređenja.
    expect(c?.needsNote).toBe(true)
  })
})

describe('preklapanje perioda', () => {
  it('događaj koji još traje pokriva i tekući mesec', () => {
    const open = event({ startsOn: '2025-01-01', endsOn: null })
    expect(overlapsMonth(open, '2026-09')).toBe(true)
  })

  it('poslednji dan meseca se računa kao preklapanje', () => {
    const e = event({ startsOn: '2025-03-31', endsOn: '2025-03-31' })
    expect(overlapsMonth(e, '2025-03')).toBe(true)
    expect(overlapsMonth(e, '2025-02')).toBe(false)
    expect(overlapsMonth(e, '2025-04')).toBe(false)
  })

  it('februar u prestupnoj godini ima 29 dana', () => {
    const e = event({ startsOn: '2024-02-29', endsOn: '2024-02-29' })
    expect(overlapsMonth(e, '2024-02')).toBe(true)
  })
})

describe('granice i pogrešan unos', () => {
  /*
   * Deo perioda van posmatranog niza se ne oduzima. Da se uticaj deli samo na
   * mesece koji su u nizu, mesec na ivici bi dobio uticaj koji mu ne pripada —
   * i to bi ostalo neprimećeno jer se sabira sa stvarnim padom.
   */
  it('uticaj se deli samo na mesece unutar posmatranog niza', () => {
    const months = [{ month: '2025-04', total: '40000000' }]
    const annotated = annotateMonths(months, [event()])
    // Samo april je u nizu, pa ceo uticaj pada na njega.
    expect(annotated[0]?.baseline).toBe(8_000_000)
  })

  it('procena veća od prihoda ne daje negativnu osnovicu', () => {
    const months = [{ month: '2025-03', total: '5000000' }]
    const annotated = annotateMonths(months, [
      event({ startsOn: '2025-03-01', endsOn: '2025-03-31', revenueImpact: 32_000_000 }),
    ])
    expect(annotated[0]?.baseline).toBe(0)
  })

  it('događaj bez procene uticaja se beleži ali ne menja osnovicu', () => {
    const months = [{ month: '2025-03', total: '40000000' }]
    const annotated = annotateMonths(months, [event({ revenueImpact: null })])
    expect(annotated[0]?.baseline).toBe(40_000_000)
    expect(annotated[0]?.adjusted).toBe(false)
    expect(annotated[0]?.events).toHaveLength(1)
  })

  it('nepostojeći mesec u poređenju vraća prazno umesto da puca', () => {
    expect(compareYearOverYear(annotateMonths([], []), '2026-03')).toBeNull()
  })

  it('poređenje bez prethodne godine ne izmišlja procenat', () => {
    const annotated = annotateMonths([{ month: '2026-03', total: '25000000' }], [])
    const c = compareYearOverYear(annotated, '2026-03')
    expect(c?.previous).toBeUndefined()
    expect(c?.rawChangePercent).toBeUndefined()
  })
})

describe('prognoza i osnovica su odvojene odluke', () => {
  /*
   * Firma može da želi da izuzetan mesec OSTANE u poređenju — da se vidi šta
   * se dogodilo — a da ne uđe u predviđanje sledećeg decembra. Jedan režim bi
   * je terao da izabere jedno.
   */
  it('mesec može da uđe u osnovicu a da ostane van prognoze', () => {
    const months = [{ month: '2025-12', total: '60000000' }]
    const annotated = annotateMonths(months, [
      event({
        startsOn: '2025-12-01',
        endsOn: '2025-12-31',
        excludeFromBaseline: false,
        excludeFromForecast: true,
      }),
    ])

    expect(annotated[0]?.adjusted).toBe(false)
    expect(forecastExclusions(annotated)).toEqual(['2025-12'])
  })

  it('bez događaja nema izuzimanja iz prognoze', () => {
    expect(forecastExclusions(annotateMonths([{ month: '2025-12', total: '1' }], []))).toEqual([])
  })
})
