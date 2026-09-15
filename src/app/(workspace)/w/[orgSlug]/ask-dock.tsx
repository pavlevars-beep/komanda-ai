'use client'

import { useActionState, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { Icon } from '@/ui/primitives/Icon'
import { Button } from '@/ui/primitives/Button'
import { askAction, type AskState } from './pitanja/actions'
import { SaveNoteButton } from './pitanja/save-note-button'
import styles from './ask-dock.module.css'

export interface DockLabels {
  readonly open: string
  readonly close: string
  readonly title: string
  readonly placeholder: string
  readonly thinking: string
  readonly full: string
  readonly saveNote: string
  readonly savedNote: string
  readonly none: string
  readonly messages: Readonly<Record<string, string>>
}

/**
 * Traka za pitanje, dostupna sa svakog ekrana.
 *
 * Razlog nije udobnost nego TRENUTAK. Pitanje se rodi dok se gleda nešto drugo —
 * dok se čita spisak dužnika ili izveštaj — a odlazak na zaseban ekran znači da
 * se to mesto izgubi. Ko izgubi mesto, najčešće ne pita.
 *
 * Odgovor se prikazuje NA LICU MESTA, pa se rad nastavlja odatle. Ceo razgovor
 * ostaje na svojoj stranici, jedan klik dalje, za kada treba istorija.
 */
export function AskDock({
  orgSlug,
  suggestions,
  labels,
}: {
  orgSlug: string
  suggestions: readonly string[]
  labels: DockLabels
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, {})
  const pathname = usePathname()

  /*
   * Na početnoj se traka ne pokazuje: tamo polje za pitanje već stoji u toku
   * stranice, sa predlozima izvedenim iz podataka. Dva ista ulaza na istom
   * ekranu ne daju dva puta više pitanja nego jedno pitanje više o tome koja su
   * razlika.
   *
   * Isto na stranici razgovora — ona JESTE razgovor.
   */
  const home = pathname === `/w/${orgSlug}`
  const conversation = pathname === `/w/${orgSlug}/pitanja`
  if (home || conversation) return null

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={styles.trigger}>
        <Icon name="ask" size={16} />
        {labels.open}
      </button>
    )
  }

  return (
    <div className={styles.dock} role="dialog" aria-label={labels.title}>
      <div className={styles.head}>
        <span className={styles.title}>
          <Icon name="ask" size={16} />
          {labels.title}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={styles.close}
          aria-label={labels.close}
        >
          ✕
        </button>
      </div>

      <div className={styles.body}>
        {/*
          Poslednje pitanje i odgovor, da se vidi šta je upravo odgovoreno.
          Ceo tok ostaje na svojoj stranici — traka nije zamena za istoriju.
        */}
        {pending ? <p className={styles.thinking}>{labels.thinking}</p> : null}

        {state.error ? (
          <p className={styles.error} role="alert">
            {labels.messages[state.error] ?? state.error}
          </p>
        ) : null}

        {!pending && state.answer ? (
          <div className={styles.answer}>
            <p className={styles.answerText}>{state.answer.text}</p>
            <SaveNoteButton
              orgSlug={orgSlug}
              messageId={state.answer.id}
              label={labels.saveNote}
              savedLabel={labels.savedNote}
              messages={labels.messages}
            />
          </div>
        ) : null}

        {!pending && !state.answer && suggestions.length > 0 ? (
          <ul className={styles.chips}>
            {suggestions.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => setText(s)} className={styles.chip}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {suggestions.length === 0 ? <p className={styles.none}>{labels.none}</p> : null}
      </div>

      <form
        action={(formData) => {
          action(formData)
          setText('')
        }}
        className={styles.form}
      >
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input
          type="text"
          name="question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={labels.placeholder}
          maxLength={500}
          className={styles.input}
          aria-label={labels.title}
        />
        <Button type="submit" disabled={pending || text.trim() === ''}>
          <Icon name="send" size={15} />
        </Button>
      </form>

      <Link href={`/w/${orgSlug}/pitanja` as Route} className={styles.full}>
        {labels.full}
      </Link>
    </div>
  )
}
