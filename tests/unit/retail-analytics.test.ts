import { describe, expect, it } from 'vitest'
import {
  abcAnalysis,
  deadStock,
  networkStock,
  seasonalComparison,
  shortageRisks,
  volumeWithoutMargin,
} from '@/core/retail/analytics'
import type { ProductLine } from '@/core/retail/network'
import { DEFAULT_BUSINESS_RULES } from '@/core/rules/business-rules'
import { demoNetwork } from '@/core/retail/demo-network'

const RULES = DEFAULT_BUSINESS_RULES
const NOW = new Date('2026-09-19T08:00:00Z')

function line(over: Partial<ProductLine> & { sku: string }): ProductLine {
  return {
    name: over.sku,
    unit: 'kom',
    soldQuantity: 0,
    revenue: '0',
    marginPercent: 20,
    onHand: 0,
    stockValue: '0',
    averageDailySales: 0,
    leadTimeDays: 0,
    lastSoldDaysAgo: 0,
    ...over,
  }
}

describe('ABC raspodela', () => {
  it('prvi artikal je uvek A, ma koliko sam nosio', () => {
    /*
     * Razred se određuje po kumulativi PRE artikla. Da se gleda posle njega,
     * artikal koji sam nosi 85% prometa upao bi u razred B — besmislica koju
     * čovek primeti odmah, a formula ne.
     */
    const r = abcAnalysis([
      line({ sku: 'div', revenue: '8500' }),
      line({ sku: 'sitno', revenue: '1500' }),
    ])
    expect(r.lines[0]?.abc).toBe('A')
    expect(r.lines[0]?.product.sku).toBe('div')
  })

  it('granice su 80 i 95 posto kumulative', () => {
    const r = abcAnalysis([
      line({ sku: 'a1', revenue: '500' }),
      line({ sku: 'a2', revenue: '300' }),
      line({ sku: 'b1', revenue: '150' }),
      line({ sku: 'c1', revenue: '50' }),
    ])
    const razred = Object.fromEntries(r.lines.map((l) => [l.product.sku, l.abc]))
    expect(razred).toEqual({ a1: 'A', a2: 'A', b1: 'B', c1: 'C' })
  })

  it('udeli se sabiraju u sto', () => {
    const r = abcAnalysis([
      line({ sku: 'x', revenue: '700' }),
      line({ sku: 'y', revenue: '300' }),
    ])
    expect(r.lines.at(-1)?.cumulativeShare).toBeCloseTo(100, 6)
  })

  it('prazan asortiman ne deli nulom', () => {
    expect(abcAnalysis([]).lines).toEqual([])
    expect(abcAnalysis([line({ sku: 'x', revenue: '0' })]).aCount).toBe(0)
  })
})

describe('mrtav novac', () => {
  it('hvata zalihu bez prodaje duže od praga', () => {
    const r = deadStock(
      [
        line({ sku: 'spora', onHand: 40, stockValue: '120000', lastSoldDaysAgo: 210 }),
        line({ sku: 'brza', onHand: 90, stockValue: '80000', lastSoldDaysAgo: 2 }),
      ],
      RULES,
    )
    expect(r.items.map((i) => i.sku)).toEqual(['spora'])
    expect(r.value).toBe('120000.00')
    expect(r.shareOfStock).toBe(60)
  })

  /*
   * Artikal bez zalihe ne može da bude mrtav novac ma koliko se ne prodavao —
   * nema para koje stoje. Bez ove provere bi svaki ugašen artikal zauvek
   * visio u spisku.
   */
  it('artikal bez zalihe nije mrtav novac', () => {
    const r = deadStock([line({ sku: 'ugasen', onHand: 0, lastSoldDaysAgo: 400 })], RULES)
    expect(r.items).toEqual([])
  })

  it('prag dolazi iz pravila firme, ne iz koda', () => {
    const product = line({ sku: 'x', onHand: 10, stockValue: '1000', lastSoldDaysAgo: 100 })
    expect(deadStock([product], { ...RULES, stockOverstockDays: 180 }).items).toHaveLength(0)
    expect(deadStock([product], { ...RULES, stockOverstockDays: 90 }).items).toHaveLength(1)
  })
})

describe('rizik od nestašice', () => {
  /*
   * Poređenje je sa ROKOM ISPORUKE, ne sa fiksnim brojem dana. Zaliha za deset
   * dana je dovoljna ako roba stiže za tri, a kritična ako stiže za dvadeset.
   */
  it('isti broj dana zalihe je i dobar i loš, zavisno od roka isporuke', () => {
    const brzaIsporuka = line({ sku: 'brza', onHand: 10, averageDailySales: 1, leadTimeDays: 3 })
    const sporaIsporuka = line({ sku: 'spora', onHand: 10, averageDailySales: 1, leadTimeDays: 20 })

    expect(shortageRisks([brzaIsporuka], RULES)).toHaveLength(0)
    expect(shortageRisks([sporaIsporuka], RULES)).toHaveLength(1)
  })

  it('artikal bez potrošnje se preskače, ne deli nulom', () => {
    expect(shortageRisks([line({ sku: 'mrtav', onHand: 5, averageDailySales: 0 })], RULES)).toEqual(
      [],
    )
  })

  it('najhitnije stoji prvo', () => {
    const r = shortageRisks(
      [
        line({ sku: 'malo', onHand: 9, averageDailySales: 1, leadTimeDays: 10 }),
        line({ sku: 'mnogo', onHand: 1, averageDailySales: 1, leadTimeDays: 30 }),
      ],
      RULES,
    )
    expect(r[0]?.product.sku).toBe('mnogo')
  })
})

