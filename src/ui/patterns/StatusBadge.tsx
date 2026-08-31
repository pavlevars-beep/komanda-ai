import styles from './Badge.module.css'

export type Tone = 'neutral' | 'ok' | 'warn' | 'critical' | 'info'

/**
 * Status se nikad ne prenosi samo bojom — uz tačku uvek ide i tekst,
 * inače je neupotrebljiv za daltoniste i u crno-beloj štampi izveštaja.
 */
export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}

/** Vidljiva oznaka da podaci nisu iz stvarnog sistema klijenta. */
export function DemoBadge({ label }: { label: string }) {
  return <span className={`${styles.badge} ${styles.demo}`}>{label}</span>
}
