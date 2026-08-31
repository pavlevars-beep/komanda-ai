'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Field } from '@/ui/primitives/Field'
import { signIn, type LoginState } from './actions'
import styles from './login.module.css'

interface Labels {
  readonly email: string
  readonly password: string
  readonly action: string
  readonly invalid: string
  readonly rateLimited: string
}

export function LoginForm({ labels, next }: { labels: Labels; next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, {})

  const message =
    state.error === 'rate_limited'
      ? labels.rateLimited
      : state.error
        ? labels.invalid
        : undefined

  return (
    <form action={formAction} className={styles.form}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field
        label={labels.email}
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
      />
      <Field
        label={labels.password}
        name="password"
        type="password"
        autoComplete="current-password"
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
