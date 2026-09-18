import { describe, expect, it } from 'vitest'
import {
  averageMargin,
  bubbleRadius,
  changePercent,
  marginStep,
  networkTotals,
  type LocationPerformance,
} from '@/core/retail/network'
import { demoNetwork, DEMO_LOCATIONS } from '@/core/retail/demo-network'

const NOW = new Date('2026-09-18T08:00:00Z')

function place(
  id: string,
  currency: string,
  monthToDate: string,
  marginPercent: number,
): LocationPerformance {
  return {
    id,
    city: id,
    label: id,
    country: 'RS',
    longitude: 20,
    latitude: 44,
    currency,
    monthToDate,
    previousPeriod: '0',
    marginPercent,
    transactions: 0,
    topProducts: [],
  }
}

describe('zbirovi mreže', () => {
  /*
   * Ovo je razlog zbog kojeg funkcija uopšte postoji. Dinari, marke i evri
   * nemaju zajednički zbir bez kursa na dan, a kurs nemamo iz proverenog
   * izvora — pa sabrana cifra ne bi bila podatak nego izmišljen broj.
   */
  it('ne sabira preko valuta', () => {
    const totals = networkTotals([
      place('a', 'RSD', '1000', 20),
      place('b', 'BAM', '500', 20),
      place('c', 'EUR', '300', 20),
    ])

    expect(totals).toHaveLength(3)
    expect(totals.map((t) => t.currency).sort()).toEqual(['BAM', 'EUR', 'RSD'])
  })

  it('mesta u istoj valuti se sabiraju', () => {
    const totals = networkTotals([place('a', 'RSD', '1000', 20), place('b', 'RSD', '2500', 20)])
    expect(totals).toEqual([{ currency: 'RSD', total: '3500.00', locationCount: 2 }])
  })
})

describe('prosečna marža mreže', () => {
  /*
   * Obična sredina procenata dala bi ovde 20%: (10 + 30) / 2. Ponderisana daje
   * skoro 11%, jer mesto sa 30% marže nosi jedan procenat prometa. Bez
   * pondera bi devet od deset mesta ispalo „ispod proseka".
   */
  it('ponderiše se prometom, ne brojem mesta', () => {
    const avg = averageMargin([
      place('veliki', 'RSD', '10000000', 10),
      place('mali', 'RSD', '100000', 30),
    ])

    expect(avg).toBeGreaterThan(10)
    expect(avg).toBeLessThan(11)
  })

  it('mesta bez prometa ne obaraju prosek na nulu', () => {
    const avg = averageMargin([place('a', 'RSD', '0', 20), place('b', 'RSD', '0', 24)])
    expect(avg).toBe(22)
  })
})

describe('korak skale marže', () => {
  it('prosek je nula, bez obzira na visinu proseka', () => {
    expect(marginStep(20, 20)).toBe(0)
    expect(marginStep(8, 8)).toBe(0)
  })

  it('razlika je u procentnim poenima, ne u procentima', () => {
    // 26% naspram proseka od 20% je šest poena iznad — krajnji korak.
    expect(marginStep(26, 20)).toBe(3)
    expect(marginStep(14, 20)).toBe(-3)
  })

  it('sitna odstupanja ostaju neutralna', () => {
    expect(marginStep(20.7, 20)).toBe(0)
    expect(marginStep(19.4, 20)).toBe(0)
  })
})

describe('poluprečnik kruga', () => {
  /*
   * Po POVRŠINI, ne po poluprečniku. Da poluprečnik raste linearno, mesto sa
   * dvostrukim prometom dobilo bi krug četiri puta veće površine — i oko bi ga
   * pročitalo kao četvorostruko veće.
   */
  it('dvostruki promet daje dvostruku površinu', () => {
    const veliki = bubbleRadius(100, 100, 40)
    const pola = bubbleRadius(50, 100, 40)
    const odnosPovrsina = (veliki * veliki) / (pola * pola)
    expect(odnosPovrsina).toBeCloseTo(2, 1)
  })

  it('najmanji krug ostaje vidljiv', () => {
    expect(bubbleRadius(1, 1_000_000, 40)).toBeGreaterThanOrEqual(6)
  })

  it('nula prometa nema krug', () => {
    expect(bubbleRadius(0, 100, 40)).toBe(0)
  })
})

describe('promena prema prethodnom periodu', () => {
  it('bez prethodnog perioda promena je nula, ne beskonačno', () => {
    expect(changePercent('5000', '0')).toBe(0)
  })

  it('rast i pad nose znak', () => {
    expect(changePercent('120', '100')).toBe(20)
    expect(changePercent('80', '100')).toBe(-20)
  })
})

describe('demo mreža', () => {
  it('isti ulaz daje isti izlaz', () => {
    const a = demoNetwork('org-1', NOW)
    const b = demoNetwork('org-1', NOW)
    expect(a).toEqual(b)
  })

  it('različite organizacije ne dele brojke', () => {
    const a = demoNetwork('org-1', NOW)
    const b = demoNetwork('org-2', NOW)
    expect(a[0]?.monthToDate).not.toBe(b[0]?.monthToDate)
  })

  it('pokriva svih osam objekata iz tri zemlje', () => {
    const network = demoNetwork('org-1', NOW)
    expect(network).toHaveLength(DEMO_LOCATIONS.length)
    expect(new Set(network.map((l) => l.country))).toEqual(new Set(['RS', 'BA', 'ME']))
  })

  /*
   * Demo MORA da sadrži mesto sa velikim prometom i slabom maržom. To je slučaj
   * zbog kojeg se karta gleda — veliki krug koji ne zarađuje. Bez njega prikaz
   * izgleda lepo a ne pokazuje ništa.
   */
  it('ima mesto koje mnogo prodaje a malo zarađuje', () => {
    const network = demoNetwork('org-1', NOW)
    const dinarska = network.filter((l) => l.currency === 'RSD')
    const prosek = averageMargin(dinarska)

    const poPrometu = [...dinarska].sort((a, b) => Number(b.monthToDate) - Number(a.monthToDate))
    const medju3 = poPrometu.slice(0, 3)

    expect(medju3.some((l) => marginStep(l.marginPercent, prosek) <= -2)).toBe(true)
  })

  it('svako mesto nosi artikle iz svog asortimana', () => {
    for (const location of demoNetwork('org-1', NOW)) {
      expect(location.topProducts.length).toBeGreaterThan(0)
      expect(location.topProducts.length).toBeLessThanOrEqual(5)
      for (const product of location.topProducts) {
        expect(product.quantity).toBeGreaterThan(0)
        expect(Number(product.revenue)).toBeGreaterThan(0)
      }
    }
  })
})
