import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadMorningBrief } from '@/core/brief/loader'
import { businessRulesFor } from '@/core/rules/repository'
import { DataTable } from '../data-table'
import { DetailShell, Source, Stats, Thresholds, Unavailable } from '../detail-shell'
import styles from '../detail.module.css'

/**
 * Ocena stanja zalihe.
 *
 * Ista pravila kao u mehanizmu pažnje, ali ovde daju NAZIV stanja umesto
 * upozorenja. Prag dolazi iz podešavanja firme; jedini deo koji ne dolazi
 * odatle je poređenje sa rokom isporuke — zaliha koja se istroši pre nego što
 * roba stigne je kritična bez obzira na to gde je prag.
 */
function stockStatus(
  item: { daysOfCover: number; averageDailySales: number; leadTimeDays: number },
  rules: { stockCriticalDays: number; stockWarningDays: number; stockOverstockDays: number },
): { key: MessageKey; tone: 'critical' | 'warn' | 'info' | undefined } {
  if (item.averageDailySales <= 0) {
    return { key: 'brief.stock.status.monitor', tone: undefined }
  }
  if (item.daysOfCover <= rules.stockCriticalDays || item.daysOfCover < item.leadTimeDays) {
    return { key: 'brief.stock.status.critical', tone: 'critical' }
  }
  if (item.daysOfCover <= rules.stockWarningDays) {
    return { key: 'brief.stock.status.low', tone: 'warn' }
  }
  if (item.daysOfCover >= rules.stockOverstockDays) {
    return { key: 'brief.stock.status.overstock', tone: 'info' }
  }
  return { key: 'brief.stock.status.healthy', tone: undefined }
}

export default async function StockPage({
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

  const stock = brief.stock.data
  const items = stock?.items ?? []

  // Artikli koji traže pažnju idu na vrh. Spisak se čita odozgo, i najčešće
  // samo odozgo.
  const sorted = [...items].sort((a, b) => a.daysOfCover - b.daysOfCover)
  const needsAttention = sorted.filter((i) => {
    const status = stockStatus(i, rules)
    return status.tone === 'critical' || status.tone === 'warn'
  }).length

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="box"
      title={t('stock.title')}
      lede={t('stock.lede')}
      backLabel={t('detail.back')}
    >
      {stock ? (
        <>
          <Stats
            stats={[
              { label: t('stock.col.item'), value: formatNumber(items.length) },
              {
                label: t('stock.needsAttention'),
                value: formatNumber(needsAttention),
                tone: needsAttention > 0 ? 'warn' : undefined,
              },
            ]}
          />

          <div className={styles.card}>
            <DataTable
              rows={sorted}
              emptyLabel={t('stock.empty')}
              unavailableLabel={t('brief.unavailable')}
              columns={[
                { key: 'item', header: t('stock.col.item'), render: (r) => r.item },
                {
                  key: 'onHand',
                  header: t('stock.col.onHand'),
                  numeric: true,
                  render: (r) => formatNumber(r.onHand),
                },
                {
                  key: 'perDay',
                  header: t('stock.col.perDay'),
                  numeric: true,
                  render: (r) => formatNumber(r.averageDailySales),
                },
                {
                  key: 'cover',
                  header: t('stock.col.cover'),
                  numeric: true,
                  warn: (r) => stockStatus(r, rules).tone === 'critical',
                  render: (r) =>
                    r.averageDailySales > 0 ? t('panel.days', { days: r.daysOfCover }) : '—',
                },
                {
                  key: 'lead',
                  header: t('stock.col.lead'),
                  numeric: true,
                  render: (r) => t('panel.days', { days: r.leadTimeDays }),
                },
                {
                  key: 'status',
                  header: t('stock.col.status'),
                  warn: (r) => stockStatus(r, rules).tone === 'critical',
                  render: (r) => t(stockStatus(r, rules).key),
                },
              ]}
            />
            <Source block={brief.stock} t={t} formatDate={formatDate} />
          </div>
        </>
      ) : (
        <Unavailable block={brief.stock} t={t} />
      )}

      <Thresholds
        orgSlug={org.organizationSlug}
        text={t('detail.thresholds')}
        linkLabel={t('detail.thresholds.link')}
      />
    </DetailShell>
  )
}
