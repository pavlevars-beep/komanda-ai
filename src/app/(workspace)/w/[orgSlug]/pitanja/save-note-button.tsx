'use client'

import { useActionState } from 'react'
import { Icon } from '@/ui/primitives/Icon'
import { saveAnswerAsNote, type SaveNoteState } from './actions'
import styles from './ask.module.css'

/**
 * Čuvanje odgovora kao beleške.
 *
 * Šalje se SAMO identifikator poruke; tekst se čita iz baze. Slanje teksta iz
 * pregledača značilo bi da beleška tvrdi da je odgovor, a nosi ono što je
 * pregledač poslao.
 *
 * Posle uspeha dugme nestaje i ostaje potvrda. Dugme koje i dalje stoji poziva
 * na drugi klik, a druga beleška o istom odgovoru nikome ne treba.
 */
export function SaveNoteButton({
  orgSlug,
  messageId,
  label,
  savedLabel,
  messages,
}: {
  orgSlug: string
  messageId: string
  label: string
  savedLabel: string
  messages: Readonly<Record<string, string>>
}) {
  const [state, action, pending] = useActionState<SaveNoteState, FormData>(saveAnswerAsNote, {})

  if (state.saved) {
    return (
      <span className={styles.savedNote} role="status">
        <Icon name="check" size={13} />
        {savedLabel}
      </span>
    )
  }

  return (
    <form action={action} className={styles.saveNoteForm}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="messageId" value={messageId} />
      <button type="submit" disabled={pending} className={styles.saveNote}>
        <Icon name="note" size={13} />
        {label}
      </button>
      {state.error ? (
        <span className={styles.saveNoteError} role="alert">
          {messages[state.error] ?? state.error}
        </span>
      ) : null}
    </form>
  )
}
