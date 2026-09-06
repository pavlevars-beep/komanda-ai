import { notFound } from 'next/navigation'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { AUDIT_PAGE_SIZE, listAuditEntries } from '@/core/audit/reader'
import { Icon } from '@/ui/primitives/Icon'
import styles from '../console-detail.module.css'

/**
 * Revizioni trag.
 *
 * Ko šta vidi odlučuje RLS, ne ova stranica. Osoblje vidi klijente koje
 * administrira; platformske događaje bez organizacije samo Super Admin. Filter
 * ovde bi bio druga definicija istog pravila.
 */
export default async function AuditPage() {
  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t, formatDate } = createTranslator(locale)

  const entries = await listAuditEntries(db)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="note" size={22} />
          {t('audit.title')}
        </h1>
        <p className={styles.lede}>{t('audit.lede')}</p>
      </header>

      {!entries.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : entries.value.length === 0 ? (
        <p className={styles.empty}>{t('audit.empty')}</p>
      ) : (
        <div className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('audit.col.when')}</th>
                  <th scope="col">{t('audit.col.actor')}</th>
                  <th scope="col">{t('audit.col.action')}</th>
                  <th scope="col">{t('audit.col.org')}</th>
                  <th scope="col">{t('audit.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.value.map((entry) => (
                  <tr key={entry.id}>
                    <td className={styles.when}>
                      {formatDate(entry.occurredAt, {
                        dateStyle: 'short',
                        timeStyle: 'medium',
                      })}
                    </td>
                    <td>
                      {entry.actorName ?? (
                        <span className={styles.muted}>
                          {t(`audit.actor.${entry.actorType}` as MessageKey)}
                        </span>
                      )}
                    </td>
                    {/*
                      Naziv događaja stoji kao zapisan, bez prevoda.
                      Prevod bi ga učinio nepretraživim: onaj ko traži
                      `staff.access_session_started` u logu i na ekranu mora da
                      vidi isti niz znakova.
                    */}
                    <td className={styles.action}>{entry.action}</td>
                    <td>
                      {entry.organizationName ?? <span className={styles.muted}>—</span>}
                    </td>
                    <td
                      className={
                        entry.status === 'denied'
                          ? styles.denied
                          : entry.status === 'failure'
                            ? styles.failure
                            : undefined
                      }
                    >
                      {t(`audit.status.${entry.status}` as MessageKey)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.footnote}>{t('audit.limited', { count: AUDIT_PAGE_SIZE })}</p>
        </div>
      )}
    </div>
  )
}
