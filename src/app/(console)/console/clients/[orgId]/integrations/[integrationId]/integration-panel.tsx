'use client'

import { interpolate } from '@/i18n/translator'
import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import {
  saveCredentialAction,
  testConnectionAction,
  type IntegrationState,
} from '../actions'
import styles from '../integrations.module.css'

/** Prevod iz rečnika; nepoznat ključ se prikazuje kao takav, ne kao prazno. */
function translate(messages: Readonly<Record<string, string>>, key: string): string {
  return messages[key] ?? key
}

export interface PanelLabels {
  readonly test: string
  /** Šablon sa {ms}; funkcija ne može da pređe granicu ka klijentu. */
  readonly testOk: string
  readonly testFailed: string
  readonly credential: string
  readonly credentialHint: string
  readonly credentialSave: string
  readonly credentialSaved: string
  readonly credentialNone: string
  readonly currentHint: string | null
  /**
   * Rečnik prevoda, ne funkcija.
   *
   * Akcija vraća KLJUČ poruke tek pri izvršavanju, pa prevod mora da se desi
   * ovde. Funkcija `(key) => t(key)` ne može da pređe granicu server→klijent —
   * React je odbija pri serijalizaciji i ceo render pukne.
   */
  readonly messages: Readonly<Record<string, string>>
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
              ? interpolate(labels.testOk, { ms: testState.tested.latencyMs })
              : `${labels.testFailed}${testState.tested.message ? ` ${testState.tested.message}` : ''}`}
          </p>
        ) : null}

        {testState.error ? (
          <p className={`${styles.message} ${styles.bad}`} role="alert">
            {translate(labels.messages, testState.error)}
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
              {translate(labels.messages, credState.fieldErrors?.value ?? credState.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
