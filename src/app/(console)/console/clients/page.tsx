import Link from 'next/link'
import type { Route } from 'next'
import type { Metadata } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { listConsoleClients } from '@/core/organizations/console-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { StatusBadge, DemoBadge, type Tone } from '@/ui/patterns/StatusBadge'
import styles from './clients.module.css'

export const metadata: Metadata = { title: 'Klijenti' }

const STATUS_TONE: Record<string, Tone> = {
  active: 'ok',
  onboarding: 'info',
  prospect: 'neutral',
  suspended: 'warn',
  archived: 'neutral',
}

export default async function ClientsPage() {
  const db = await userDb()
  const user = await currentUser(db)
  const { t, formatRelative } = createTranslator(await requestLocale(user?.locale))

  const clients = await listConsoleClients(db)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{t('clients.title')}</h1>
          <Link href="/console/clients/new" className={styles.primaryLink}>
            {t('clients.new')}
          </Link>
        </div>
        <p className={styles.lede}>{t('clients.lede')}</p>
      </header>

      {!clients.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : clients.value.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('clients.empty')}</p>
          <Link href="/console/clients/new" className={styles.primaryLink}>
            {t('clients.new')}
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('clients.col.company')}</th>
                <th>{t('clients.col.industry')}</th>
                <th>{t('clients.col.status')}</th>
                <th>{t('clients.col.users')}</th>
                <th>{t('clients.col.integrations')}</th>
                <th>{t('clients.col.onboarding')}</th>
                <th>{t('clients.col.consultant')}</th>
                <th>{t('clients.col.activity')}</th>
              </tr>
            </thead>
            <tbody>
              {clients.value.map((c) => {
                const pct =
                  c.onboarding_total > 0
                    ? Math.round((c.onboarding_done / c.onboarding_total) * 100)
                    : 0
                const complete = c.onboarding_total > 0 && c.onboarding_done === c.onboarding_total

                return (
                  <tr key={c.organization_id}>
                    <td>
                      <span className={styles.company}>
                        <Link
                          href={`/console/clients/${c.organization_id}` as Route}
                          className={styles.companyLink}
                        >
                          {c.display_name}
                        </Link>
                        {c.is_demo ? <DemoBadge label="Demo" /> : null}
                        {/* Otvorena sesija pristupa mora da se vidi i sa liste. */}
                        {c.has_open_access_session ? (
                          <StatusBadge tone="warn" label={t('access.open')} />
                        ) : null}
                      </span>
                    </td>

                    <td className={styles.muted}>{c.industry ?? '—'}</td>

                    <td>
                      <StatusBadge
                        tone={STATUS_TONE[c.status] ?? 'neutral'}
                        label={t(`org.status.${c.status}`)}
                      />
                    </td>

                    <td className={styles.num}>
                      {c.active_users}
                      {c.pending_invites > 0 ? (
                        <span className={styles.sub}>
                          {t('clients.invitesPending', { count: c.pending_invites })}
                        </span>
                      ) : null}
                    </td>

                    <td className={styles.num}>
                      {c.active_integrations}
                      {c.integrations_attention > 0 ? (
                        <span className={`${styles.sub} ${styles.attention}`}>
                          {t('clients.attention', { count: c.integrations_attention })}
                        </span>
                      ) : null}
                    </td>

                    <td>
                      <span className={styles.progress}>
                        <span className={styles.bar}>
                          <span
                            className={`${styles.barFill} ${complete ? styles.barDone : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className={styles.num}>
                          {c.onboarding_done}/{c.onboarding_total}
                        </span>
                      </span>
                    </td>

                    <td className={styles.muted}>
                      {c.consultants.length > 0
                        ? c.consultants.join(', ')
                        : t('clients.noConsultant')}
                    </td>

                    <td className={styles.muted}>
                      {c.last_activity_at
                        ? formatRelative(c.last_activity_at)
                        : t('clients.noActivity')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
