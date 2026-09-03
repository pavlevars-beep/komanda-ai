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

/** Greška vezana za konkretno polje obrasca. */
export interface RuleIssue {
  readonly field: keyof BusinessRules
  /** Ključ prevoda; poruka se sastavlja uzvodno. */
  readonly key: string
}

/**
 * Međusobna doslednost pragova.
 *
 * Odvojeno od pojedinačnih opsega jer je druga vrsta greške: svaka vrednost
 * može da bude u dozvoljenom opsegu, a par da bude besmislen. Kritično
 * kašnjenje kraće od upozorenja znači da ništa nikad ne bi bilo samo
 * „upozorenje" — cela srednja kategorija tiho nestaje, a na ekranu se to vidi
 * samo kao „upozorenja su prestala da stižu".
 */
function consistencyIssues(r: BusinessRules): RuleIssue[] {
  const issues: RuleIssue[] = []

  if (r.receivableCriticalDays <= r.receivableWarningDays) {
    issues.push({ field: 'receivableCriticalDays', key: 'rules.error.criticalBeforeWarning' })
  }
  if (r.stockCriticalDays >= r.stockWarningDays) {
    issues.push({ field: 'stockCriticalDays', key: 'rules.error.stockCriticalAboveWarning' })
  }
  if (r.stockOverstockDays <= r.stockWarningDays) {
    issues.push({ field: 'stockOverstockDays', key: 'rules.error.overstockBelowWarning' })
  }

  return issues
}

/**
 * Provera unosa iz obrasca.
 *
 * Vraća IMENOVANE greške po polju, umesto tihog vraćanja na podrazumevano.
 * Tiho vraćanje je ispravno pri ČITANJU iz baze — tamo nema kome da se javi —
 * ali je pogrešno pri upisu: korisnik bi sačuvao vrednost, video podrazumevanu
 * i ne bi znao zašto se njegova nije primila.
 */
export function validateBusinessRules(
  input: unknown,
): { ok: true; value: BusinessRules } | { ok: false; issues: readonly RuleIssue[] } {
  const parsed = businessRules.safeParse(input)

  if (!parsed.success) {
    const issues: RuleIssue[] = []
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string' && !issues.some((i) => i.field === field)) {
        issues.push({ field: field as keyof BusinessRules, key: 'rules.error.outOfRange' })
      }
    }
    return { ok: false, issues }
  }

  const issues = consistencyIssues(parsed.data)
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: parsed.data }
}

/**
 * Spaja sačuvane izmene sa podrazumevanim vrednostima.
 *
 * Ovo je put za ČITANJE. Nepoznat ključ se odbacuje, a neispravan skup se ne
 * prihvata parcijalno: pravilo koje je delimično ispravno gore je od
 * podrazumevanog, jer izgleda kao da je neko svesno podesio baš tako.
 *
 * Upis ide kroz `validateBusinessRules`, pa ovde ništa neispravno ne bi ni
 * trebalo da stigne. Provera ostaje jer red u bazi može da promeni i nešto
 * mimo aplikacije.
 */
export function resolveBusinessRules(stored: unknown): BusinessRules {
  if (stored === null || typeof stored !== 'object') return DEFAULT_BUSINESS_RULES

  const merged = { ...DEFAULT_BUSINESS_RULES, ...(stored as Record<string, unknown>) }
  const validated = validateBusinessRules(merged)
  return validated.ok ? validated.value : DEFAULT_BUSINESS_RULES
}
