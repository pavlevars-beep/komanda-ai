import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadRetailNetwork } from '@/core/retail/loader'
import { averageMargin, changePercent, marginStep } from '@/core/retail/network'
import { seasonalComparison } from '@/core/retail/analytics'
import { businessRulesFor } from '@/core/rules/repository'
import { SeasonChart } from '@/ui/charts/season-chart'
import { LocationAnalysis } from './analysis'
import { Icon } from '@/ui/primitives/Icon'
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
  const [network, rules] = await Promise.all([
    loadRetailNetwork(db, org, source.integrationId, source.connectorType),
    // Pragovi za mrtav novac i nestašicu dolaze iz pravila KOJE JE FIRMA
    // POSTAVILA, ne iz koda: šta je „sporo" zna vlasnik, ne program.
    businessRulesFor(db, org.organizationId),
  ])

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
  /* Množina se ne pogađa nego pita — srpski ima tri oblika, engleski dva. */
  const plural = new Intl.PluralRules(intl)
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)

  const average = averageMargin(locations)
  const step = marginStep(location.marginPercent, average)
  const change = changePercent(location.monthToDate, location.previousPeriod)

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
          {t('retail.history')}
        </h2>
        <SeasonChart
          points={seasonalComparison(location.history)}
          currency={location.currency}
          money={money}
          monthLabel={(month) =>
            new Intl.DateTimeFormat(intl, { month: 'short', year: '2-digit' }).format(
              new Date(`${month}-01T00:00:00Z`),
            )
          }
          labels={{
            title: t('retail.history'),
            thisYear: t('retail.history.thisYear'),
            lastYear: t('retail.history.lastYear'),
            tableLabel: t('retail.history.table'),
            monthHeader: t('retail.col.month'),
            valueHeader: t('retail.col.revenue'),
          }}
        />
      </section>

      <LocationAnalysis
        location={location}
        rules={rules}
        orgSlug={org.organizationSlug}
        money={money}
        number={number}
        percent={percent}
        itemsPhrase={(count) =>
          t(`retail.items.${plural.select(count)}` as MessageKey, { count })
        }
        question={(topic) =>
          t(`retail.ask.${topic}` as MessageKey, { location: location.label })
        }
        labels={{
          deadTitle: t('retail.dead.title'),
          deadEmpty: t('retail.dead.empty'),
          deadFinding: t('retail.dead.finding', {
            value: '{value}',
            days: '{days}',
            share: '{share}',
            items: '{items}',
          }),
          shortageTitle: t('retail.shortage.title'),
          shortageEmpty: t('retail.shortage.empty'),
          shortageFinding: t('retail.shortage.finding', { items: '{items}' }),
          volumeTitle: t('retail.volume.title'),
          volumeEmpty: t('retail.volume.empty'),
          volumeFinding: t('retail.volume.finding', {
            items: '{items}',
            average: '{average}',
          }),
          abcTitle: t('retail.abc.title'),
          abcFinding: t('retail.abc.finding', {
            count: '{count}',
            total: '{total}',
            share: '{share}',
          }),
          colProduct: t('retail.col.product'),
          colStock: t('retail.col.stock'),
          colValue: t('retail.col.value'),
          colLastSold: t('retail.col.lastSold'),
          colCover: t('retail.col.cover'),
          colLead: t('retail.col.lead'),
          colRevenue: t('retail.col.revenue'),
          colMargin: t('retail.margin'),
          colShare: t('retail.col.share'),
          days: t('retail.days'),
          ask: t('retail.analysisAsk'),
        }}
      />

      <div className={detail.card}>
        <Source block={network} t={t} formatDate={formatDate} />
      </div>

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
