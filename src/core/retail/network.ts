import { z } from 'zod'

/**
 * Mreža prodajnih mesta.
 *
 * Postoji zato što zbir po firmi krije ono što vlasnika zapravo zanima: koje
 * mesto vuče, koje stoji, i gde se mnogo prodaje a malo zaradi. Jedan broj za
 * celu firmu na to ne odgovara ni posle sat vremena kopanja po izveštajima.
 */

export const locationSchema = z.object({
  id: z.string().min(1),
  /** Grad. Dva mesta u istom gradu se razlikuju po `label`. */
  city: z.string().min(1),
  /** Puno ime objekta, npr. „Beograd — Obrenovački drum". */
  label: z.string().min(1),
  /** ISO oznaka zemlje: RS, BA, ME. */
  country: z.string().length(2),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  /**
   * Valuta SVAKOG mesta posebno.
   *
   * Objekat u Banjaluci naplaćuje u KM, u Podgorici u evrima. Sabiranje preko
   * valuta bez kursa daje broj koji izgleda kao podatak a nije izveden ni iz
   * čega — zato `networkTotals` odbija da ih sabere.
   */
  currency: z.string().length(3),
})

export type RetailLocation = z.infer<typeof locationSchema>

export const productSaleSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(0),
  /** Prihod od tog artikla, u valuti mesta. */
  revenue: z.string(),
  unit: z.string().min(1),
})

export type ProductSale = z.infer<typeof productSaleSchema>

export const locationPerformanceSchema = locationSchema.extend({
  /** Promet od početka meseca. */
  monthToDate: z.string(),
  /** Isti broj dana prethodnog meseca — jedino pošteno poređenje. */
  previousPeriod: z.string(),
  /** Marža u procentima. Rentabilnost mesta, ne firme. */
  marginPercent: z.number(),
  /** Broj izdatih računa od početka meseca. */
  transactions: z.number().int().min(0),
  /** Najprodavaniji artikli, najviše pet. */
  topProducts: z.array(productSaleSchema).max(5),
})

export type LocationPerformance = z.infer<typeof locationPerformanceSchema>

export const retailNetworkSchema = z.object({
  asOf: z.string(),
  locations: z.array(locationPerformanceSchema),
})

export type RetailNetwork = z.infer<typeof retailNetworkSchema>

/** Promena u procentima prema istom broju dana prethodnog meseca. */
export function changePercent(current: string, previous: string): number {
  const now = Number(current)
  const before = Number(previous)
  // Bez prethodnog perioda promena je NULA, ne beskonačno: prvi mesec rada
  // nije rast od beskonačno procenata.
  if (before === 0) return 0
  return Math.round(((now - before) / before) * 1000) / 10
}

export interface CurrencyTotal {
  readonly currency: string
  readonly total: string
  readonly locationCount: number
}

/**
 * Zbirovi mreže, RAZDVOJENO po valuti.
 *
 * Ovo namerno ne vraća jedan broj. Tri objekta u Srbiji, jedan u Bosni i jedan
 * u Crnoj Gori nemaju zajednički zbir bez kursa na dan — a kurs je podatak koji
 * nemamo iz proverenog izvora. Prikazati sabranu cifru značilo bi prikazati
 * izmišljen broj kao činjenicu.
 */
export function networkTotals(locations: readonly LocationPerformance[]): CurrencyTotal[] {
  const byCurrency = new Map<string, { sum: number; count: number }>()

  for (const location of locations) {
    const entry = byCurrency.get(location.currency) ?? { sum: 0, count: 0 }
    entry.sum += Number(location.monthToDate)
    entry.count += 1
    byCurrency.set(location.currency, entry)
  }

  return [...byCurrency.entries()]
    .map(([currency, { sum, count }]) => ({
      currency,
      total: sum.toFixed(2),
      locationCount: count,
    }))
    // Najveći zbir prvi; pri jednakim zbirovima azbučno, da redosled bude stalan.
    .sort((a, b) => Number(b.total) - Number(a.total) || a.currency.localeCompare(b.currency))
}

/**
 * Prosečna marža mreže, ponderisana prometom.
 *
 * Obična sredina procenata bi dala mestu sa najmanjim prometom istu težinu kao
 * najvećem — pa bi jedan mali objekat sa dobrom maržom pomerio prosek cele
 * mreže i sva ostala mesta bi ispala „ispod proseka".
 *
 * Ponderiše se unutar svake valute posebno, pa se procenti spajaju: procenat
 * nema valutu, ali promet koji ga ponderiše ima.
 */
export function averageMargin(locations: readonly LocationPerformance[]): number {
  if (locations.length === 0) return 0

  const byCurrency = new Map<string, { weighted: number; total: number }>()

  for (const location of locations) {
    const amount = Number(location.monthToDate)
    const entry = byCurrency.get(location.currency) ?? { weighted: 0, total: 0 }
    entry.weighted += location.marginPercent * amount
    entry.total += amount
    byCurrency.set(location.currency, entry)
  }

  const perCurrency = [...byCurrency.values()]
    .filter((e) => e.total > 0)
    .map((e) => e.weighted / e.total)

  if (perCurrency.length === 0) {
    // Sva mesta bez prometa: ponderi ne postoje, pa ostaje obična sredina.
    const plain = locations.reduce((s, l) => s + l.marginPercent, 0) / locations.length
    return Math.round(plain * 10) / 10
  }

  const mean = perCurrency.reduce((s, m) => s + m, 0) / perCurrency.length
  return Math.round(mean * 10) / 10
}

/**
 * Korak divergentne skale marže: −3 do +3, gde je 0 prosek mreže.
 *
 * Prag je u PROCENTNIM POENIMA razlike od proseka, ne u procentima razlike:
 * marža od 22% naspram proseka od 20% je „dva poena iznad", što je rečenica
 * koju trgovac razume. „Deset procenata iznad proseka" nije.
 */
export function marginStep(marginPercent: number, average: number): -3 | -2 | -1 | 0 | 1 | 2 | 3 {
  const diff = marginPercent - average
  if (diff >= 6) return 3
  if (diff >= 3) return 2
  if (diff >= 1) return 1
  if (diff <= -6) return -3
  if (diff <= -3) return -2
  if (diff <= -1) return -1
  return 0
}

/**
 * Poluprečnik kruga na karti — po POVRŠINI, ne po poluprečniku.
 *
 * Ako poluprečnik raste linearno sa prometom, mesto sa dvostrukim prometom
 * dobije krug četiri puta veće površine, i oko ga pročita kao četvorostruko.
 * Koren to ispravlja: dvostruki promet — dvostruka površina.
 */
export function bubbleRadius(value: number, maxValue: number, maxRadius: number): number {
  if (maxValue <= 0 || value <= 0) return 0
  const MIN_RADIUS = 6
  const scaled = Math.sqrt(value / maxValue) * maxRadius
  return Math.max(MIN_RADIUS, Math.round(scaled * 10) / 10)
}
