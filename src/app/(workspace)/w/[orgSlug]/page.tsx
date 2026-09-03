import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { listOpenAlerts } from '@/core/alerts/repository'
import { loadDashboard, primaryIntegration } from '@/core/dashboard/loader'
import { loadPanels } from '@/core/dashboard/panels'
import { DataTable } from './data-table'
import { WorldClocks, type Clock } from './clocks'
import { Icon } from '@/ui/primitives/Icon'
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

  const source = await primaryIntegration(db, org.organizationId)

  const [alerts, cards, panels] = await Promise.all([
    listOpenAlerts(db, org),
    loadDashboard(db, org),
    loadPanels(db, org, source.integrationId, source.connectorType),
  ])

  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount))

  const unavailableText = (reason: string | undefined) =>
    reason ? t(`metric.unavailable.${reason}` as MessageKey) : undefined

  await writeAudit(db, {
    action: 'workspace.opened',
    status: 'success',
    actorType: org.staff ? 'staff' : 'user',
    requestId: reqId,
    organizationId: org.organizationId,
  })

  /*
   * Zone se biraju po tome sa kim se posluje, ne po veličini gradova.
   * Prva je zona same organizacije — iz baze, ne pretpostavljena.
   *
   * Zona organizacije se izostavlja iz ostatka spiska kada se poklopi, da isti
   * sat ne bi stajao dvaput.
   */
  const partnerClocks: Clock[] = [
    { label: t('clock.frankfurt'), timeZone: 'Europe/Berlin' },
    { label: t('clock.dubai'), timeZone: 'Asia/Dubai' },
    { label: t('clock.shanghai'), timeZone: 'Asia/Shanghai' },
    { label: t('clock.newYork'), timeZone: 'America/New_York' },
  ]

  const clocks: Clock[] = [
    { label: t('clock.local'), timeZone: org.timezone, primary: true },
    ...partnerClocks.filter((c) => c.timeZone !== org.timezone),
  ]

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
          <h2 className={styles.sectionTitle}>
            <Icon name="bell" size={17} />
            {t('nav.alerts')}
          </h2>
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
        <h2 className={styles.sectionTitle}>
          <Icon name="clock" size={17} />
          {t('home.clocks')}
        </h2>
        <WorldClocks clocks={clocks} locale={INTL_LOCALE[locale]} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="chart" size={17} />
          {t('home.metrics')}
        </h2>

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

      <div className={styles.panelGrid}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon name="receipt" size={17} />
            {t('panel.debtors')}
          </h2>
          <DataTable
            rows={panels.debtors.rows}
            unavailable={unavailableText(panels.debtors.unavailable)}
            unavailableLabel={t('metric.unavailable')}
            emptyLabel={t('panel.debtors.empty')}
            caption={t('panel.source.demo')}
            columns={[
              { key: 'customer', header: t('panel.col.customer'), render: (r) => r.customer },
              {
                key: 'amount',
                header: t('panel.col.amount'),
                numeric: true,
                render: (r) => money(r.amount, r.currency),
              },
              {
                key: 'days',
                header: t('panel.col.overdue'),
                numeric: true,
                // Preko 60 dana je granica posle koje naplata postaje ozbiljna.
                warn: (r) => r.oldestOverdueDays > 60,
                render: (r) => t('panel.days', { days: r.oldestOverdueDays }),
              },
            ]}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Icon name="box" size={17} />
            {t('panel.inventory')}
          </h2>
          <DataTable
            rows={panels.inventory.rows}
            unavailable={unavailableText(panels.inventory.unavailable)}
            unavailableLabel={t('metric.unavailable')}
            emptyLabel={t('panel.inventory.empty')}
            caption={t('panel.source.demo')}
            columns={[
              { key: 'item', header: t('panel.col.item'), render: (r) => r.item },
              {
                key: 'onHand',
                header: t('panel.col.onHand'),
                numeric: true,
                warn: (r) => r.onHand < r.minimum,
                render: (r) => String(r.onHand),
              },
              {
                key: 'cover',
                header: t('panel.col.cover'),
                numeric: true,
                warn: (r) => r.daysOfCover <= 3,
                render: (r) => t('panel.days', { days: r.daysOfCover }),
              },
            ]}
          />
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="wallet" size={17} />
          {t('panel.payables')}
        </h2>
        <DataTable
          rows={panels.payables.rows}
          unavailable={unavailableText(panels.payables.unavailable)}
          unavailableLabel={t('metric.unavailable')}
          emptyLabel={t('panel.payables.empty')}
          caption={t('panel.source.demo')}
          columns={[
            { key: 'supplier', header: t('panel.col.supplier'), render: (r) => r.supplier },
            {
              key: 'amount',
              header: t('panel.col.amount'),
              numeric: true,
              render: (r) => money(r.amount, r.currency),
            },
            { key: 'due', header: t('panel.col.due'), render: (r) => r.dueDate },
            {
              key: 'left',
              header: t('panel.col.daysLeft'),
              numeric: true,
              // Negativan broj znači da je obaveza već dospela.
              warn: (r) => r.daysUntilDue <= 7,
              render: (r) =>
                r.daysUntilDue < 0
                  ? t('panel.overdueBy', { days: Math.abs(r.daysUntilDue) })
                  : t('panel.days', { days: r.daysUntilDue }),
            },
          ]}
        />
      </section>
    </div>
  )
}
