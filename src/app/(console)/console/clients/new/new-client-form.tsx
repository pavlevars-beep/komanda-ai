'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { slugify } from '@/core/shared/slug'
import { createClientAction, type CreateClientState } from './actions'
import styles from './new-client.module.css'

export interface NewClientLabels {
  readonly displayName: string
  readonly legalName: string
  readonly slug: string
  readonly slugHint: (slug: string) => string
  readonly industry: string
  readonly currency: string
  readonly plan: string
  readonly locale: string
  readonly create: string
  readonly message: (key: string) => string
}

/**
 * Osnovni podaci o klijentu.
 *
 * Adresa radnog prostora se predlaže iz naziva, ali ostaje izmenjiva —
 * konsultant je vidi pre nego što je potvrdi. Ona ulazi u URL koji klijent
 * kasnije čuva u obeleživačima, pa je bolje da se o njoj odluči sada nego
 * da se menja posle.
 */
export function NewClientForm({ labels }: { labels: NewClientLabels }) {
  const [state, action, pending] = useActionState<CreateClientState, FormData>(
    createClientAction,
    {},
  )

  const [displayName, setDisplayName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  const effectiveSlug = slugTouched ? slug : slugify(displayName)

  return (
    <form action={action} className={styles.form}>
      <div className={styles.group}>
        <label className={styles.label} htmlFor="displayName">
          {labels.displayName}
        </label>
        <input
          id="displayName"
          name="displayName"
          className={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={80}
          autoFocus
          aria-invalid={state.fieldErrors?.displayName ? true : undefined}
        />
        {state.fieldErrors?.displayName ? (
          <p className={styles.fieldError} role="alert">
            {labels.message(state.fieldErrors.displayName)}
          </p>
        ) : null}
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="legalName">
          {labels.legalName}
        </label>
        <input
          id="legalName"
          name="legalName"
          className={styles.input}
          required
          maxLength={120}
          aria-invalid={state.fieldErrors?.legalName ? true : undefined}
        />
        {state.fieldErrors?.legalName ? (
          <p className={styles.fieldError} role="alert">
            {labels.message(state.fieldErrors.legalName)}
          </p>
        ) : null}
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="slug">
          {labels.slug}
        </label>
        <input
          id="slug"
          name="slug"
          className={`${styles.input} ${styles.mono}`}
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          required
          maxLength={50}
          aria-invalid={state.fieldErrors?.slug ? true : undefined}
          aria-describedby="slug-hint"
        />
        {state.fieldErrors?.slug ? (
          <p className={styles.fieldError} role="alert">
            {labels.message(state.fieldErrors.slug)}
          </p>
        ) : (
          <p id="slug-hint" className={styles.hint}>
            {labels.slugHint(effectiveSlug || '…')}
          </p>
        )}
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="industry">
          {labels.industry}
        </label>
        <input id="industry" name="industry" className={styles.input} maxLength={80} />
      </div>

      <div className={styles.row}>
        <div className={styles.group}>
          <label className={styles.label} htmlFor="currency">
            {labels.currency}
          </label>
          <select id="currency" name="currency" className={styles.select} defaultValue="RSD">
            <option value="RSD">RSD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="plan">
            {labels.plan}
          </label>
          <select id="plan" name="plan" className={styles.select} defaultValue="standard">
            <option value="standard">Standard</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="locale">
            {labels.locale}
          </label>
          <select id="locale" name="locale" className={styles.select} defaultValue="sr">
            <option value="sr">Srpski</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          {labels.create}
        </Button>
      </div>

      {state.error && !state.fieldErrors ? (
        <p className={styles.error} role="alert">
          {labels.message(state.error)}
        </p>
      ) : null}
    </form>
  )
}
