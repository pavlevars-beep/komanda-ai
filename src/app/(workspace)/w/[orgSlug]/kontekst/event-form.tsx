'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import {
  addContextEventAction,
  deleteContextEventAction,
  type ContextState,
} from './actions'
import styles from './context.module.css'

export interface KindOption {
  readonly key: string
  readonly label: string
}

/**
 * Unos kontekstnog događaja.
 *
 * Četiri izbora postupanja su nezavisna i podrazumevano uključena onako kako
 * se ponaša najčešći slučaj — veliki jednokratni posao: izuzmi iz osnovice,
 * zadrži u zbirovima, izuzmi iz prognoze, prikaži napomenu. Novac je stvarno
 * ušao, ali se ne ponavlja.
 */
export function ContextEventForm({
  orgSlug,
  kinds,
  labels,
}: {
  orgSlug: string
  kinds: readonly KindOption[]
  labels: {
    title: string
    kind: string
    note: string
    startsOn: string
    endsOn: string
    endsOnHint: string
    revenueImpact: string
    revenueImpactHint: string
    treatment: string
    excludeFromBaseline: string
    keepInTotals: string
    excludeFromForecast: string
    annotateComparison: string
    add: string
    saved: string
    messages: Readonly<Record<string, string>>
  }
}) {
  const [state, action, pending] = useActionState<ContextState, FormData>(
    addContextEventAction,
    {},
  )

  const fieldError = (name: string) => {
    const key = state.fieldErrors?.[name]
    return key ? (labels.messages[key] ?? key) : null
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="orgSlug" value={orgSlug} />

      <div className={styles.row}>
        <div className={styles.group}>
          <label className={styles.label} htmlFor="ctx-title">
            {labels.title}
          </label>
          <input id="ctx-title" name="title" className={styles.input} maxLength={120} required />
          {fieldError('title') ? (
            <span className={styles.fieldError}>{fieldError('title')}</span>
          ) : null}
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="ctx-kind">
            {labels.kind}
          </label>
          <select id="ctx-kind" name="kind" className={styles.select} defaultValue="one_off_project">
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.group}>
          <label className={styles.label} htmlFor="ctx-from">
            {labels.startsOn}
          </label>
          <input id="ctx-from" name="startsOn" type="date" className={styles.input} required />
          {fieldError('startsOn') ? (
            <span className={styles.fieldError}>{fieldError('startsOn')}</span>
          ) : null}
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="ctx-to">
            {labels.endsOn}
          </label>
          <input id="ctx-to" name="endsOn" type="date" className={styles.input} />
          <span className={styles.hint}>{labels.endsOnHint}</span>
          {fieldError('endsOn') ? (
            <span className={styles.fieldError}>{fieldError('endsOn')}</span>
          ) : null}
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="ctx-impact">
            {labels.revenueImpact}
          </label>
          <input
            id="ctx-impact"
            name="revenueImpact"
            className={styles.input}
            inputMode="decimal"
            placeholder="32000000"
          />
        </div>
      </div>

      <span className={styles.hint}>{labels.revenueImpactHint}</span>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="ctx-note">
          {labels.note}
        </label>
        <textarea id="ctx-note" name="note" className={styles.textarea} maxLength={500} />
      </div>

      <div className={styles.group}>
        <span className={styles.label}>{labels.treatment}</span>
        <div className={styles.checks}>
          <label className={styles.check}>
            <input type="checkbox" name="excludeFromBaseline" defaultChecked />
            {labels.excludeFromBaseline}
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="keepInTotals" defaultChecked />
            {labels.keepInTotals}
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="excludeFromForecast" defaultChecked />
            {labels.excludeFromForecast}
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="annotateComparison" defaultChecked />
            {labels.annotateComparison}
          </label>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          <Icon name="plus" size={16} />
          {labels.add}
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

export function DeleteEventButton({
  orgSlug,
  eventId,
  label,
}: {
  orgSlug: string
  eventId: string
  label: string
}) {
  const [, action, pending] = useActionState<ContextState, FormData>(
    deleteContextEventAction,
    {},
  )

  return (
    <form action={action}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {label}
      </Button>
    </form>
  )
}
