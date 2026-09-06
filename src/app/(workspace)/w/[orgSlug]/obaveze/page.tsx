import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadMorningBrief } from '@/core/brief/loader'
import { businessRulesFor } from '@/core/rules/repository'
import { DataTable } from '../data-table'
import { DetailShell, Source, Stats, Thresholds, Unavailable } from '../detail-shell'
import styles from '../detail.module.css'

export default async function PayablesPage({
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
  const { t, formatDate, formatNumber } = createTranslator(locale)
  const intl = INTL_LOCALE[locale]

  initialiseConnectors()
  const [source, rules] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
  ])

  const brief = await loadMorningBrief(
    db,
    org,
    source.integrationId,
    source.connectorType,
    rules,
  )

  const money = (value: string | number, currency: string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      Number(value),
    )

  const payables = brief.payables.data
  // Najpre ono što dospeva prvo — i ono što je već dospelo, pošto nosi
  // negativan broj dana.
  const items = [...(payables?.items ?? [])].sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  const overdue = items.filter((p) => p.daysUntilDue < 0)

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="wallet"
      title={t('payables.title')}
      lede={t('payables.lede')}
      backLabel={t('detail.back')}
    >
      {payables ? (
        <>
          <Stats
            stats={[
              { label: t('brief.payables.total'), value: money(payables.total, payables.currency) },
              {
                label: t('brief.payables.soon'),
                value: money(payables.dueWithin7Days, payables.currency),
                tone: Number(payables.dueWithin7Days) > 0 ? 'warn' : undefined,
              },
              ...(overdue.length > 0
                ? [
                    {
                      label: t('payables.overdue'),
                      value: formatNumber(overdue.length),
                      tone: 'critical' as const,
                    },
                  ]
                : []),
            ]}
          />

          <div className={styles.card}>
            <DataTable
              rows={items}
              emptyLabel={t('payables.empty')}
              unavailableLabel={t('brief.unavailable')}
              columns={[
                { key: 'supplier', header: t('payables.col.supplier'), render: (r) => r.supplier },
                {
                  key: 'amount',
                  header: t('payables.col.amount'),
                  numeric: true,
                  warn: (r) => Number(r.amount) >= rules.largePayableAmount,
                  render: (r) => money(r.amount, r.currency),
                },
                {
                  key: 'due',
                  header: t('payables.col.due'),
                  render: (r) => formatDate(`${r.dueDate}T00:00:00Z`, { dateStyle: 'medium' }),
                },
                {
                  key: 'left',
                  header: t('payables.col.left'),
                  numeric: true,
                  warn: (r) => r.daysUntilDue <= rules.payableHorizonDays,
                  render: (r) =>
                    r.daysUntilDue < 0
                      ? t('panel.overdueBy', { days: Math.abs(r.daysUntilDue) })
                      : t('panel.days', { days: r.daysUntilDue }),
                },
              ]}
            />
            <Source block={brief.payables} t={t} formatDate={formatDate} />
          </div>
        </>
      ) : (
        <Unavailable block={brief.payables} t={t} />
      )}

      <Thresholds
        orgSlug={org.organizationSlug}
        text={t('detail.thresholds')}
        linkLabel={t('detail.thresholds.link')}
      />
    </DetailShell>
  )
}
