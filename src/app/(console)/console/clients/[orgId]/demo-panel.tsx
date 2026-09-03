'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { interpolate } from '@/i18n/translator'
import { fillDemoContentAction, type DemoContentState } from './actions'
import styles from './access-panel.module.css'

/**
 * Klijentski prikaz i demo sadržaj, na jednom mestu.
 *
 * Link ka radnom prostoru se prikazuje samo dok traje sesija pristupa. Bez
 * sesije `accessible_org_ids` ne vraća organizaciju, pa bi link vodio na 404 —
 * a link koji vodi na 404 izgleda kao kvar, ne kao pravilo.
 *
 * Prevodi stižu kao GOTOV TEKST, uključujući šablon poruke o uspehu; umetanje
 * brojeva radi `interpolate` na klijentu. Funkcija `t` ne sme da pređe granicu
 * server → klijent.
 */
export function DemoPanel({
  orgSlug,
  isDemo,
  hasSession,
  labels,
}: {
  orgSlug: string
  isDemo: boolean
  hasSession: boolean
  labels: {
    previewTitle: string
    previewOpen: string
    previewNeedSession: string
    demoTitle: string
    demoExplain: string
    demoFill: string
    /** Šablon sa {alerts} i {notes}. */
    demoFilled: string
    messages: Readonly<Record<string, string>>
  }
}) {
  const [state, action, pending] = useActionState<DemoContentState, FormData>(
    fillDemoContentAction,
    {},
  )

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{labels.previewTitle}</h2>
      </div>

      {hasSession ? (
        <a className={styles.link} href={`/w/${orgSlug}`} target="_blank" rel="noreferrer">
          {labels.previewOpen} ↗
        </a>
      ) : (
        <p className={styles.explain}>{labels.previewNeedSession}</p>
      )}

      {isDemo ? (
        <>
          <div className={styles.head}>
            <h2 className={styles.title}>{labels.demoTitle}</h2>
          </div>
          <p className={styles.explain}>{labels.demoExplain}</p>

          <form action={action}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <Button type="submit" disabled={pending || !hasSession}>
              {labels.demoFill}
            </Button>
          </form>

          {state.error ? (
            <p className={styles.error} role="alert">
              {labels.messages[state.error] ?? state.error}
            </p>
          ) : null}

          {state.alerts !== undefined ? (
            <p className={styles.ok} role="status">
              {interpolate(labels.demoFilled, {
                alerts: state.alerts,
                notes: state.notes ?? 0,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
