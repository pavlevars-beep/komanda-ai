import { z } from 'zod'

/**
 * Poslovna pravila po klijentu.
 *
 * Šta je „dospelo", šta je „kritična zaliha" i koji period je uporedni nije
 * ista stvar za distributera i za hotel. Kada su ti pragovi u kodu, svaka
 * firma koja ih vidi drugačije traži izmenu koda — a prvi klijent koji to
 * zatraži otkriva da je pola logike napisano oko njegovih brojeva.
 *
 * Zato su pragovi PODATAK. Kod nosi razumne podrazumevane vrednosti; klijent
 * ih menja bez isporuke nove verzije.
 *
 * Vrednosti se proveravaju šemom pri čitanju iz baze. Prag koji stigne kao
 * tekst ili kao negativan broj tiho bi pomerio granicu upozorenja, a niko to
 * ne bi primetio — upozorenja bi samo prestala da stižu.
 */

export const businessRules = z.object({
  /** Posle koliko dana kašnjenja potraživanje traži pomen. */
  receivableWarningDays: z.number().int().min(1).max(365),
  /** Posle koliko dana postaje ozbiljan problem naplate. */
  receivableCriticalDays: z.number().int().min(1).max(365),
  /** Iznos od kojeg se pojedinačno potraživanje smatra velikim. */
  largeReceivableAmount: z.number().min(0),

  /** Ispod koliko dana pokrivenosti zaliha traži pažnju. */
  stockWarningDays: z.number().int().min(1).max(365),
  /** Ispod koliko dana pokrivenosti je stanje kritično. */
  stockCriticalDays: z.number().int().min(1).max(365),
  /** Iznad koliko dana pokrivenosti je reč o mogućem prekomernom zalihama. */
  stockOverstockDays: z.number().int().min(30).max(3650),

  /** U kom roku dospele obaveze ulaze u brif. */
  payableHorizonDays: z.number().int().min(1).max(180),
  /** Iznos od kojeg obaveza sama po sebi traži pomen. */
  largePayableAmount: z.number().min(0),

  /** Pad prodaje u procentima od kojeg se otvara upozorenje. Negativan broj. */
  salesDropPercent: z.number().max(0).min(-100),

  /** Sa čime se podrazumevano poredi tekući period. */
  defaultComparison: z.enum(['previous_period', 'previous_year_same_period']),
  /** Koliko godina istorije ulazi u poređenja i trend. */
  forecastHistoryYears: z.number().int().min(1).max(10),
})

export type BusinessRules = z.infer<typeof businessRules>

/**
 * Podrazumevane vrednosti.
 *
 * Nisu proizvoljne: 60 i 90 dana su granice koje knjigovodstvo u Srbiji
 * najčešće koristi za starosnu strukturu, a sedam dana je horizont u kojem se
 * plaćanje još može isplanirati.
 */
export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  receivableWarningDays: 60,
  receivableCriticalDays: 90,
  largeReceivableAmount: 1_000_000,

  stockWarningDays: 14,
  stockCriticalDays: 7,
  stockOverstockDays: 180,

  payableHorizonDays: 7,
  largePayableAmount: 1_000_000,

  salesDropPercent: -15,

  defaultComparison: 'previous_year_same_period',
  forecastHistoryYears: 3,
}

/**
 * Spaja sačuvane izmene sa podrazumevanim vrednostima.
 *
 * Nepoznat ključ se odbacuje, a neispravna vrednost se NE prihvata parcijalno:
 * pravilo koje je delimično ispravno gore je od podrazumevanog, jer izgleda
 * kao da je neko svesno podesio baš tako.
 */
export function resolveBusinessRules(stored: unknown): BusinessRules {
  if (stored === null || typeof stored !== 'object') return DEFAULT_BUSINESS_RULES

  const merged = { ...DEFAULT_BUSINESS_RULES, ...(stored as Record<string, unknown>) }
  const parsed = businessRules.safeParse(merged)
  if (!parsed.success) return DEFAULT_BUSINESS_RULES

  /*
   * Međusobna doslednost se proverava odvojeno od pojedinačnih opsega.
   *
   * Svaka vrednost može da bude u dozvoljenom opsegu, a par da bude besmislen:
   * kritično kašnjenje kraće od upozorenja znači da ništa nikad ne bi bilo
   * samo „upozorenje", pa bi cela srednja kategorija tiho nestala.
   */
  const r = parsed.data
  if (r.receivableCriticalDays <= r.receivableWarningDays) return DEFAULT_BUSINESS_RULES
  if (r.stockCriticalDays >= r.stockWarningDays) return DEFAULT_BUSINESS_RULES
  if (r.stockOverstockDays <= r.stockWarningDays) return DEFAULT_BUSINESS_RULES

  return r
}
