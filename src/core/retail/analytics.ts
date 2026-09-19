import type { BusinessRules } from '../rules/business-rules'
import type { LocationPerformance, MonthlyPoint, ProductLine } from './network'

/**
 * Analize nad asortimanom jednog objekta.
 *
 * Merilo je jedno: svaka funkcija ovde mora da vodi do ODLUKE. Broj koji se
 * lepo prikaže a ne menja ništa u ponedeljak ujutru nije analiza nego ukras, i
 * takvih ekrana vlasnik već ima koliko hoće.
 *
 * Sve su čiste funkcije nad podacima koje objekat već nosi — bez poziva ka
 * izvoru, pa se isti nalaz može izračunati i za jedan objekat i za celu mrežu,
 * i proveriti u testu.
 */

/* ------------------------------------------------------------------ */
/* ABC raspodela                                                       */
/* ------------------------------------------------------------------ */

export type AbcClass = 'A' | 'B' | 'C'

export interface AbcLine {
  readonly product: ProductLine
  readonly abc: AbcClass
  /** Udeo tog artikla u ukupnom prometu objekta, u procentima. */
  readonly share: number
  /** Kumulativni udeo zaključno sa tim artiklom. */
  readonly cumulativeShare: number
}

export interface AbcResult {
  readonly lines: readonly AbcLine[]
  /** Koliko artikala čini osamdeset posto prometa. */
  readonly aCount: number
  /** Udeo tih artikala u ukupnom broju artikala, u procentima. */
  readonly aShareOfCatalog: number
}

/**
 * ABC: koji artikli nose promet.
 *
 * ODLUKA koju omogućava: šta nikad ne sme da nestane sa police, na čemu se
 * pregovara sa dobavljačem, a šta se drži samo zato što se oduvek držalo.
 *
 * Granice 80% i 95% nisu proizvoljne — to je standardna podela koja se u
 * trgovini koristi decenijama, pa je i razgovor sa knjigovođom lakši.
 */
export function abcAnalysis(products: readonly ProductLine[]): AbcResult {
  const total = products.reduce((sum, p) => sum + Number(p.revenue), 0)

  if (total <= 0 || products.length === 0) {
    return { lines: [], aCount: 0, aShareOfCatalog: 0 }
  }

  const sorted = [...products].sort((a, b) => Number(b.revenue) - Number(a.revenue))

  let cumulative = 0
  const lines: AbcLine[] = sorted.map((product) => {
    const share = (Number(product.revenue) / total) * 100
    /*
     * Razred se određuje po kumulativi PRE ovog artikla, ne posle.
     *
     * Inače artikal koji sam pređe granicu upadne u sledeći razred, pa se
     * dešava da prvi artikal sa 85% prometa bude razred B — što je besmislica
     * koju čovek primeti odmah, a formula ne.
     */
    const before = cumulative
    cumulative += share
    const abc: AbcClass = before < 80 ? 'A' : before < 95 ? 'B' : 'C'
    return { product, abc, share, cumulativeShare: cumulative }
  })

  const aCount = lines.filter((l) => l.abc === 'A').length

  return {
    lines,
    aCount,
    aShareOfCatalog: Math.round((aCount / products.length) * 1000) / 10,
  }
}

/* ------------------------------------------------------------------ */
/* Mrtav novac                                                         */
/* ------------------------------------------------------------------ */

export interface DeadStock {
  readonly items: readonly ProductLine[]
  /** Ukupna vrednost zalihe koja ne radi ništa, u valuti objekta. */
  readonly value: string
  /** Udeo u ukupnoj vrednosti zalihe, u procentima. */
  readonly shareOfStock: number
}

/**
 * Mrtav novac: zaliha koja stoji i ne prodaje se.
 *
 * ODLUKA: rasprodaja, povraćaj dobavljaču, ili prestanak naručivanja. Za
 * trgovinu okovom sa hiljadama artikala ovo je najskuplja stavka koju niko ne
 * vidi — svaki pojedinačni artikal je sitan, a zajedno vežu ozbiljan novac.
 *
 * Prag je `stockOverstockDays` iz pravila firme, ne izmišljen broj: vlasnik ga
 * sam postavlja na ekranu sa pragovima, i time odlučuje šta je za NJEGA sporo.
 */
