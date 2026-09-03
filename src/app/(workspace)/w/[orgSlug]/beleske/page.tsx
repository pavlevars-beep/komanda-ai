import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { listNotes } from '@/core/notes/repository'
import { DeleteNoteButton, NoteForm } from './note-form'
import styles from './notes.module.css'

export default async function NotesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const reqId = makeRequestId(await headers())

  const db = await userDb()
  const user = await currentUser(db)
  if (!user) notFound()

  const resolved = await resolveOrgContext(db, {
    slug: orgSlug,
    userId: user.id,
    userName: user.fullName,
    requestId: reqId,
  })
  if (!resolved.ok) notFound()

  const org = resolved.value
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatDate } = createTranslator(locale)

  const notes = await listNotes(db, org.organizationId)

  const errorTexts: Record<string, string> = {
    'notes.error.empty': t('notes.error.empty'),
    'notes.error.tooLong': t('notes.error.tooLong'),
    'notes.error.saveFailed': t('notes.error.saveFailed'),
    'notes.error.deleteFailed': t('notes.error.deleteFailed'),
    'error.rate_limited': t('error.rate_limited'),
    'error.internal': t('error.internal'),
    'error.not_found.organization': t('error.not_found.organization'),
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('notes.title')}</h1>
        <p className={styles.lede}>{t('notes.lede')}</p>
      </header>

      <NoteForm
        orgSlug={org.organizationSlug}
        placeholder={t('notes.placeholder')}
        addLabel={t('notes.add')}
        errors={errorTexts}
      />

      {!notes.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : notes.value.length === 0 ? (
        <p className={styles.empty}>{t('notes.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {notes.value.map((note) => (
            <li key={note.id} className={styles.note}>
              <p className={styles.body}>{note.body}</p>
              <div className={styles.meta}>
                <span>
                  {t('notes.author', { name: note.authorName ?? '—' })} ·{' '}
                  {formatDate(note.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {note.authorId === user.id ? (
                  <DeleteNoteButton
                    orgSlug={org.organizationSlug}
                    noteId={note.id}
                    label={t('notes.delete')}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
