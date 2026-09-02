'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { addCardAction, removeCardAction, type DashboardState } from './actions'
import styles from './dashboard.module.css'

/** Prevod iz rečnika; nepoznat ključ se prikazuje kao takav, ne kao prazno. */
function translate(messages: Readonly<Record<string, string>>, key: string): string {
  return messages[key] ?? key
}

export interface ToolOption {
  readonly key: string
  readonly name: string
  readonly integrationName: string
  readonly classification: string
}

export interface CardRow {
  readonly id: string
  readonly title: string
  readonly toolKey: string
  readonly format: string
  readonly higherIsBetter: boolean
}

export interface CardManagerLabels {
  readonly configured: string
  readonly none: string
  readonly add: string
  readonly tool: string
  readonly titleSr: string
  readonly titleEn: string
  readonly format: string
  readonly higherIsBetter: string
  readonly higherIsBetterHint: string
  readonly submit: string
  readonly remove: string
  readonly noTools: string
  readonly formats: Readonly<Record<string, string>>
  readonly messages: Readonly<Record<string, string>>
}

/**
 * Podešavanje početne strane klijenta.
 *
 * Nudi SAMO alate koje stvarno nudi neka uključena integracija te
 * organizacije. Kartica koja nema odakle da povuče vrednost na klijentovoj
 * početnoj piše „nedostupno" — a to izgleda kao kvar, ne kao podešavanje.
 */
export function CardManager({
  organizationId,
  cards,
  tools,
  labels,
}: {
  organizationId: string
  cards: readonly CardRow[]
  tools: readonly ToolOption[]
  labels: CardManagerLabels
}) {
  const [addState, add, adding] = useActionState<DashboardState, FormData>(addCardAction, {})
  const [removeState, remove, removing] = useActionState<DashboardState, FormData>(
    removeCardAction,
    {},
  )

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{labels.configured}</h2>
          <span className={styles.count}>{cards.length}</span>
        </div>

        {cards.length === 0 ? (
          <p className={styles.hint}>{labels.none}</p>
        ) : (
          <ul className={styles.cardList}>
            {cards.map((c) => (
              <li key={c.id} className={styles.card}>
                <span className={styles.cardInfo}>
                  <span className={styles.cardTitle}>{c.title}</span>
                  <span className={styles.cardMeta}>
                    {c.toolKey} · {labels.formats[c.format] ?? c.format}
                    {/* Smer je deo značenja: rast dospelih potraživanja je loša vest. */}
                    {c.higherIsBetter ? ' · ↑' : ' · ↓'}
                  </span>
                </span>

                <form action={remove}>
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="cardId" value={c.id} />
                  <Button type="submit" variant="secondary" disabled={removing}>
                    {labels.remove}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {removeState.error ? (
          <p className={`${styles.message} ${styles.bad}`} role="alert">
            {translate(labels.messages, removeState.error)}
          </p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{labels.add}</h2>
        </div>

        {tools.length === 0 ? (
          // Nema uključene sposobnosti — dugme koje nema šta da doda se NE nudi.
          <p className={styles.hint}>{labels.noTools}</p>
        ) : (
          <form action={add} className={styles.form}>
            <input type="hidden" name="organizationId" value={organizationId} />

            <label className={styles.field}>
              <span className={styles.label}>{labels.tool}</span>
              <select name="aiToolKey" className={styles.input} required defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {tools.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} · {t.integrationName}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{labels.titleSr}</span>
                <input
                  type="text"
                  name="titleSr"
                  className={styles.input}
                  required
                  maxLength={60}
                  aria-invalid={addState.fieldErrors?.['titleSr'] ? true : undefined}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>{labels.titleEn}</span>
                <input
                  type="text"
                  name="titleEn"
                  className={styles.input}
                  required
                  maxLength={60}
                  aria-invalid={addState.fieldErrors?.['titleEn'] ? true : undefined}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>{labels.format}</span>
              <select name="format" className={styles.input} defaultValue="number">
                {Object.entries(labels.formats).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.checkRow}>
              <input type="checkbox" name="higherIsBetter" defaultChecked />
              <span>
                <span className={styles.label}>{labels.higherIsBetter}</span>
                <span className={styles.hint}>{labels.higherIsBetterHint}</span>
              </span>
            </label>

            <div className={styles.actions}>
              <Button type="submit" variant="primary" disabled={adding}>
                {labels.submit}
              </Button>
            </div>
          </form>
        )}

        {addState.error ? (
          <>
            <p className={`${styles.message} ${styles.bad}`} role="alert">
              {translate(labels.messages, addState.error)}
            </p>
            {addState.detail ? <p className={styles.detail}>{addState.detail}</p> : null}
          </>
        ) : null}
      </section>
    </>
  )
}
