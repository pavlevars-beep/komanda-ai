import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { env } from '@/server/env'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { getConsoleClient } from '@/core/organizations/console-repository'
import { DATASET_KINDS, FIELDS, type DatasetKind } from '@/core/import/mapping'
import { getStoredMapping } from '@/core/import/repository'
import { listExpectations } from '@/core/import/expectations'
import { listInboxes } from '@/core/mail/repository'
import { mailAddress } from '@/core/mail/address'
import styles from './guide.module.css'

/**
 * Uputstvo koje konsultant daje klijentu.
 *
 * Postoji zato što se taj razgovor vodi sa SVAKIM klijentom, uvek isti, i uvek
 * usmeno. Usmeno uputstvo se prepričava pogrešno, a osoba koja podešava ERP
 * najčešće nije ona sa kojom je razgovor vođen.
 *
 * Najvredniji deo su STVARNI nazivi kolona koje klijent već koristi, pročitani
 * iz poslednjeg uspešnog uvoza. Opšte uputstvo „treba nam datum i iznos" tera
 * čoveka da pogađa; „zadržite ove nazive" ne tera ni na šta.
 */

export default async function MailGuidePage({
  params,
}: {
  params: Promise<{ orgId: string; integrationId: string }>
}) {
  const { orgId, integrationId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(integrationId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t } = createTranslator(locale)

  const [client, inboxes, expectations] = await Promise.all([
    getConsoleClient(db, orgId),
    listInboxes(db, orgId, integrationId),
    listExpectations(db, orgId, integrationId),
  ])
  if (!client.ok) notFound()

  const mailDomain = env().MAIL_DOMAIN

  const inboxByKind = new Map(
    inboxes.ok ? inboxes.value.map((i) => [i.kind, i] as const) : [],
  )
  const expectationByKind = new Map(
    expectations.ok ? expectations.value.map((e) => [e.kind, e] as const) : [],
  )

  const mappings = new Map<DatasetKind, readonly string[]>()
  for (const kind of DATASET_KINDS) {
    const stored = await getStoredMapping(db, orgId, integrationId, kind)
    if (stored) {
      // Prikazuju se samo kolone koje se STVARNO koriste, redom kojim stoje u
      // tabeli. Cela lista zaglavlja bi uključila i ono što se ne čita.
      const used = Object.values(stored.mapping)
        .sort((a, b) => a - b)
        .map((index) => stored.headers[index])
        .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
      if (used.length > 0) mappings.set(kind, used)
    }
  }

  // Prikazuju se samo vrste za koje sanduče postoji. Uputstvo za adresu koja ne
  // postoji šalje klijenta da podesi nešto što nema gde da stigne.
  const kinds = DATASET_KINDS.filter((kind) => inboxByKind.has(kind))

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link
          href={`/console/clients/${orgId}/integrations/${integrationId}/uvoz` as Route}
          className={styles.crumb}
        >
          ← {t('import.title')}
        </Link>
        <span className={styles.hint}>{t('mail.guide.lede')}</span>
      </div>

      <article className={styles.doc}>
        <header className={styles.docHead}>
          <h1 className={styles.title}>{t('mail.guide.title')}</h1>
          <p className={styles.intro}>
            {t('mail.guide.intro', { org: client.value.display_name })}
          </p>
        </header>

        {kinds.length === 0 ? (
          <p className={styles.empty}>{t('mail.guide.noInbox')}</p>
        ) : (
          kinds.map((kind) => {
            const inbox = inboxByKind.get(kind)!
            const expectation = expectationByKind.get(kind)
            const used = mappings.get(kind)

            return (
              <section key={kind} className={styles.block}>
                <h2 className={styles.blockTitle}>
                  {t('mail.guide.forKind', { kind: t(`import.kind.${kind}` as MessageKey) })}
                </h2>

                <dl className={styles.facts}>
                  <dt>{t('mail.guide.sendTo')}</dt>
                  <dd>
                    <code className={styles.address}>
                      {mailDomain ? mailAddress(inbox.token, mailDomain) : '—'}
                    </code>
                  </dd>

                  <dt>{t('mail.guide.sendFrom')}</dt>
                  <dd>
                    {inbox.allowed_senders.length > 0 ? (
                      <>
                        <code className={styles.address}>
                          {inbox.allowed_senders.join(', ')}
                        </code>
                        <span className={styles.note}>{t('mail.guide.sendFromHint')}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>

                  <dt>{t('mail.guide.whenTitle')}</dt>
                  <dd>
                    {expectation
                      ? t('mail.guide.when', {
                          days: expectation.weekdays
                            .map((d) => t(`import.cadence.weekday.${d}` as MessageKey))
                            .join(', '),
                          time: expectation.by_time.slice(0, 5),
                        })
                      : t('mail.guide.whenNone')}
                  </dd>
                </dl>

                {/*
                  Stvarni nazivi kolona iz poslednjeg uspešnog uvoza. Ovo je
                  najvredniji deo uputstva: „zadržite ove nazive" ne tera čoveka
                  ni na šta, dok ga „treba nam datum i iznos" tera da pogađa.
                */}
                {used ? (
                  <div className={styles.columns}>
                    <h3 className={styles.columnsTitle}>{t('mail.guide.current')}</h3>
                    <p className={styles.note}>{t('mail.guide.currentHint')}</p>
                    <ul className={styles.columnList}>
                      {used.map((name) => (
                        <li key={name}>
                          <code>{name}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className={styles.columns}>
                    <h3 className={styles.columnsTitle}>{t('mail.guide.columns')}</h3>
                    <p className={styles.note}>{t('mail.guide.columnsHint')}</p>
                    <ul className={styles.columnList}>
                      {FIELDS[kind].map((f) => (
                        <li key={f.key}>
                          {t(`import.field.${f.key}` as MessageKey)}{' '}
                          <span className={styles.badge}>
                            {f.required ? t('mail.guide.required') : t('mail.guide.optional')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )
          })
        )}

        <section className={styles.block}>
          <h2 className={styles.blockTitle}>{t('mail.guide.rules')}</h2>
          <ul className={styles.rules}>
            <li>{t('mail.guide.rule.oneTable')}</li>
            <li>{t('mail.guide.rule.format')}</li>
            <li>{t('mail.guide.rule.size')}</li>
            <li>{t('mail.guide.rule.headers')}</li>
            <li>{t('mail.guide.rule.stable')}</li>
          </ul>
          <p className={styles.note}>{t('mail.guide.silence')}</p>
        </section>
      </article>
    </div>
  )
}

export const dynamic = 'force-dynamic'
