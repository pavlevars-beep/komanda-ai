'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import type { BusinessRules } from '@/core/rules/business-rules'
import { saveRulesAction, type RulesState } from './actions'
import styles from './rules.module.css'

export interface RuleField {
  readonly name: keyof BusinessRules
  readonly label: string
  readonly hint: string
  readonly value: string
  /** Popunjeno samo za polja sa zatvorenim skupom vrednosti. */
  readonly options?: readonly { readonly value: string; readonly label: string }[]
}

export interface RuleGroup {
  readonly title: string
  readonly fields: readonly RuleField[]
}

/**
 * Izmena pragova.
 *
 * Greške se prikazuju UZ POLJE, ne kao jedna poruka na dnu. Poruka „kritično
 * kašnjenje mora da bude duže od upozorenja" bez oznake na kom polju ostavlja
 * korisnika da pogađa koje od jedanaest polja da menja.
 */
export function RulesForm({
  orgSlug,
  groups,
  labels,
}: {
  orgSlug: string
  groups: readonly RuleGroup[]
  labels: {
    save: string
    saved: string
    messages: Readonly<Record<string, string>>
  }
}) {
  const [state, action, pending] = useActionState<RulesState, FormData>(saveRulesAction, {})

  const errorFor = (name: string) => {
    const key = state.fieldErrors?.[name]
    return key ? (labels.messages[key] ?? key) : null
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="orgSlug" value={orgSlug} />

      {groups.map((group) => (
        <fieldset key={group.title} className={styles.group}>
          <legend className={styles.groupTitle}>{group.title}</legend>

          <div className={styles.fields}>
            {group.fields.map((field) => {
              const error = errorFor(field.name)
              return (
                <div key={field.name} className={styles.field}>
                  <label className={styles.label} htmlFor={`rule-${field.name}`}>
                    {field.label}
                  </label>

                  {field.options ? (
                    <select
                      id={`rule-${field.name}`}
                      name={field.name}
                      className={styles.select}
                      defaultValue={field.value}
                    >
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`rule-${field.name}`}
                      name={field.name}
                      className={styles.input}
                      inputMode="decimal"
                      defaultValue={field.value}
                      aria-invalid={error ? 'true' : undefined}
                      required
                    />
                  )}

                  <span className={styles.hint}>{field.hint}</span>
                  {error ? (
                    <span className={styles.fieldError} role="alert">
                      {error}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          <Icon name="check" size={16} />
          {labels.save}
        </Button>

        {state.error && !state.fieldErrors ? (
          <span className={styles.error} role="alert">
            {labels.messages[state.error] ?? state.error}
          </span>
        ) : null}
        {state.saved ? (
          <span className={styles.ok} role="status">
            {labels.saved}
          </span>
        ) : null}
      </div>
    </form>
  )
}
