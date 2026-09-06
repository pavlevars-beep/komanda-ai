import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { listOpenAlerts } from '@/core/alerts/repository'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { DetailShell } from '../detail-shell'
import { AcknowledgeButton } from './acknowledge-button'
import styles from '../detail.module.css'

const SEVERITY_TONE: Record<'info' | 'warning' | 'critical', Tone> = {
  info: 'info',
  warning: 'warn',
  critical: 'critical',
}

const SEVERITY_CLASS: Record<'info' | 'warning' | 'critical', string> = {
  info: styles.info!,
  warning: styles.warning!,
  critical: styles.critical!,
}

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const db = await userDb()
  const user = await currentUser(db)
  if (!user) notFound()

  const resolved = await resolveOrgContext(db, {
    slug: orgSlug,
    userId: user.id,
    userName: user.fullName,
    requestId: makeRequestId(await headers()),
  })
  if (!resolved.ok) notFound()

  const org = resolved.value
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatRelative } = createTranslator(locale)

  const alerts = await listOpenAlerts(db, org, 100)

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="bell"
      title={t('alerts.title')}
      lede={t('alerts.lede')}
      backLabel={t('detail.back')}
    >
      {!alerts.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : alerts.value.length === 0 ? (
        <p className={styles.empty}>{t('alerts.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {alerts.value.map((alert) => (
            <li
              key={alert.id}
              className={`${styles.alert} ${SEVERITY_CLASS[alert.severity]}`}
            >
              <div className={styles.alertHead}>
                <span className={styles.alertTitle}>{alert.title}</span>
                <span className={styles.alertWhen}>{formatRelative(alert.created_at)}</span>
              </div>

              {alert.body?.[locale] ? (
                <p className={styles.alertBody}>{alert.body[locale]}</p>
              ) : null}

              <div className={styles.alertMeta}>
                <StatusBadge
                  tone={SEVERITY_TONE[alert.severity]}
                  label={t(`alert.severity.${alert.severity}`)}
                />
                <span className={styles.alertWhen}>
                  {t(`alerts.source.${alert.source}` as MessageKey)}
                </span>
                {/*
                  Dugme stoji samo uz nova upozorenja. Potvrđeno upozorenje
                  ostaje na spisku dok se ne reši, ali se više ne potvrđuje —
                  dugme koje ništa ne menja uči korisnika da mu ne veruje.
                */}
                {alert.status === 'new' ? (
                  <AcknowledgeButton
                    orgSlug={org.organizationSlug}
                    alertId={alert.id}
                    label={t('alerts.acknowledge')}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailShell>
  )
}
