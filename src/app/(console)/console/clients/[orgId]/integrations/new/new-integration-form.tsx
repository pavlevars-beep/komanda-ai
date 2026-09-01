'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { StatusBadge } from '@/ui/patterns/StatusBadge'
import { createIntegrationAction, type IntegrationState } from '../actions'
import styles from '../integrations.module.css'

export interface CatalogEntry {
  readonly key: string
  readonly name: string
  readonly category: string
  readonly availability: 'ga' | 'beta' | 'planned'
  readonly supportedAuth: readonly string[]
  /** True samo ako je konektor stvarno registrovan u kodu. */
  readonly implemented: boolean
}

export interface NewIntegrationLabels {
  readonly catalog: string
  readonly name: string
  readonly environment: string
  readonly authType: string
  readonly config: string
  readonly configHint: string
  readonly sandbox: string
  readonly production: string
  readonly create: string
  readonly availability: (a: 'ga' | 'beta' | 'planned') => string
  readonly plannedHint: string
  readonly message: (key: string) => string
}

/**
 * Izbor konektora i osnovna konfiguracija.
 *
 * Tipovi koji nisu implementirani prikazuju se, ali se ne mogu izabrati.
 * Katalog u bazi je spisak namera; registar konektora u kodu je spisak onoga
 * što stvarno radi, i akcija na serveru proverava isto — dugme koje bi
 * napravilo integraciju bez konektora bilo bi lažna funkcionalnost.
 */
export function NewIntegrationForm({
  organizationId,
  catalog,
  labels,
}: {
  organizationId: string
  catalog: readonly CatalogEntry[]
  labels: NewIntegrationLabels
}) {
  const [state, action, pending] = useActionState<IntegrationState, FormData>(
    createIntegrationAction,
    {},
  )

  const [selected, setSelected] = useState<CatalogEntry | null>(
    catalog.find((c) => c.implemented) ?? null,
  )

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="connectorTypeKey" value={selected?.key ?? ''} />

      <div className={styles.group}>
        <span className={styles.label}>{labels.catalog}</span>
        <div className={styles.catalog}>
          {catalog.map((entry) => {
            const disabled = !entry.implemented
            const classes = [
              styles.type,
              selected?.key === entry.key ? styles.typeSelected : '',
              disabled ? styles.typeDisabled : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={entry.key}
                type="button"
                className={classes}
                disabled={disabled}
                aria-pressed={selected?.key === entry.key}
                onClick={() => setSelected(entry)}
              >
                <span className={styles.typeName}>{entry.name}</span>
                <span className={styles.typeMeta}>{entry.category}</span>
                <StatusBadge
                  tone={entry.implemented ? 'ok' : 'neutral'}
                  label={labels.availability(entry.availability)}
                />
                {disabled ? <span className={styles.typeMeta}>{labels.plannedHint}</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="name">
          {labels.name}
        </label>
        <input
          id="name"
          name="name"
          className={styles.input}
          required
          maxLength={80}
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className={styles.fieldError} role="alert">
            {labels.message(state.fieldErrors.name)}
          </p>
        ) : null}
      </div>

      <div className={styles.row}>
        <div className={styles.group}>
          <label className={styles.label} htmlFor="environment">
            {labels.environment}
          </label>
          <select id="environment" name="environment" className={styles.select} defaultValue="sandbox">
            <option value="sandbox">{labels.sandbox}</option>
            <option value="production">{labels.production}</option>
          </select>
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="authType">
            {labels.authType}
          </label>
          <select id="authType" name="authType" className={styles.select}>
            {(selected?.supportedAuth.length ? selected.supportedAuth : ['none']).map((auth) => (
              <option key={auth} value={auth}>
                {auth}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="config">
          {labels.config}
        </label>
        <textarea
          id="config"
          name="config"
          className={styles.textarea}
          defaultValue="{}"
          spellCheck={false}
          aria-describedby="config-hint"
        />
        <p id="config-hint" className={styles.hint}>
          {labels.configHint}
        </p>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={pending || !selected}>
          {labels.create}
        </Button>
      </div>

      {state.error ? (
        <p className={`${styles.message} ${styles.bad}`} role="alert">
          {labels.message(state.error)}
        </p>
      ) : null}
    </form>
  )
}
