'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Field } from '@/ui/primitives/Field'
import { requestReset, setNewPassword, type RequestState, type SetState } from './actions'
import styles from '../login/login.module.css'

export interface RequestLabels {
  readonly email: string
  readonly action: string
  readonly sent: string
  readonly rateLimited: string
  readonly invalid: string
}

export function RequestForm({ labels }: { labels: RequestLabels }) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(requestReset, {})

  /*
   * Potvrda se prikazuje UMESTO forme, ne pored nje.
   *
   * Ostavljena forma ispod poruke „poslali smo mejl" poziva na ponovni
   * pritisak, a svaki sledeći pritisak poništava prethodni link — pa čovek
   * dobije tri mejla od kojih rade samo poslednji.
   */
  if (state.sent) {
    return (
      <p className={styles.notice} role="status">
        {labels.sent}
      </p>
    )
  }

  const message =
    state.error === 'rate_limited'
      ? labels.rateLimited
      : state.error
        ? labels.invalid
        : undefined

  return (
    <form action={formAction} className={styles.form}>
      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
      />

      {message ? (
        <p className={styles.error} role="alert">
          {message}
          {state.requestId ? <span className={styles.ref}>{state.requestId.slice(0, 8)}</span> : null}
        </p>
      ) : null}

      <Button type="submit" variant="primary" block large disabled={pending}>
        {labels.action}
      </Button>
    </form>
  )
}

export interface SetLabels {
  readonly password: string
  readonly confirm: string
  readonly action: string
  readonly tooShort: string
  readonly mismatch: string
  readonly noSession: string
  readonly rejected: string
}

export function SetPasswordForm({ labels }: { labels: SetLabels }) {
  const [state, formAction, pending] = useActionState<SetState, FormData>(setNewPassword, {})

  const message =
    state.error === 'too_short'
      ? labels.tooShort
      : state.error === 'mismatch'
        ? labels.mismatch
        : state.error === 'no_session'
          ? labels.noSession
          : state.error === 'rejected'
            ? labels.rejected
            : undefined

  return (
    <form action={formAction} className={styles.form}>
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        autoFocus
      />
      <Field
        label={labels.confirm}
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />

      {message ? (
        <p className={styles.error} role="alert">
          {message}
          {state.requestId ? <span className={styles.ref}>{state.requestId.slice(0, 8)}</span> : null}
        </p>
      ) : null}

      <Button type="submit" variant="primary" block large disabled={pending}>
        {labels.action}
      </Button>
    </form>
  )
}