describe('promet bez zarade', () => {
  it('nalazi artikal koji mnogo prodaje a malo zarađuje', () => {
    const r = volumeWithoutMargin(
      [
        line({ sku: 'vuce-slabo', revenue: '600000', marginPercent: 9 }),
        line({ sku: 'vuce-dobro', revenue: '300000', marginPercent: 26 }),
        line({ sku: 'sitno', revenue: '1000', marginPercent: 4 }),
      ],
      20,
    )
    expect(r.map((x) => x.product.sku)).toEqual(['vuce-slabo'])
    expect(r[0]?.pointsBelow).toBe(11)
  })

  /*
   * Artikal sa slabom maržom i bez prometa nije problem vredan pažnje nego šum
   * u spisku — zato se gleda samo gornja trećina po prometu.
   */
  it('sitan artikal sa slabom maržom se ne prijavljuje', () => {
    const r = volumeWithoutMargin(
      [
        line({ sku: 'a', revenue: '900000', marginPercent: 22 }),
        line({ sku: 'b', revenue: '500000', marginPercent: 21 }),
        line({ sku: 'c', revenue: '300000', marginPercent: 20 }),
        line({ sku: 'sitno-lose', revenue: '500', marginPercent: 2 }),
      ],
      20,
    )
    expect(r.map((x) => x.product.sku)).not.toContain('sitno-lose')
  })

  it('sitno odstupanje od proseka nije nalaz', () => {
    const r = volumeWithoutMargin([line({ sku: 'x', revenue: '100000', marginPercent: 19 })], 20)
    expect(r).toEqual([])
  })
})

describe('poređenje sa istim mesecom prošle godine', () => {
  it('poredi se sa istim mesecom, ne sa prethodnim', () => {
    const r = seasonalComparison([
      { month: '2025-09', total: '1000', marginPercent: 20 },
      { month: '2026-08', total: '5000', marginPercent: 20 },
      { month: '2026-09', total: '1200', marginPercent: 20 },
    ])
    const sept = r.find((x) => x.month === '2026-09')
    expect(sept?.sameMonthLastYear).toBe('1000')
    expect(sept?.yearOverYear).toBe(20)
  })

  it('mesec bez para prošle godine nema poređenje, ne nulu', () => {
    const r = seasonalComparison([{ month: '2026-03', total: '900', marginPercent: 20 }])
    expect(r[0]?.yearOverYear).toBeUndefined()
    expect(r[0]?.sameMonthLastYear).toBeUndefined()
  })
})

describe('zaliha cele mreže', () => {
  it('ne sabira preko valuta, ali sabira broj artikala u riziku', () => {
    const network = demoNetwork('europrofil', NOW)
    const stock = networkStock(network, RULES)

    expect(stock.map((s) => s.currency).sort()).toEqual(['BAM', 'EUR', 'RSD'])
    for (const s of stock) expect(Number(s.value)).toBeGreaterThan(0)
  })
})

describe('demo mora da nosi nalaze', () => {
  /*
   * Demo bez ijednog nalaza je lep prazan ekran. Ove tvrdnje čuvaju da svaka
   * analiza ima šta da pokaže — inače se na sastanku otvori ekran koji kaže
   * „sve je u redu" i ne dokaže ništa.
   */
  const network = demoNetwork('europrofil', NOW)
  const bigOne = network.find((l) => l.id === 'bg-obrenovacki')!

  it('ima mrtvog novca', () => {
    const dead = deadStock(bigOne.products, RULES)
    expect(dead.items.length).toBeGreaterThan(0)
    expect(Number(dead.value)).toBeGreaterThan(0)
  })

  it('ima artikala kojima preti nestašica', () => {
    expect(shortageRisks(bigOne.products, RULES).length).toBeGreaterThan(0)
  })

  it('ima artikala koji mnogo prodaju a malo zarađuju', () => {
    expect(volumeWithoutMargin(bigOne.products, bigOne.marginPercent).length).toBeGreaterThan(0)
  })

  it('ABC je neravnomeran, kako i treba da bude', () => {
    const abc = abcAnalysis(bigOne.products)
    // Manjina artikala nosi većinu prometa — inače ABC nema šta da kaže.
    expect(abc.aShareOfCatalog).toBeLessThan(60)
    expect(abc.aCount).toBeGreaterThan(0)
  })

  it('istorija nosi dve godine, pa se sezona može uporediti', () => {
    expect(bigOne.history.length).toBeGreaterThanOrEqual(24)
    const sezona = seasonalComparison(bigOne.history)
    expect(sezona.filter((s) => s.yearOverYear !== undefined).length).toBeGreaterThan(6)
  })

  it('tekući mesec nije u istoriji — nepotpun pored punih izgleda kao pad', () => {
    expect(bigOne.history.map((h) => h.month)).not.toContain('2026-09')
  })
})
