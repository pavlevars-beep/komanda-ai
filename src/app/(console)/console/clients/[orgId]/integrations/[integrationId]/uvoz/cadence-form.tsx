'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { saveCadence, type CadenceState } from './actions'
import styles from './import.module.css'

export interface CadenceLabels {
  readonly days: string
  readonly byTime: string
  readonly timeZone: string
  readonly grace: string
  readonly graceUnit: string
  readonly graceHint: string
  readonly enabled: string
  readonly pausedUntil: string
  readonly pausedHint: string
  readonly save: string
  readonly saved: string
  readonly remove: string
  readonly none: string
  readonly weekdays: readonly { value: number; label: string }[]
  readonly zones: readonly string[]
  readonly messages: Readonly<Record<string, string>>
}

export interface CadenceValue {
  readonly weekdays: readonly number[]
  readonly byTime: string
  readonly timeZone: string
  readonly graceMinutes: number
  readonly pausedUntil: string | null
  readonly enabled: boolean
}

export interface CadenceStatus {
  readonly label: string
  readonly tone: Tone
  readonly detail: string
}

const DEFAULT_VALUE: CadenceValue = {
  weekdays: [1, 2, 3, 4, 5],
  byTime: '08:00',
  timeZone: 'Europe/Belgrade',
  graceMinutes: 30,
  pausedUntil: null,
  enabled: true,
}

/**
 * Dogovaranje ritma za jednu vrstu podatka.
 *
 * Dani su dugmad, ne višestruki izbor sa liste: raspored se čita u jednom
 * pogledu, a „radnim danima" se vidi kao oblik umesto da se pročita.
 *
 * Kada ritam nije dogovoren, obrazac je i dalje TU, sa predlogom — ne iza
 * dugmeta „dodaj". Praćenje koje traži još jedan klik se ne podesi, a onda
 * tišina prolazi neprimećeno, što je upravo ono što ovaj ekran sprečava.
 */
export function CadenceForm({
  organizationId,
  integrationId,
  kind,
  kindLabel,
  value,
  status,
  labels,
}: {
  organizationId: string
  integrationId: string
  kind: string
  kindLabel: string
  value: CadenceValue | null
  status: CadenceStatus | null
  labels: CadenceLabels
}) {
  const initial = value ?? DEFAULT_VALUE
  const [state, action, pending] = useActionState<CadenceState, FormData>(saveCadence, {})
  const [days, setDays] = useState<readonly number[]>(initial.weekdays)

  const toggle = (day: number): void => {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    )
  }

  return (
    <form action={action} className={styles.card}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="integrationId" value={integrationId} />
      <input type="hidden" name="kind" value={kind} />

      <div className={styles.cadenceHead}>
        <span className={styles.label}>{kindLabel}</span>
        {status ? (
          <StatusBadge tone={status.tone} label={status.label} />
        ) : (
          <span className={styles.hint}>{labels.none}</span>
        )}
      </div>

      {status?.detail ? <p className={styles.hint}>{status.detail}</p> : null}

      <div className={styles.group}>
        <span className={styles.label}>{labels.days}</span>
        <div className={styles.dayRow}>
          {labels.weekdays.map((day) => {
            const on = days.includes(day.value)
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => toggle(day.value)}
                aria-pressed={on}
                className={on ? styles.dayOn : styles.dayOff}
              >
                {day.label}
              </button>
            )
          })}
        </div>
        {/*
          Stanje dugmadi se prenosi skrivenim poljima: obrazac se šalje i bez
          JavaScript-a, a i sa njim je jedan izvor istine umesto dva.
        */}
        {days.map((day) => (
          <input key={day} type="hidden" name="weekdays" value={day} />
        ))}
      </div>

      <div className={styles.row}>
        <label className={styles.group}>
          <span className={styles.label}>{labels.byTime}</span>
          <input
            type="time"
            name="byTime"
            defaultValue={initial.byTime}
            required
            className={styles.select}
          />
        </label>

        <label className={styles.group}>
          <span className={styles.label}>{labels.timeZone}</span>
          <select name="timeZone" defaultValue={initial.timeZone} className={styles.select}>
            {labels.zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.group}>
          <span className={styles.label}>
            {labels.grace} ({labels.graceUnit})
          </span>
          <input
            type="number"
            name="graceMinutes"
            min={0}
            max={1440}
            step={5}
            defaultValue={initial.graceMinutes}
            className={styles.select}
          />
        </label>

        <label className={styles.group}>
          <span className={styles.label}>{labels.pausedUntil}</span>
          <input
            type="date"
            name="pausedUntil"
            defaultValue={initial.pausedUntil ? initial.pausedUntil.slice(0, 10) : ''}
            className={styles.select}
          />
        </label>
      </div>

      {/*
        Objašnjenja stoje kao JEDAN blok. Razmaknuti pasusi se čitaju kao dve
        nepovezane rečenice koje lebde ispod obrasca, a obe objašnjavaju polja
        neposredno iznad njih.
      */}
      <div className={styles.hints}>
        <p className={styles.hint}>{labels.graceHint}</p>
        <p className={styles.hint}>{labels.pausedHint}</p>
      </div>

      <label className={styles.checkRow}>
        <input type="checkbox" name="enabled" value="1" defaultChecked={initial.enabled} />
        <span>{labels.enabled}</span>
      </label>

      <div className={styles.actions}>
        <Button type="submit" disabled={pending || days.length === 0}>
          {labels.save}
        </Button>
        {value ? (
          <Button type="submit" name="remove" value="1" variant="ghost" disabled={pending}>
            {labels.remove}
          </Button>
        ) : null}
      </div>

      {state.error ? (
        <p className={styles.error}>{labels.messages[state.error] ?? state.error}</p>
      ) : state.saved ? (
        <p className={styles.ok}>{labels.saved}</p>
      ) : null}
    </form>
  )
}
