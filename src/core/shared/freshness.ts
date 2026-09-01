/**
 * Svaki podatak koji stiže iz spoljnog sistema nosi vreme na koje se odnosi.
 * Bez toga korisnik ne može da zna da li gleda stanje od maločas ili od juče,
 * a sistem ne sme da se pretvara da je sve u realnom vremenu.
 */

export interface Freshness {
  /** Vreme na koje se podatak odnosi (ne vreme kada je dohvaćen). */
  readonly asOf: string
  /** Dogovoreni prag svežine za taj izvor, u sekundama. */
  readonly slaSeconds?: number
}

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'unknown'

/**
 * Koliko unapred sme da bude vreme izvora pre nego što ga smatramo sumnjivim.
 *
 * Sat na ERP serveru klijenta redovno odstupa nekoliko sekundi od našeg, a i
 * naš sopstveni podatak ume da nosi vreme neznatno posle trenutka merenja.
 * Bez ovog dopuštenja svež podatak bi se prikazivao kao „nepoznata svežina",
 * što korisnika navodi da posumnja u ispravan broj.
 *
 * Vreme daleko u budućnosti i dalje je znak da nešto nije u redu — najčešće
 * pogrešno podešena vremenska zona na izvoru — i tada oznaka izostaje.
 */
const CLOCK_SKEW_TOLERANCE_SECONDS = 300

export function freshnessState(value: Freshness | undefined, now = new Date()): FreshnessState {
  if (!value?.asOf) return 'unknown'

  const asOf = new Date(value.asOf).getTime()
  if (Number.isNaN(asOf)) return 'unknown'

  const ageSeconds = (now.getTime() - asOf) / 1000

  if (ageSeconds < -CLOCK_SKEW_TOLERANCE_SECONDS) return 'unknown'
  const age = Math.max(0, ageSeconds)

  const sla = value.slaSeconds
  if (sla === undefined) return age < 3600 ? 'fresh' : 'aging'
  if (age <= sla) return 'fresh'
  if (age <= sla * 3) return 'aging'
  return 'stale'
}
