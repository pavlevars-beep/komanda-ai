'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { NOTE_MAX_LENGTH } from '@/core/notes/limits'
import { addNoteAction, deleteNoteAction, type NotesState } from './actions'
import styles from './notes.module.css'

export function NoteForm({
  orgSlug,
  placeholder,
  addLabel,
  errors,
}: {
  orgSlug: string
  placeholder: string
  addLabel: string
  errors: Readonly<Record<string, string>>
}) {
  const [state, action, pending] = useActionState<NotesState, FormData>(addNoteAction, {})

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <textarea
        name="body"
        className={styles.input}
        placeholder={placeholder}
        maxLength={NOTE_MAX_LENGTH}
        required
      />
      <div className={styles.actions}>
        <span className={styles.counter}>{NOTE_MAX_LENGTH}</span>
        <Button type="submit" disabled={pending}>
          {addLabel}
        </Button>
      </div>
      {state.error ? (
        <p className={styles.error} role="alert">
          {errors[state.error] ?? state.error}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Brisanje sopstvene beleške.
 *
 * Dugme se prikazuje samo autoru, ali to je pogodnost a ne zaštita — pravo
 * sprovodi RLS politika, koja tuđu belešku ne propušta ni kada zahtev stigne
 * mimo ovog dugmeta.
 */
export function DeleteNoteButton({
  orgSlug,
  noteId,
  label,
}: {
  orgSlug: string
  noteId: string
  label: string
}) {
  const [, action, pending] = useActionState<NotesState, FormData>(deleteNoteAction, {})

  return (
    <form action={action}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="noteId" value={noteId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {label}
      </Button>
    </form>
  )
}
