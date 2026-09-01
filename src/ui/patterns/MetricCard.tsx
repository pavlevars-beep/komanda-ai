import { StatusBadge, type Tone } from './StatusBadge'
import styles from './MetricCard.module.css'

export type FreshnessTone = 'fresh' | 'aging' | 'stale' | 'unknown'

/**
 * `| undefined` je svuda eksplicitno zbog exactOptionalPropertyTypes: polje
 * sme da nedostaje, ali sme i da bude prosleđeno kao undefined. Bez toga bi
 * pozivalac morao da gradi objekat uslovnim spread-om, što se teško čita.
 */
export interface MetricCardProps {
  readonly label: string
  /** Već formatirana vrednost. Formatiranje radi server, sa lokalom organizacije. */
  readonly value?: string | undefined
  readonly changeLabel?: string | undefined
  readonly changeIsGood?: boolean | undefined
  readonly comparePeriodLabel?: string | undefined
  readonly sourceLabel?: string | undefined
  readonly freshnessLabel?: string | undefined
  readonly freshness?: FreshnessTone | undefined
  readonly classificationLabel?: string | undefined
  readonly classificationTone?: Tone | undefined
  /** Poruka koja objašnjava zašto vrednosti nema. */
  readonly unavailableLabel?: string | undefined
  readonly unavailableReason?: string | undefined
  readonly isDemo?: boolean | undefined
  readonly demoLabel?: string | undefined
}

/**
 * KPI kartica.
 *
 * Dve stvari koje razlikuju ovu karticu od uobičajene:
 *
 * 1. Boja promene se ne izvodi iz znaka broja nego iz toga da li je rast dobra
 *    vest za tu meru. Rast dospelih potraživanja je pozitivan broj i loša vest;
 *    zeleno +18% bi obmanulo čitaoca.
 *
 * 2. Kada vrednosti nema, kartica kaže ZAŠTO je nema umesto da prikaže nulu.
 *    Nula i „nedostupno" su različite stvari, a u poslovnom kontekstu razlika
 *    je ozbiljna.
 */
export function MetricCard(props: MetricCardProps) {
  const {
    label,
    value,
    changeLabel,
    changeIsGood,
    comparePeriodLabel,
    sourceLabel,
    freshnessLabel,
    classificationLabel,
    classificationTone,
    unavailableLabel,
    unavailableReason,
    isDemo,
    demoLabel,
  } = props

  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>

      {value !== undefined ? (
        <div className={styles.valueRow}>
          <span className={styles.value}>{value}</span>
          {changeLabel ? (
            <span className={changeIsGood ? styles.deltaGood : styles.deltaBad}>
              {changeLabel}
              {comparePeriodLabel ? (
                <span className={styles.deltaPeriod}> {comparePeriodLabel}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : (
        <div className={styles.unavailable}>
          <span className={styles.unavailableLabel}>{unavailableLabel}</span>
          <br />
          {unavailableReason}
        </div>
      )}

      {sourceLabel || classificationLabel ? (
        <div className={styles.footer}>
          {classificationLabel ? (
            <StatusBadge tone={classificationTone ?? 'neutral'} label={classificationLabel} />
          ) : null}
          {sourceLabel ? <span className={styles.source}>{sourceLabel}</span> : null}
          {freshnessLabel ? (
            <>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <span>{freshnessLabel}</span>
            </>
          ) : null}
          {isDemo && demoLabel ? (
            <>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <span>{demoLabel}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid}>{children}</div>
}
