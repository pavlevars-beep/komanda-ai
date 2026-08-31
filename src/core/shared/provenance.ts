import type { Freshness } from './freshness'

/**
 * Klasifikacija tvrdnje.
 *
 * Dolazi iz definicije alata, nikad iz modela. Rukovodilac koji gleda broj
 * mora da zna da li je to podatak iz ERP-a ili procena — u suprotnom
 * prognoza izgleda isto kao činjenica, što je ozbiljan poslovni rizik.
 */
export type Classification = 'fact' | 'calculation' | 'interpretation' | 'forecast'

export interface SourceRef {
  /** Naziv koji korisnik prepoznaje, npr. "Tim ERP". */
  readonly label: string
  readonly integrationId?: string
  readonly capabilityKey?: string
  /** Označava da podatak dolazi iz demo skupa, ne iz stvarnog sistema. */
  readonly isDemo: boolean
}

export interface Provenance {
  readonly classification: Classification
  readonly sources: readonly SourceRef[]
  readonly freshness?: Freshness
  /** Popunjeno kada podatak nije dostupan — objašnjava zašto. */
  readonly unavailableReason?: 'no_permission' | 'not_configured' | 'integration_down' | 'no_data'
}
