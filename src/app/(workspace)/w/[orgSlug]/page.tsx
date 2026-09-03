import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { listOpenAlerts } from '@/core/alerts/repository'
import { loadDashboard } from '@/core/dashboard/loader'
import { formatCardValue, formatChange } from '@/core/dashboard/format'
import { initialiseConnectors } from '@/core/connectors'
import { MetricCard, MetricGrid } from '@/ui/patterns/MetricCard'
import { INTL_LOCALE } from '@/i18n/config'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { writeAudit } from '@/core/audit/writer'
import styles from './page.module.css'
import { requestLocale } from '@/server/http/locale'

const SEVERITY_TONE: Record<'info' | 'warning' | 'critical', Tone> = {
  info: 'info',
  warning: 'warn',
  critical: 'critical',
}

/**
 * Klasifikacija se prikazuje bojom I tekstom.
 *
 * Prognoza i činjenica ne smeju da se razlikuju samo nijansom — razlika mora
 * da preživi crno-belu štampu izveštaja i daltonizam.
 */
const CLASSIFICATION_TONE: Record<string, Tone> = {
  fact: 'neutral',
  calculation: 'neutral',
  interpretation: 'warn',
  forecast: 'warn',
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
  // Izbor korisnika ima prednost nad podešavanjem organizacije. Bez ovoga bi
  // prekidač jezika menjao okvir (koji je u layout-u) a ne i sadržaj stranice.
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatRelative } = createTranslator(locale)

  initialiseConnectors()

  const [alerts, cards] = await Promise.all([
    listOpenAlerts(db, org),
    loadDashboard(db, org),
  ])

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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('home.metrics')}</h2>

        {cards.length === 0 ? (
          <div className={styles.pending}>
            <span className={styles.pendingLabel}>{t('state.unavailable')}</span>
            <span>{t('metric.empty')}</span>
          </div>
        ) : (
          <MetricGrid>
            {cards.map((card) => {
              const source = card.provenance?.sources[0]
              const change = formatChange(card.changePercent, INTL_LOCALE[locale])

              return (
                <MetricCard
                  key={card.cardId}
                  label={card.title[locale] ?? card.title.sr ?? ''}
                  value={formatCardValue(card, INTL_LOCALE[locale])}
                  changeLabel={change}
                  changeIsGood={card.changeIsGood}
                  comparePeriodLabel={change ? t('metric.comparePeriod.week') : undefined}
                  unavailableLabel={card.unavailable ? t('metric.unavailable') : undefined}
                  unavailableReason={
                    card.unavailable
                      ? t(`metric.unavailable.${card.unavailable}` as MessageKey)
                      : undefined
                  }
                  sourceLabel={source?.label}
                  isDemo={source?.isDemo}
                  demoLabel={t('common.demoData')}
                  freshnessLabel={
                    card.freshness && card.freshness !== 'unknown'
                      ? t(`freshness.${card.freshness}` as MessageKey)
                      : undefined
                  }
                  classificationLabel={t(`classification.${card.classification}` as MessageKey)}
                  classificationTone={CLASSIFICATION_TONE[card.classification] ?? 'neutral'}
                />
              )
            })}
          </MetricGrid>
        )}
      </section>
    </div>
  )
}