export function deadStock(
  products: readonly ProductLine[],
  rules: BusinessRules,
): DeadStock {
  const totalStock = products.reduce((sum, p) => sum + Number(p.stockValue), 0)

  // Artikal bez zalihe ne može da bude mrtav novac ma koliko se ne prodavao —
  // nema para koje stoje.
  const items = products.filter(
    (p) => p.onHand > 0 && p.lastSoldDaysAgo >= rules.stockOverstockDays,
  )

  const value = items.reduce((sum, p) => sum + Number(p.stockValue), 0)

  return {
    items: [...items].sort((a, b) => Number(b.stockValue) - Number(a.stockValue)),
    value: value.toFixed(2),
    shareOfStock: totalStock > 0 ? Math.round((value / totalStock) * 1000) / 10 : 0,
  }
}

/* ------------------------------------------------------------------ */
/* Rizik od nestašice                                                  */
/* ------------------------------------------------------------------ */

export interface ShortageRisk {
  readonly product: ProductLine
  /** Za koliko dana se zaliha troši pri sadašnjem tempu. */
  readonly daysOfCover: number
  /** Koliko dana fali do isporuke. Pozitivno znači da će nestati pre nje. */
  readonly gapDays: number
}

/**
 * Šta će nestati pre nego što stigne nova isporuka.
 *
 * ODLUKA: naruči danas, ne sledeće nedelje.
 *
 * Poređenje je sa ROKOM ISPORUKE, ne sa fiksnim brojem dana. Zaliha za deset
 * dana je sasvim dovoljna ako roba stiže za tri, a kritična ako stiže za
 * dvadeset — isti broj, dve različite vesti.
 */
export function shortageRisks(
  products: readonly ProductLine[],
  rules: BusinessRules,
): ShortageRisk[] {
  const risks: ShortageRisk[] = []

  for (const product of products) {
    // Bez potrošnje nema pokrivenosti: deljenje nulom bi dalo beskonačno, a
    // izmišljena potrošnja bi dala broj izveden ni iz čega.
    if (product.averageDailySales <= 0) continue

    const daysOfCover = Math.floor(product.onHand / product.averageDailySales)

    // Rok isporuke kada ga izvoz nosi; inače prag iz pravila firme.
    const horizon = product.leadTimeDays > 0 ? product.leadTimeDays : rules.stockWarningDays
    if (daysOfCover >= horizon) continue

    risks.push({ product, daysOfCover, gapDays: horizon - daysOfCover })
  }

  // Najhitnije prvo: najveći jaz, pa najmanja pokrivenost.
  return risks.sort((a, b) => b.gapDays - a.gapDays || a.daysOfCover - b.daysOfCover)
}

/* ------------------------------------------------------------------ */
/* Promet bez zarade                                                   */
/* ------------------------------------------------------------------ */

export interface VolumeNoMargin {
  readonly product: ProductLine
  readonly share: number
  /** Koliko je procentnih poena ispod prosečne marže objekta. */
  readonly pointsBelow: number
}

/**
 * Artikli koji mnogo prodaju a malo zarađuju.
 *
 * ODLUKA: podigni cenu, pregovaraj nabavku, ili svesno zadrži kao mamac koji
 * dovodi kupca — ali svesno, a ne iz nepažnje.
 *
 * Ovo je isti nalaz koji karta pokazuje za objekte, samo spušten na artikal.
 * Gleda se samo GORNJA TREĆINA po prometu: artikal sa slabom maržom i bez
 * prometa nije problem vredan pažnje, samo šum u spisku.
 */
