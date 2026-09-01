'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { StatusBadge } from '@/ui/patterns/StatusBadge'
import {
  startAccessSessionAction,
  endAccessSessionAction,
  type AccessSessionState,
} from '../../actions'
import styles from './access-panel.module.css'

export interface AccessPanelLabels {
  readonly title: string
  readonly explain: string
  readonly start: string
  readonly reason: string
  readonly reasonHint: string
  readonly scope: string
  readonly scopeReadOnly: string
  readonly scopeFull: string
  readonly duration: string
  readonly end: string
  readonly open: string
  readonly ended: string
  /** Prevodi ključeva grešaka koje vraća akcija. */
  readonly message: (key: string) => string
}

export interface ActiveSession {
  readonly sessionId: string
  readonly reason: string
  readonly scope: 'read_only' | 'full'
  readonly expiresAtLabel: string
}

/**
 * Pokretanje i prekid sesije pristupa.
 *
 * Razlog je obavezno polje, a ne formalnost — klijent ga vidi u traci nad
 * svojim podacima. Zato forma jasno kaže da je tekst vidljiv klijentu, pre
 * nego što se napiše.
 */
export function AccessPanel({
  organizationId,
  active,
  labels,
  maxMinutes,
}: {
  organizationId: string
  active: ActiveSession | null
  labels: AccessPanelLabels
  maxMinutes: number
}) {
  const [startState, startAction, starting] = useActionState<AccessSessionState, FormData>(
    startAccessSessionAction,
    {},
  )
  const [endState, endAction, ending] = useActionState<AccessSessionState, FormData>(
    endAccessSessionAction,
    {},
  )

  const durations = [15, 30, 60, 120, 240].filter((m) => m <= maxMinutes)
  if (durations.length === 0) durations.push(maxMinutes)

  const error = startState.error ?? endState.error

  if (active) {
    return (
      <section className={`${styles.panel} ${styles.open}`}>
        <div className={styles.head}>
          <h2 className={styles.title}>{labels.title}</h2>
        </div>

        <div className={styles.active}>
          <div className={styles.activeLine}>
            <StatusBadge tone="warn" label={labels.open} />
            <span className={styles.until}>{active.expiresAtLabel}</span>
            <StatusBadge
              tone="neutral"
              label={active.scope === 'full' ? labels.scopeFull : labels.scopeReadOnly}
            />
          </div>
          <p className={styles.activeReason}>{active.reason}</p>

          <form action={endAction}>
            <input type="hidden" name="sessionId" value={active.sessionId} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <Button type="submit" variant="danger" disabled={ending}>
              {labels.end}
            </Button>
          </form>
        </div>

        {error ? <p className={`${styles.message} ${styles.bad}`}>{labels.message(error)}</p> : null}
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{labels.title}</h2>
        <p className={styles.explain}>{labels.explain}</p>
      </div>

      <form action={startAction} className={styles.form}>
        <input type="hidden" name="organizationId" value={organizationId} />

        <div className={styles.group}>
          <label className={styles.label} htmlFor="reason">
            {labels.reason}
          </label>
          <textarea
            id="reason"
            name="reason"
            className={styles.textarea}
            required
            minLength={10}
            maxLength={500}
            aria-invalid={startState.fieldErrors?.reason ? true : undefined}
            aria-describedby="reason-hint"
          />
          {startState.fieldErrors?.reason ? (
            <p className={styles.fieldError} role="alert">
              {labels.message(startState.fieldErrors.reason)}
            </p>
          ) : (
            <p id="reason-hint" className={styles.hint}>
              {labels.reasonHint}
            </p>
          )}
        </div>

        <div className={styles.row}>
          <div className={styles.group}>
            <label className={styles.label} htmlFor="scope">
              {labels.scope}
            </label>
            <select id="scope" name="scope" className={styles.select} defaultValue="read_only">
              <option value="read_only">{labels.scopeReadOnly}</option>
              <option value="full">{labels.scopeFull}</option>
            </select>
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="durationMinutes">
              {labels.duration}
            </label>
            <select
              id="durationMinutes"
              name="durationMinutes"
              className={styles.select}
              defaultValue={String(Math.min(60, maxMinutes))}
            >
              {durations.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={starting}>
            {labels.start}
          </Button>
          {endState.ended ? (
            <span className={`${styles.message} ${styles.ok}`}>{labels.ended}</span>
          ) : null}
        </div>

        {error ? <p className={`${styles.message} ${styles.bad}`}>{labels.message(error)}</p> : null}
      </form>
    </section>
  )
}
