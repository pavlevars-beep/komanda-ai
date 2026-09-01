import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { env } from '@/server/env'
import {
  getConsoleClient,
  listMyOpenAccessSessions,
  listOnboarding,
  listOrgMembers,
} from '@/core/organizations/console-repository'
import { resolveLocale } from '@/i18n/config'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { StatusBadge, DemoBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { AccessPanel } from './access-panel'
import styles from './detail.module.css'

const STATUS_TONE: Record<string, Tone> = {
  active: 'ok',
  onboarding: 'info',
  prospect: 'neutral',
  suspended: 'warn',
  archived: 'neutral',
}

const MEMBER_TONE: Record<string, Tone> = {
  active: 'ok',
  invited: 'info',
  suspended: 'warn',
  revoked: 'neutral',
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params

  // Neispravan identifikator se ne prosleđuje bazi.
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const client = await getConsoleClient(db, orgId)
  // Nedostupna i nepostojeća organizacija se ne razlikuju.
  if (!client.ok) notFound()

  const locale = resolveLocale({ userLocale: user.locale })
  const { t, formatDate, formatRelative } = createTranslator(locale)

  const [onboarding, members, openSessions] = await Promise.all([
    listOnboarding(db, orgId),
    listOrgMembers(db, orgId),
    listMyOpenAccessSessions(db),
  ])

  const org = client.value
  const mine = openSessions.ok
    ? openSessions.value.find((s) => s.organization_id === orgId)
    : undefined

  const done = onboarding.ok ? onboarding.value.filter((s) => s.status === 'done').length : 0
  const total = onboarding.ok ? onboarding.value.length : 0

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href="/console/clients" className={styles.crumb}>
          ← {t('clients.title')}
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{org.display_name}</h1>
          <StatusBadge
            tone={STATUS_TONE[org.status] ?? 'neutral'}
            label={t(`org.status.${org.status}` as MessageKey)}
          />
          {org.is_demo ? <DemoBadge label={t('common.demoData')} /> : null}
        </div>
        <div className={styles.meta}>
          <span>{org.industry ?? '—'}</span>
          <span>{org.plan}</span>
          <span>
            {org.last_activity_at
              ? formatRelative(org.last_activity_at)
              : t('clients.noActivity')}
          </span>
        </div>
      </header>

      <AccessPanel
        organizationId={orgId}
        maxMinutes={env().IMPERSONATION_MAX_MINUTES}
        active={
          mine
            ? {
                sessionId: mine.session_id,
                reason: mine.reason,
                scope: mine.scope,
                expiresAtLabel: formatDate(mine.expires_at, { timeStyle: 'short' }),
              }
            : null
        }
        labels={{
          title: t('access.title'),
          explain: t('access.explain'),
          start: t('access.start'),
          reason: t('access.reason'),
          reasonHint: t('access.reasonHint'),
          scope: t('access.scope'),
          scopeReadOnly: t('access.scope.read_only'),
          scopeFull: t('access.scope.full'),
          duration: t('access.duration'),
          end: t('access.end'),
          open: t('access.open'),
          ended: t('access.ended'),
          // Akcija vraća ključ poruke; prevod se radi ovde, na serveru,
          // da klijentska komponenta ne nosi ceo katalog.
          message: (key) => t(key as MessageKey),
        }}
      />

      <nav className={styles.subnav}>
        <Link href={`/console/clients/${orgId}/branding` as Route} className={styles.subnavLink}>
          {t('branding.title')}
        </Link>
        <Link href={`/console/clients/${orgId}/integrations` as Route} className={styles.subnavLink}>
          {t('integrations.title')}
        </Link>
      </nav>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('onboarding.title')}</h2>
          <span className={styles.cardMeta}>{t('onboarding.progress', { done, total })}</span>
        </div>

        <div className={styles.progressBar}>
          <span
            className={styles.progressFill}
            style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%' }}
          />
        </div>

        {!onboarding.ok || onboarding.value.length === 0 ? (
          <p className={styles.empty}>{t('state.empty.title')}</p>
        ) : (
          <ul className={styles.steps}>
            {onboarding.value.map((step) => {
              const isDone = step.status === 'done' || step.status === 'skipped'
              return (
                <li
                  key={step.key}
                  className={`${styles.step} ${isDone ? styles.stepDone : ''}`}
                >
                  <span className={`${styles.marker} ${isDone ? styles.markerDone : ''}`}>
                    {isDone ? (
                      <svg className={styles.check} viewBox="0 0 8 8" aria-hidden="true">
                        <path
                          d="M1 4.2 3 6.2 7 1.8"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className={styles.stepLabel}>
                    {t(`onboarding.step.${step.key}` as MessageKey)}
                  </span>
                  <span className={styles.stepWhen}>
                    {step.completed_at
                      ? formatDate(step.completed_at, { dateStyle: 'medium' })
                      : t(`onboarding.status.${step.status}` as MessageKey)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{t('members.title')}</h2>
          <span className={styles.cardMeta}>{members.ok ? members.value.length : 0}</span>
        </div>

        {!members.ok || members.value.length === 0 ? (
          <p className={styles.empty}>{t('members.empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('members.col.name')}</th>
                  <th>{t('members.col.email')}</th>
                  <th>{t('members.col.role')}</th>
                  <th>{t('members.col.status')}</th>
                  <th>{t('members.col.lastSeen')}</th>
                </tr>
              </thead>
              <tbody>
                {members.value.map((m) => (
                  <tr key={m.membership_id}>
                    <td className={styles.name}>{m.full_name ?? '—'}</td>
                    <td className={styles.emailCell}>{m.email ?? '—'}</td>
                    <td className={styles.mutedCell}>
                      {m.role_name[locale] ?? m.role_key}
                      {m.override_count > 0 ? (
                        <> · {t('members.overrides', { count: m.override_count })}</>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge
                        tone={MEMBER_TONE[m.status] ?? 'neutral'}
                        label={t(`members.status.${m.status}` as MessageKey)}
                      />
                    </td>
                    <td className={styles.mutedCell}>
                      {m.last_seen_at ? formatRelative(m.last_seen_at) : t('members.never')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
        Pozivanje korisnika, izmena rola i graditelj integracija dolaze
        u nastavku Faze 2 i u Fazi 3. Dok ih nema, ovde stoji oznaka
        umesto dugmadi koja ne rade.
      */}
      <section className={styles.pending}>
        <span className={styles.pendingLabel}>{t('state.unavailable')}</span>
        <span>
          Pozivanje korisnika i izmena rola dodaju se u nastavku Faze 2.
        </span>
      </section>
    </div>
  )
}
