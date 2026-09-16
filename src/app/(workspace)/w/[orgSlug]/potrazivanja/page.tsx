import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadMorningBrief } from '@/core/brief/loader'
import { businessRulesFor } from '@/core/rules/repository'
import { DataTable } from '../data-table'
import { DetailShell, moneyStat, Source, Stats, Thresholds, Unavailable } from '../detail-shell'
import { ContextLinks } from '../context-links'
import { linksFor } from '@/core/links/catalog'
import styles from '../detail.module.css'

export default async function ReceivablesPage({
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
  const { t, formatDate } = createTranslator(locale)
  const intl = INTL_LOCALE[locale]

  initialiseConnectors()
  const [source, rules] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
  ])

  // Ista funkcija koju koristi i brif — dva puta do istog podatka značila bi
  // da se brojevi na dva ekrana jednog dana raziđu.
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

  const aging = brief.receivables.data
  const debtors = brief.debtors.data

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="receipt"
      title={t('receivables.title')}
      lede={t('receivables.lede')}
      backLabel={t('detail.back')}
    >
      {aging ? (
        <>
          <Stats
            stats={[
              moneyStat(t('brief.receivables.total'), aging.total, aging.currency, intl),
              moneyStat(
                t('brief.receivables.overdue'),
                aging.overdue,
                aging.currency,
                intl,
                Number(aging.overdue) > 0 ? 'warn' : undefined,
              ),
              ...aging.buckets
                .filter((b) => b.fromDays >= rules.receivableWarningDays)
                .map((b) =>
                  moneyStat(
                    b.toDays === null
                      ? t('brief.receivables.bucketOpen', { from: b.fromDays })
                      : t('brief.receivables.bucket', { from: b.fromDays, to: b.toDays }),
                    b.amount,
                    aging.currency,
                    intl,
                    b.fromDays >= rules.receivableCriticalDays ? 'critical' : 'warn',
                  ),
                ),
            ]}
          />
          <div className={styles.card}>
            <Source block={brief.receivables} t={t} formatDate={formatDate} />
          </div>
        </>
      ) : (
        <Unavailable block={brief.receivables} t={t} />
      )}

      {debtors ? (
        <div className={styles.card}>
          <DataTable
            rows={debtors.items}
            emptyLabel={t('receivables.empty')}
            unavailableLabel={t('brief.unavailable')}
            columns={[
              {
                key: 'customer',
                header: t('receivables.col.customer'),
                render: (r) => r.customer,
              },
              {
                key: 'amount',
                header: t('receivables.col.amount'),
                numeric: true,
                warn: (r) => Number(r.amount) >= rules.largeReceivableAmount,
                render: (r) => money(r.amount, r.currency),
              },
              {
                key: 'invoices',
                header: t('receivables.col.invoices'),
                numeric: true,
                render: (r) => String(r.invoiceCount),
              },
              {
                key: 'oldest',
                header: t('receivables.col.oldest'),
                numeric: true,
                // Boja prati prag koji je firma postavila, ne fiksni broj.
                warn: (r) => r.oldestOverdueDays >= rules.receivableWarningDays,
                render: (r) => t('panel.days', { days: r.oldestOverdueDays }),
              },
            ]}
          />
          <Source block={brief.debtors} t={t} formatDate={formatDate} />
        </div>
      ) : (
        <Unavailable block={brief.debtors} t={t} />
      )}

      <Thresholds
        orgSlug={org.organizationSlug}
        text={t('detail.thresholds')}
        linkLabel={t('detail.thresholds.link')}
      />

      {/*
        Provera dužnika stoji TU, uz spisak. Kupac čiji je račun u blokadi ne
        kasni sa plaćanjem — on ne može da plati, i to menja sledeći potez.
      */}
      <ContextLinks
        title={t('links.context.debtors')}
        links={linksFor('debtors').map((link) => ({
          key: link.key,
          url: link.url,
          label: t(`links.${link.key}` as MessageKey),
        }))}
      />
    </DetailShell>
  )
}