export function volumeWithoutMargin(
  products: readonly ProductLine[],
  locationMargin: number,
): VolumeNoMargin[] {
  const total = products.reduce((sum, p) => sum + Number(p.revenue), 0)
  if (total <= 0) return []

  const byRevenue = [...products].sort((a, b) => Number(b.revenue) - Number(a.revenue))
  const topThird = byRevenue.slice(0, Math.max(1, Math.ceil(byRevenue.length / 3)))

  return topThird
    // Jedan procentni poen je šum u merenju; tri je razlika koja se oseti.
    .filter((p) => locationMargin - p.marginPercent >= 3)
    .map((product) => ({
      product,
      share: Math.round((Number(product.revenue) / total) * 1000) / 10,
      pointsBelow: Math.round((locationMargin - product.marginPercent) * 10) / 10,
    }))
    .sort((a, b) => b.share - a.share)
}

/* ------------------------------------------------------------------ */
/* Sezona                                                              */
/* ------------------------------------------------------------------ */

export interface SeasonalComparison {
  readonly month: string
  readonly total: string
  /** Isti mesec prethodne godine, ako ga ima u istoriji. */
  readonly sameMonthLastYear?: string
  /** Promena prema istom mesecu prošle godine, u procentima. */
  readonly yearOverYear?: number
}

/**
 * Poređenje sa ISTIM mesecom prošle godine, ne sa prethodnim mesecom.
 *
 * ODLUKA: da li je ovaj mesec zaista dobar, ili je samo sezonski normalan.
 *
 * Trgovina okovom i profilima ide za građevinom, a građevina ima godišnji
 * ritam. Februar je uvek slabiji od januara i to ne znači ništa; februar slabiji
 * od prošlog februara znači sve.
 */
export function seasonalComparison(
  history: readonly MonthlyPoint[],
): SeasonalComparison[] {
  const byMonth = new Map(history.map((point) => [point.month, point]))

  return history.map((point) => {
    const [year, month] = point.month.split('-')
    const lastYear = byMonth.get(`${Number(year) - 1}-${month}`)

    if (!lastYear || Number(lastYear.total) === 0) {
      return { month: point.month, total: point.total }
    }

    const change =
      ((Number(point.total) - Number(lastYear.total)) / Number(lastYear.total)) * 100

    return {
      month: point.month,
      total: point.total,
      sameMonthLastYear: lastYear.total,
      yearOverYear: Math.round(change * 10) / 10,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Zaliha cele mreže                                                   */
/* ------------------------------------------------------------------ */

export interface NetworkStock {
  readonly currency: string
  /** Ukupna vrednost zalihe u toj valuti. */
  readonly value: string
  /** Vrednost mrtvog novca u toj valuti. */
  readonly deadValue: string
  readonly deadShare: number
  /** Broj artikala kojima preti nestašica. */
  readonly shortageCount: number
}

/**
 * Zaliha cele mreže, razdvojeno po valuti.
 *
 * Isto pravilo kao kod prometa: dinari, marke i evri se ne sabiraju bez kursa
 * na dan. Broj artikala u riziku SE sabira — on nema valutu.
 */
export function networkStock(
  locations: readonly LocationPerformance[],
  rules: BusinessRules,
): NetworkStock[] {
  const byCurrency = new Map<string, { value: number; dead: number; shortages: number }>()

  for (const location of locations) {
    const entry = byCurrency.get(location.currency) ?? { value: 0, dead: 0, shortages: 0 }

    entry.value += location.products.reduce((sum, p) => sum + Number(p.stockValue), 0)
    entry.dead += Number(deadStock(location.products, rules).value)
    entry.shortages += shortageRisks(location.products, rules).length

    byCurrency.set(location.currency, entry)
  }

  return [...byCurrency.entries()]
    .map(([currency, e]) => ({
      currency,
      value: e.value.toFixed(2),
      deadValue: e.dead.toFixed(2),
      deadShare: e.value > 0 ? Math.round((e.dead / e.value) * 1000) / 10 : 0,
      shortageCount: e.shortages,
    }))
    .sort((a, b) => Number(b.value) - Number(a.value) || a.currency.localeCompare(b.currency))
}
