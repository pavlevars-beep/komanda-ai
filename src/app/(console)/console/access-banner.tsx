'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { endAccessSessionAction, type AccessSessionState } from './actions'
import styles from './access-banner.module.css'

export interface OpenSessionView {
  readonly sessionId: string
  readonly organizationName: string
  readonly untilLabel: string
  readonly minutesLeft: number
}

/**
 * Traka u konzoli dok konsultant drži otvorenu sesiju pristupa.
 *
 * Stoji na vrhu svake stranice konzole, ne samo na stranici tog klijenta.
 * Razlog je praktičan: sesija se najlakše zaboravi kad konsultant ode da
 * radi nešto drugo, a otvorena sesija znači da su tuđi poslovni podaci i
 * dalje dostupni.
 */
export function ConsoleAccessBanner({
  sessions,
  labels,
}: {
  sessions: readonly OpenSessionView[]
  labels: { openIn: (name: string, until: string) => string; remaining: (m: number) => string; end: string }
}) {
  const [, endAction, ending] = useActionState<AccessSessionState, FormData>(
    endAccessSessionAction,
    {},
  )

  if (sessions.length === 0) return null

  return (
    <>
      {sessions.map((s) => (
        <div key={s.sessionId} className={styles.bar} role="status">
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.text}>
            <span className={styles.org}>{labels.openIn(s.organizationName, s.untilLabel)}</span>{' '}
            <span className={styles.remaining}>{labels.remaining(s.minutesLeft)}</span>
          </span>
          <form action={endAction} className={styles.form}>
            <input type="hidden" name="sessionId" value={s.sessionId} />
            <Button type="submit" variant="danger" disabled={ending}>
              {labels.end}
            </Button>
          </form>
        </div>
      ))}
    </>
  )
}
