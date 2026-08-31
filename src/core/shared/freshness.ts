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

export function freshnessState(value: Freshness | undefined, now = new Date()): FreshnessState {
  if (!value?.asOf) return 'unknown'
  const ageSeconds = (now.getTime() - new Date(value.asOf).getTime()) / 1000
  if (ageSeconds < 0) return 'unknown'
  const sla = value.slaSeconds
  if (sla === undefined) return ageSeconds < 3600 ? 'fresh' : 'aging'
  if (ageSeconds <= sla) return 'fresh'
  if (ageSeconds <= sla * 3) return 'aging'
  return 'stale'
}
