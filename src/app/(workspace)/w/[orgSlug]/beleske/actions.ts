'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { addNote, deleteNote } from '@/core/notes/repository'

export interface NotesState extends ActionResultBase {
  readonly added?: boolean
  readonly deleted?: boolean
}

/**
 * Organizacija se razrešava iz slug-a, ne iz forme.
 *
 * `organizationId` u telu zahteva bio bi tvrdnja pozivaoca o tome čije su ovo
 * beleške. Slug prolazi kroz istu proveru pripadnosti kao i sama stranica.
 */
async function orgFromSlug(
  db: Parameters<typeof resolveOrgContext>[0],
  slug: string | undefined,
  userId: string,
  userName: string | null,
) {
  if (!slug) return null
  const resolved = await resolveOrgContext(db, {
    slug,
    userId,
    userName,
    requestId: makeRequestId(await headers()),
  })
  return resolved.ok ? resolved.value : null
}

export const addNoteAction = workspaceAction<NotesState>(
  { rateLimit: 'write', audit: 'note.created' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const org = await orgFromSlug(db, slug, user.id, user.fullName)
    if (!org) return { error: 'error.not_found.organization' }

    const created = await addNote(
      db,
      org.organizationId,
      user.id,
      formString(formData, 'body') ?? '',
    )
    if (!created.ok) return { error: created.error.key }

    revalidatePath(`/w/${slug}/beleske`)
    return { added: true }
  },
)

export const deleteNoteAction = workspaceAction<NotesState>(
  { rateLimit: 'write', audit: 'note.deleted' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const noteId = formString(formData, 'noteId')
    if (!noteId) return { error: 'notes.error.deleteFailed' }

    const org = await orgFromSlug(db, slug, user.id, user.fullName)
    if (!org) return { error: 'error.not_found.organization' }

    const removed = await deleteNote(db, org.organizationId, noteId)
    if (!removed.ok) return { error: removed.error.key }

    revalidatePath(`/w/${slug}/beleske`)
    return { deleted: true }
  },
)
