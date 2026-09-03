import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import { NOTE_MAX_LENGTH } from './limits'

/**
 * Beleške radnog prostora.
 *
 * Vidljivost i pravo brisanja sprovodi RLS, ne ovaj modul. Zbog toga se ovde
 * ne proverava „da li je korisnik autor" — provera na dva mesta znači da se
 * jednog dana raziđu, a ona koja stvarno štiti je ona u bazi.
 */

export { NOTE_MAX_LENGTH } from './limits'

const noteRow = z.object({
  id: uuid(),
  body: z.string(),
  created_at: z.string(),
  author_id: uuid().nullable(),
  author: z.object({ full_name: z.string().nullable() }).nullable(),
})

export interface Note {
  readonly id: string
  readonly body: string
  readonly createdAt: string
  readonly authorId: string | null
  readonly authorName: string | null
}

export async function listNotes(db: Db, organizationId: string): Promise<Result<Note[]>> {
  const { data, error } = await db
    .from('notes')
    .select('id, body, created_at, author_id, author:user_profiles(full_name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(noteRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(
    rows.data.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      authorId: r.author_id,
      authorName: r.author?.full_name ?? null,
    })),
  )
}

/**
 * Provera unosa pre upisa.
 *
 * Iste granice postoje i kao ograničenja u bazi. Ovde su da bi korisnik dobio
 * razumljivu poruku umesto poruke o prekršenom ograničenju; baza ostaje ta
 * koja ih stvarno sprovodi.
 */
export function validateNote(body: string): Result<string> {
  const trimmed = body.trim()
  if (trimmed.length === 0) return err(domainError('invalid_input', 'notes.error.empty'))
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return err(domainError('invalid_input', 'notes.error.tooLong'))
  }
  return ok(trimmed)
}

export async function addNote(
  db: Db,
  organizationId: string,
  authorId: string,
  body: string,
): Promise<Result<string>> {
  const validated = validateNote(body)
  if (!validated.ok) return validated

  const { data, error } = await db
    .from('notes')
    .insert({ organization_id: organizationId, author_id: authorId, body: validated.value })
    .select('id')
    .single()

  if (error) {
    return err(domainError('forbidden', 'notes.error.saveFailed', { detail: error.message }))
  }

  const parsed = z.object({ id: uuid() }).safeParse(data)
  return parsed.success
    ? ok(parsed.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'notes.id' }))
}

/**
 * Brisanje beleške.
 *
 * Politika propušta samo autorove beleške, pa pokušaj nad tuđom ne obara
 * grešku — jednostavno ne obriše nijedan red. Zato se broj obrisanih redova
 * proverava: bez toga bi UI javio uspeh a beleška bi ostala.
 */
export async function deleteNote(
  db: Db,
  organizationId: string,
  noteId: string,
): Promise<Result<void>> {
  const { data, error } = await db
    .from('notes')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', noteId)
    .select('id')

  if (error) {
    return err(domainError('forbidden', 'notes.error.deleteFailed', { detail: error.message }))
  }

  const rows = z.array(z.object({ id: uuid() })).safeParse(data)
  if (!rows.success || rows.data.length === 0) {
    return err(domainError('forbidden', 'notes.error.deleteFailed'))
  }

  return ok(undefined)
}
