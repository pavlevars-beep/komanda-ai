import styles from './AccessBanner.module.css'

export interface AccessBannerSession {
  readonly sessionId: string
  readonly staffName: string | null
  readonly reason: string
  readonly expiresAtLabel: string
}

/**
 * Traka koju klijent vidi dok Delta Pro ima otvoren pristup njegovim podacima.
 *
 * Namerno je vidljiva i namerno nosi razlog. Tih pristup bi bio tehnički
 * jednostavniji, ali poverenje se gradi time što klijent u svakom trenutku
 * zna ko mu je unutra i zašto.
 */
export function AccessBanner({
  sessions,
  labels,
  renderAction,
}: {
  sessions: readonly AccessBannerSession[]
  labels: { banner: (name: string, until: string) => string; reason: string }
  /** Radnja se iscrtava po sesiji, jer se prekida tačno određena sesija. */
  renderAction?: (sessionId: string) => React.ReactNode
}) {
  if (sessions.length === 0) return null

  return (
    <>
      {sessions.map((s) => (
        <div key={s.sessionId} className={styles.banner} role="status">
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.text}>
            <span className={styles.name}>
              {labels.banner(s.staffName ?? 'Delta Pro', s.expiresAtLabel)}
            </span>{' '}
            <span className={styles.reason}>
              {labels.reason.replace('{reason}', s.reason)}
            </span>
          </span>
          {renderAction?.(s.sessionId)}
        </div>
      ))}
    </>
  )
}
