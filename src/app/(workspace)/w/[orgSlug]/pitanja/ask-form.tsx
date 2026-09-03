'use client'

import { useActionState, useRef } from 'react'
import { Button } from '@/ui/primitives/Button'
import { askAction, type AskState } from './actions'
import styles from './ask.module.css'

/**
 * Polje za pitanje sa predlozima.
 *
 * Predlozi popunjavaju polje umesto da odmah šalju pitanje. Klik koji odmah
 * pokrene upit ne ostavlja priliku da se pitanje doradi, a upravo doterivanje
 * predloga je način na koji korisnik nauči šta alat ume.
 *
 * Prosleđuju se GOTOVI TEKSTOVI, ne funkcija za prevod — serverska komponenta
 * ne sme da pošalje funkciju klijentskoj.
 */
export function AskForm({
  orgSlug,
  placeholder,
  sendLabel,
  suggestionsLabel,
  suggestions,
  errors,
}: {
  orgSlug: string
  placeholder: string
  sendLabel: string
  suggestionsLabel: string
  suggestions: readonly string[]
  errors: Readonly<Record<string, string>>
}) {
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, {})
  const field = useRef<HTMLTextAreaElement>(null)

  return (
    <div className={styles.form}>
      <form
        action={action}
        className={styles.form}
        // Polje se prazni tek kad zahtev krene, ne pri grešci u validaciji —
        // inače korisnik izgubi tekst koji je upravo napisao.
        onSubmit={() => {
          window.setTimeout(() => {
            if (field.current) field.current.value = ''
          }, 0)
        }}
      >
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <div className={styles.row}>
          <textarea
            ref={field}
            name="question"
            rows={2}
            className={styles.input}
            placeholder={placeholder}
            maxLength={500}
            required
          />
          <Button type="submit" disabled={pending}>
            {sendLabel}
          </Button>
        </div>
      </form>

      {state.error ? (
        <p className={styles.error} role="alert">
          {errors[state.error] ?? state.error}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <div className={styles.suggestions}>
          <span className={styles.suggestionsLabel}>{suggestionsLabel}</span>
          <div className={styles.chips}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.chip}
                onClick={() => {
                  if (!field.current) return
                  field.current.value = s
                  field.current.focus()
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
