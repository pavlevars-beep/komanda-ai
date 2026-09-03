import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { listInbox, markRead, MESSAGE_ROLES } from '@/core/messages/repository'
import { Icon } from '@/ui/primitives/Icon'
import { MessageComposer } from './composer'
import styles from './messages.module.css'

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
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
  const { t, formatRelative } = createTranslator(locale)

  const inbox = await listInbox(db, org.organizationId, user.id)

  /*
   * Poruke se označavaju kao pročitane tek POŠTO su prikazane.
   *
   * Označavanje pre prikaza bi izgubilo istaknutu oznaku „novo" baš na onom
   * otvaranju na kojem je korisnik prvi put vidi — a ta oznaka je jedini
   * način da razlikuje šta je stiglo od prošlog puta.
   */
  const unread = inbox.ok ? inbox.value.filter((m) => m.read_at === null) : []

  // Slanje vidi samo ko njime upravlja; ostalima ostaje sanduče.
  const canSend = org.permissions.includes('manage_alerts')

  const page = (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="megaphone" size={22} />
          {t('messages.title')}
        </h1>
        {canSend ? <p className={styles.lede}>{t('messages.lede')}</p> : null}
      </header>

      {canSend ? (
        <MessageComposer
          orgSlug={org.organizationSlug}
          roles={MESSAGE_ROLES.map((key) => ({
            key,
            label: t(`role.${key}` as MessageKey),
          }))}
          labels={{
            subject: t('messages.subject'),
            body: t('messages.body'),
            recipients: t('messages.recipients'),
            recipientsHint: t('messages.recipientsHint'),
            send: t('messages.send'),
            // Šablon, ne gotova rečenica — broj umeće klijentska komponenta.
            sent: t('messages.sent', { count: '{count}' }),
            sentNobody: t('messages.sentNobody'),
            messages: messagesFor(locale, ['error.', 'messages.error.']),
          }}
        />
      ) : null}

      <section className={styles.head}>
        <h2 className={styles.label}>{t('messages.inbox')}</h2>
      </section>

      {!inbox.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : inbox.value.length === 0 ? (
        <p className={styles.empty}>{t('messages.inbox.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {inbox.value.map((message) => (
            <li
              key={message.id}
              className={`${styles.message} ${message.read_at === null ? styles.unread : ''}`.trim()}
            >
              <div className={styles.messageHead}>
                <span className={styles.messageTitle}>{message.title}</span>
                <span className={styles.messageWhen}>{formatRelative(message.created_at)}</span>
              </div>
              {message.read_at === null ? (
                <span className={styles.badge}>{t('messages.unread')}</span>
              ) : null}
              {message.body ? <p className={styles.messageBody}>{message.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  await markRead(
    db,
    user.id,
    unread.map((m) => m.id),
  )

  return page
}
