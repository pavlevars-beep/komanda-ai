'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import {
  saveCredentialAction,
  testConnectionAction,
  type IntegrationState,
} from '../actions'
import styles from '../integrations.module.css'

export interface PanelLabels {
  readonly test: string
  readonly testOk: (ms: number) => string
  readonly testFailed: string
  readonly credential: string
  readonly credentialHint: string
  readonly credentialSave: string
  readonly credentialSaved: string
  readonly credentialNone: string
  readonly currentHint: string | null
  readonly message: (key: string) => string
}

/**
 * Provera veze i unos kredencijala.
 *
 * Kredencijal se posle snimanja nikad ne prikazuje — polje uvek kreće prazno,
 * a jedina operacija nad postojećim je zamena. Zbog toga ovde i ne postoji
 * dugme „prikaži lozinku": vrednost ne postoji ni na serveru u obliku koji bi
 * se mogao vratiti.
 */
export function IntegrationPanel({
  organizationId,
  integrationId,
  authType,
  labels,
}: {
  organizationId: string
  integrationId: string
  authType: string
  labels: PanelLabels
}) {
  const [testState, testAction, testing] = useActionState<IntegrationState, FormData>(
    testConnectionAction,
    {},
  )
  const [credState, credAction, saving] = useActionState<IntegrationState, FormData>(
    saveCredentialAction,
    {},
  )

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{labels.test}</h2>
        </div>

        <form action={testAction} className={styles.actions}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="integrationId" value={integrationId} />
          <Button type="submit" variant="secondary" disabled={testing}>
            {labels.test}
          </Button>
        </form>

        {testState.tested ? (
          <p
            className={`${styles.message} ${testState.tested.ok ? styles.ok : styles.bad}`}
            role="status"
          >
            {testState.tested.ok
              ? labels.testOk(testState.tested.latencyMs)
              : `${labels.testFailed}${testState.tested.message ? ` ${testState.tested.message}` : ''}`}
          </p>
        ) : null}

        {testState.error ? (
          <p className={`${styles.message} ${styles.bad}`} role="alert">
            {labels.message(testState.error)}
          </p>
        ) : null}
      </section>

      {authType !== 'none' ? (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{labels.credential}</h2>
            <span className={styles.hint}>{labels.currentHint ?? labels.credentialNone}</span>
          </div>

          <form action={credAction} className={styles.group}>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="authType" value={authType} />

            <input
              type="password"
              name="value"
              className={styles.input}
              autoComplete="off"
              required
              maxLength={4096}
              aria-invalid={credState.fieldErrors?.value ? true : undefined}
              aria-describedby="credential-hint"
            />
            <p id="credential-hint" className={styles.hint}>
              {labels.credentialHint}
            </p>

            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={saving}>
                {labels.credentialSave}
              </Button>
            </div>
          </form>

          {credState.credentialSaved ? (
            <p className={`${styles.message} ${styles.ok}`} role="status">
              {labels.credentialSaved}
            </p>
          ) : credState.error ? (
            <p className={`${styles.message} ${styles.bad}`} role="alert">
              {labels.message(credState.fieldErrors?.value ?? credState.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
