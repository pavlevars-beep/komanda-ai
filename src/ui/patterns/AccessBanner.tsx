import styles from './AccessBanner.module.css'
import { interpolate } from '@/i18n/translator'

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
  // `banner` je ŠABLON sa {name} i {until}. Funkcija ovde ne sme da stoji:
  // serverska komponenta ne može da je prosledi klijentskoj.
  labels: { banner: string; reason: string }
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
              {interpolate(labels.banner, { name: s.staffName ?? 'Delta Pro', until: s.expiresAtLabel })}
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
