import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadRetailNetwork } from '@/core/retail/loader'
import { averageMargin, changePercent, marginStep } from '@/core/retail/network'
import { Icon } from '@/ui/primitives/Icon'
import { DataTable } from '../../data-table'
import { DetailShell, Source, Stats, moneyStat } from '../../detail-shell'
import detail from '../../detail.module.css'
import styles from '../retail.module.css'

/**
 * Jedno prodajno mesto, u dubinu.
 *
 * Ovde se završava put koji počinje pogledom na kartu: veliki crveni krug →
 * kartica → ceo prikaz objekta. Poslednji korak je pitanje sagovorniku, sa već
 * upisanim mestom — da vlasnik ne mora da prepisuje ime objekta i mesec.
 */
export default async function LocationPage({
  params,
}: {
  params: Promise<{ orgSlug: string; locationId: string }>
}) {
  const { orgSlug, locationId } = await params
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
  const source = await primaryIntegration(db, org.organizationId)
  const network = await loadRetailNetwork(db, org, source.integrationId, source.connectorType)

  const locations = network.data?.locations ?? []
  const location = locations.find((l) => l.id === locationId)

  /*
   * Nepostojeće mesto je 404, ne prazan ekran.
   *
   * `locationId` dolazi iz adrese, dakle od korisnika. Prikaz praznog objekta
   * za izmišljen id izgleda kao da objekat postoji a nema prometa — što je
   * sasvim druga vest.
   */
  if (!location) notFound()

  const money = (value: string | number, currency: string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      Number(value),
    )
  const number = (value: number) => new Intl.NumberFormat(intl).format(value)
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)

  const average = averageMargin(locations)
  const step = marginStep(location.marginPercent, average)
  const change = changePercent(location.monthToDate, location.previousPeriod)

  const totalProductRevenue = location.topProducts.reduce((sum, p) => sum + Number(p.revenue), 0)

  /* Pitanje se sastavlja ovde, sa imenom objekta — sagovornik ga dobija gotovog. */
  const question = t('retail.askAbout', { location: location.label })

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="building"
      title={location.label}
      backLabel={t('detail.back')}
    >
      <Link href={`/w/${org.organizationSlug}/maloprodaja` as Route} className={styles.backToMap}>
        <Icon name="arrowRight" size={15} />
        {t('retail.backToNetwork')}
      </Link>

      <Stats
        stats={[
          moneyStat(t('retail.monthToDate'), location.monthToDate, location.currency, intl),
          moneyStat(
            t('retail.previousPeriod'),
            location.previousPeriod,
            location.currency,
            intl,
            change < -5 ? 'warn' : undefined,
          ),
          {
            label: t('retail.margin'),
            value: percent(location.marginPercent),
            ...(step <= -2 ? { tone: 'critical' as const } : step < 0 ? { tone: 'warn' as const } : {}),
          },
          { label: t('retail.receipts'), value: number(location.transactions) },
        ]}
      />

      {/*
        Rečenica koja spaja dva broja u nalaz.
        Marža i promet stoje jedno pored drugog u karticama iznad, ali tek
        rečenica kaže šta to ZNAČI za ovo mesto u odnosu na ostatak mreže.
      */}
      <p className={detail.thresholds}>
        {step < 0
          ? t('retail.verdict.below', {
              margin: percent(location.marginPercent),
              average: percent(average),
            })
          : step > 0
            ? t('retail.verdict.above', {
                margin: percent(location.marginPercent),
                average: percent(average),
              })
            : t('retail.verdict.on', { average: percent(average) })}
      </p>

      <section className={detail.card}>
        <h2 className={detail.title} style={{ fontSize: 'var(--text-md)' }}>
          {t('retail.topProducts')}
        </h2>
        <DataTable
          rows={location.topProducts}
          emptyLabel={t('retail.noProducts')}
          unavailableLabel={t('brief.unavailable')}
          columns={[
            { key: 'name', header: t('retail.col.product'), render: (p) => p.name },
            {
              key: 'qty',
              header: t('retail.col.quantity'),
              numeric: true,
              render: (p) => `${number(p.quantity)} ${p.unit}`,
            },
            {
              key: 'revenue',
              header: t('retail.col.revenue'),
              numeric: true,
              render: (p) => money(p.revenue, location.currency),
            },
            {
              key: 'share',
              header: t('retail.col.share'),
              numeric: true,
              render: (p) =>
                totalProductRevenue > 0
                  ? percent((Number(p.revenue) / totalProductRevenue) * 100)
                  : '—',
            },
          ]}
        />
        <Source block={network} t={t} formatDate={formatDate} />
      </section>

      <Link
        href={`/w/${org.organizationSlug}/pitanja?q=${encodeURIComponent(question)}` as Route}
        className={styles.askLink}
      >
        <Icon name="ask" size={17} />
        {t('retail.askAction')}
      </Link>
    </DetailShell>
  )
}
