'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import { interpolate } from '@/i18n/translator'
import { saveBriefPrefs, type BriefPrefsState } from './actions'
import styles from './prefs.module.css'

export interface SectionRow {
  readonly key: string
  readonly label: string
  readonly visible: boolean
}

export interface PrefsLabels {
  readonly order: string
  readonly up: string
  readonly down: string
  readonly show: string
  /** Šablon sa {position}. */
  readonly position: string
  readonly save: string
  readonly saved: string
  readonly reset: string
  readonly resetDone: string
  /** Šablon sa {count}. */
  readonly hiddenCount: string
  readonly allHidden: string
  readonly messages: Readonly<Record<string, string>>
}

/**
 * Redosled se menja DUGMADIMA, ne prevlačenjem.
 *
 * Prevlačenje bez alternative je nedostupno tastaturi i čitaču ekrana, a ovo je
 * ekran podešavanja — mesto na kojem se korisnik zadržava tačno jednom i mora
 * da uspe iz prve. Dugme „gore/dole" radi svuda, i za miša je jednako brzo na
 * spisku od pet stavki.
 */
export function PrefsForm({
  orgSlug,
  rows,
  labels,
}: {
  orgSlug: string
  rows: readonly SectionRow[]
  labels: PrefsLabels
}) {
  const [state, action, pending] = useActionState<BriefPrefsState, FormData>(saveBriefPrefs, {})
  const [items, setItems] = useState<readonly SectionRow[]>(rows)

  const move = (index: number, by: number): void => {
    const target = index + by
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const moved = next[index]!
    next[index] = next[target]!
    next[target] = moved
    setItems(next)
  }

  const toggle = (index: number): void => {
    setItems(items.map((row, i) => (i === index ? { ...row, visible: !row.visible } : row)))
  }

  const hidden = items.filter((row) => !row.visible).length

  return (
    <form action={action} className={styles.card}>
      <input type="hidden" name="orgSlug" value={orgSlug} />

      <div className={styles.head}>
        <span className={styles.label}>{labels.order}</span>
        {hidden > 0 ? (
          <span className={styles.hint}>{interpolate(labels.hiddenCount, { count: hidden })}</span>
        ) : null}
      </div>

      <ol className={styles.list}>
        {items.map((row, index) => (
          <li key={row.key} className={row.visible ? styles.row : styles.rowOff}>
            <span className={styles.position} aria-hidden="true">
              {index + 1}
            </span>

            <label className={styles.name}>
              <input
                type="checkbox"
                name="visible"
                value={row.key}
                checked={row.visible}
                onChange={() => toggle(index)}
              />
              <span>{row.label}</span>
            </label>

            {/*
              Redosled se šalje skrivenim poljima, u prikazanom poretku. Jedan
              izvor istine: ono što se vidi na ekranu je tačno ono što se upisuje.
            */}
            <input type="hidden" name="order" value={row.key} />

            <div className={styles.moves}>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className={styles.move}
                aria-label={`${labels.up}: ${row.label}`}
                title={labels.up}
              >
                <Icon name="chevronUp" size={15} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className={styles.move}
                aria-label={`${labels.down}: ${row.label}`}
                title={labels.down}
              >
                <Icon name="chevronDown" size={15} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {hidden === items.length ? <p className={styles.warn}>{labels.allHidden}</p> : null}

      <div className={styles.actions}>
        <Button type="submit" disabled={pending}>
          {labels.save}
        </Button>
        <Button type="submit" name="reset" value="1" variant="ghost" disabled={pending}>
          {labels.reset}
        </Button>

        {state.error ? (
          <span className={styles.error} role="alert">
            {labels.messages[state.error] ?? state.error}
          </span>
        ) : state.saved ? (
          <span className={styles.ok} role="status">
            {labels.saved}
          </span>
        ) : state.reset ? (
          <span className={styles.ok} role="status">
            {labels.resetDone}
          </span>
        ) : null}
      </div>
    </form>
  )
}
