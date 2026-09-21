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
import { loadRetailNetwork } from '@/core/retail/loader'
import { averageMargin, networkTotals } from '@/core/retail/network'
import { networkStock } from '@/core/retail/analytics'
import { businessRulesFor } from '@/core/rules/repository'
import { RetailMap } from '@/ui/charts/retail-map'
import { DetailShell, Source, Unavailable } from '../detail-shell'
import { LocationCards } from './location-cards'
import detail from '../detail.module.css'
import styles from './retail.module.css'

/**
 * Prodajna mreža na karti.
 *
 * Postoji zato što zbir po firmi krije ono što vlasnika zapravo zanima. „Promet
 * 42 miliona" ne kaže da Niš vuče najviše kupaca a zarađuje najmanje po dinaru
 * prometa — a to je rečenica zbog koje se nešto menja u ponedeljak ujutru.
 */
export default async function RetailNetworkPage({
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
  const source = await primaryIntegration(db, org.organizationId)
  const [network, rules] = await Promise.all([
    loadRetailNetwork(db, org, source.integrationId, source.connectorType),
    businessRulesFor(db, org.organizationId),
  ])

  const money = (value: string, currency: string) =>
    new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      Number(value),
    )

  /* Skraćen zapis samo na karti: pun iznos ne staje pored kruga. */
  const compact = (value: string, currency: string) =>
    new Intl.NumberFormat(intl, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(Number(value))

  const number = (value: number) => new Intl.NumberFormat(intl).format(value)

  /*
   * Množina se ne pogađa nego pita.
   *
   * Srpski ima tri oblika (1 objekat / 2 objekta / 5 objekata), engleski dva.
   * `Intl.PluralRules` zna oba, pa se pravilo ne prepisuje u kod — a zna i
   * jezike koje sutra dodamo.
   */
  const plural = new Intl.PluralRules(intl)
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)

  const locations = network.data?.locations ?? []

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="building"
      title={t('retail.title')}
      backLabel={t('detail.back')}
    >
      {network.unavailable ? (
        <Unavailable block={network} t={t} />
      ) : locations.length === 0 ? (
        <div className={detail.pending}>
          <span className={detail.pendingLabel}>{t('brief.unavailable')}</span>
          <span>{t('retail.unavailable')}</span>
        </div>
      ) : (
        <>
          {/*
            Zbir po VALUTI, ne jedan broj.
            Dinari, marke i evri nemaju zajednički zbir bez kursa na dan, a kurs
            nemamo iz proverenog izvora. Sabrana cifra bi bila izmišljen broj
            prikazan kao činjenica.
          */}
          <div className={styles.summary}>
            {networkTotals(locations).map((total) => (
              <div key={total.currency} className={styles.summaryCard}>
                <span className={styles.summaryLabel}>
                  {t('retail.totalIn', { currency: total.currency })}
                </span>
                <span className={styles.summaryValue}>
                  {money(total.total, total.currency)}
                </span>
                <span className={styles.summaryMeta}>
                  {t(
                    `retail.locationCount.${plural.select(total.locationCount)}` as MessageKey,
                    { count: total.locationCount },
                  )}
                </span>
              </div>
            ))}

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>{t('retail.averageMargin')}</span>
              <span className={styles.summaryValue}>{percent(averageMargin(locations))}</span>
              <span className={styles.summaryMeta}>{t('retail.weightedByTurnover')}</span>
            </div>
          </div>

          {/*
            Zaliha stoji uz promet, ne na zasebnom ekranu.
            Promet bez zalihe je pola slike: objekat koji dobro prodaje a drži
            mrtav novac ne izgleda drugačije od onog koji ne drži — a razlika je
            u novcu koji stoji na polici.
          */}
          <div className={styles.summary}>
            {networkStock(locations, rules).map((stock) => (
              <div key={stock.currency} className={styles.summaryCard}>
                <span className={styles.summaryLabel}>
                  {t('retail.stockValue', { currency: stock.currency })}
                </span>
                <span className={styles.summaryValue}>
                  {money(stock.value, stock.currency)}
                </span>
                <span className={styles.summaryMeta}>
                  {t('retail.deadShare', { share: percent(stock.deadShare) })} ·{' '}
                  {t(
                    `retail.shortageCount.${plural.select(stock.shortageCount)}` as MessageKey,
                    { count: stock.shortageCount },
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.split}>
            <section className={styles.mapPane}>
              <RetailMap
                locations={locations}
                money={compact}
                labels={{
                  title: t('retail.title'),
                  aboveAverage: t('retail.legend.above'),
                  average: t('retail.legend.average'),
                  belowAverage: t('retail.legend.below'),
                  bubbleMeaning: t('retail.legend.size'),
                }}
              />
            </section>

            <section className={styles.cardsPane}>
              <LocationCards
                locations={locations}
                orgSlug={org.organizationSlug}
                money={money}
                number={number}
                percent={percent}
                labels={{
                  monthToDate: t('retail.monthToDate'),
                  margin: t('retail.margin'),
                  receipts: t('retail.receipts'),
                  topProducts: t('retail.topProducts'),
                  seeMore: t('retail.seeMore'),
                  aboveAverage: t('retail.aboveAverage'),
                  belowAverage: t('retail.belowAverage'),
                  onAverage: t('retail.onAverage'),
                  vsPrevious: t('delta.vsSameLastMonth'),
                  changeUp: t('delta.up', { value: '{value}', hint: '{hint}' }),
                  changeDown: t('delta.down', { value: '{value}', hint: '{hint}' }),
                }}
              />
            </section>
          </div>

          <div className={detail.card}>
            <Source block={network} t={t} formatDate={formatDate} />
          </div>
        </>
      )}
    </DetailShell>
  )
}
