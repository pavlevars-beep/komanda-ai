import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { listOpenAlerts } from '@/core/alerts/repository'
import { createTranslator } from '@/i18n/translator'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { writeAudit } from '@/core/audit/writer'
import styles from './page.module.css'

const SEVERITY_TONE: Record<'info' | 'warning' | 'critical', Tone> = {
  info: 'info',
  warning: 'warn',
  critical: 'critical',
}

function greetingKey(hour: number) {
  if (hour < 11) return 'home.greeting.morning' as const
  if (hour < 18) return 'home.greeting.day' as const
  return 'home.greeting.evening' as const
}

export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const headerList = await headers()
  const reqId = makeRequestId(headerList)

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
  const locale = user.locale ?? org.locale
  const { t, formatRelative } = createTranslator(locale)

  const alerts = await listOpenAlerts(db, org)

  await writeAudit(db, {
    action: 'workspace.opened',
    status: 'success',
    actorType: org.staff ? 'staff' : 'user',
    requestId: reqId,
    organizationId: org.organizationId,
  })

  const firstName = (user.fullName ?? '').split(' ')[0]
  const hello = t(greetingKey(new Date().getHours()))

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <h1 className={styles.hello}>
          {hello}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className={styles.lede}>{t('home.lede')}</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{t('nav.alerts')}</h2>
          {alerts.ok && alerts.value.length > 0 ? (
            <span className={styles.sectionMeta}>
              {alerts.value.length}
            </span>
          ) : null}
        </div>

        {!alerts.ok ? (
          <p className={styles.empty}>{t('state.error.title')}</p>
        ) : alerts.value.length === 0 ? (
          <p className={styles.empty}>{t('alert.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {alerts.value.map((alert) => (
              <li key={alert.id} className={styles.item}>
                <StatusBadge
                  tone={SEVERITY_TONE[alert.severity]}
                  label={t(`alert.severity.${alert.severity}`)}
                />
                <div className={styles.itemBody}>
                  <span className={styles.itemTitle}>{alert.title}</span>
                  {alert.body?.[locale] ? (
                    <span className={styles.itemDetail}>{alert.body[locale]}</span>
                  ) : null}
                </div>
                <span className={styles.itemWhen}>{formatRelative(alert.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        Nema lažne funkcionalnosti: KPI kartice traže konektore, koji dolaze
        u Fazi 3. Umesto praznih kartica koje izgledaju kao da će proraditi,
        ovde stoji jasna oznaka šta nedostaje.
      */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('home.metrics')}</h2>
        <div className={styles.pending}>
          <span className={styles.pendingLabel}>{t('state.unavailable')}</span>
          <span>{t('home.metrics.pending')}</span>
        </div>
      </section>
    </div>
  )
}
