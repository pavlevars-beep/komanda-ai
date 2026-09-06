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
import { getBranding } from '@/core/branding/repository'
import { PrintButton } from './print-button'
import styles from './report.module.css'

/**
 * Izveštaj kao dokument za štampu.
 *
 * Namerno NIJE zakazivanje i slanje na e-poštu. Raspored izveštaja bez
 * stvarnog izvora podataka bio bi mehanizam koji uredno šalje prazne
 * dokumente — a to je gore od izostanka rasporeda.
 *
 * Ovo je presek stanja na dati trenutak: isti podaci koje brif prikazuje, u
 * obliku koji direktor može da odštampa i ponese na sastanak. Svaki blok nosi
 * izvor i vreme, jer papir preživi ekran i čita se kasnije, kada niko više ne
 * pamti odakle je broj došao.
 */
export default async function ReportPage({
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
  const [source, rules, branding] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
    getBranding(db, org.organizationId),
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

  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value / 100)

  const now = new Date()
  const workspaceName =
    (branding.ok && branding.value?.workspace_name) || org.organizationName

  const sales = brief.sales.data
  const receivables = brief.receivables.data
  const payables = brief.payables.data
  const stock = brief.stock.data

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <PrintButton label={t('reports.print')} />
      </div>
      <p className={styles.lede}>{t('reports.lede')}</p>

      <article className={styles.document}>
        <header className={styles.docHead}>
          <h1 className={styles.docTitle}>
            {workspaceName} — {t('reports.title')}
          </h1>
          <span className={styles.docMeta}>
            {t('reports.generatedAt', {
              when: formatDate(now, { dateStyle: 'full', timeStyle: 'short' }),
            })}
          </span>
          <span className={styles.docMeta}>
            {t('reports.by', { name: user.fullName ?? user.email })}
          </span>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('reports.section.attention')}</h2>
          {brief.attention.length === 0 ? (
            <p className={styles.calm}>{t('brief.attention.none')}</p>
          ) : (
            <ul className={styles.items}>
              {brief.attention.map((item, index) => (
                <li
                  key={`${item.kind}-${index}`}
                  className={item.severity === 'critical' ? styles.critical : styles.warn}
                >
                  {/*
                    Na papiru se težina ne vidi bojom — crno-bela štampa je
                    normalna. Zato ide i oznaka pred tekstom.
                  */}
                  {item.severity === 'critical' ? '!! ' : item.severity === 'warning' ? '! ' : '· '}
                  {item.evidence
                    .map((e) => `${t(e.label as MessageKey)}: ${e.value}`)
                    .join(' · ')}
                </li>
              ))}
            </ul>
          )}
        </section>

        {sales ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('reports.section.sales')}</h2>
            <dl className={styles.rows}>
              {(
                [
                  ['brief.sales.yesterday', sales.yesterday],
                  ['brief.sales.last7', sales.last7Days],
                  ['brief.sales.month', sales.monthToDate],
                ] as const
              ).map(([key, period]) => (
                <div key={key} className={styles.row}>
                  <dt className={styles.rowLabel}>{t(key)}</dt>
                  <dd className={styles.rowValue}>
                    {money(period.total, sales.currency)}
                    {period.changePercent !== 0 ? ` (${percent(period.changePercent)})` : ''}
                  </dd>
                </div>
              ))}
            </dl>
            {brief.sales.provenance?.freshness?.asOf ? (
              <span className={styles.source}>
                {t('brief.asOf', {
                  when: formatDate(brief.sales.provenance.freshness.asOf, { dateStyle: 'medium' }),
                })}
              </span>
            ) : null}
          </section>
        ) : null}

        {receivables ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('reports.section.receivables')}</h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{t('brief.receivables.total')}</dt>
                <dd className={styles.rowValue}>
                  {money(receivables.total, receivables.currency)}
                </dd>
              </div>
              {receivables.buckets.map((bucket) => (
                <div key={bucket.fromDays} className={styles.row}>
                  <dt className={styles.rowLabel}>
                    {bucket.toDays === null
                      ? t('brief.receivables.bucketOpen', { from: bucket.fromDays })
                      : t('brief.receivables.bucket', {
                          from: bucket.fromDays,
                          to: bucket.toDays,
                        })}
                  </dt>
                  <dd
                    className={`${styles.rowValue} ${
                      bucket.fromDays >= rules.receivableCriticalDays ? styles.critical : ''
                    }`.trim()}
                  >
                    {money(bucket.amount, receivables.currency)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {payables ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('reports.section.payables')}</h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{t('brief.payables.total')}</dt>
                <dd className={styles.rowValue}>{money(payables.total, payables.currency)}</dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{t('brief.payables.soon')}</dt>
                <dd className={styles.rowValue}>
                  {money(payables.dueWithin7Days, payables.currency)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {stock ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('reports.section.stock')}</h2>
            <dl className={styles.rows}>
              {[...stock.items]
                .filter((i) => i.averageDailySales > 0)
                .sort((a, b) => a.daysOfCover - b.daysOfCover)
                .slice(0, 8)
                .map((item) => (
                  <div key={item.item} className={styles.row}>
                    <dt className={styles.rowLabel}>
                      {item.item} ·{' '}
                      {t('brief.stock.perDay', { value: formatNumber(item.averageDailySales) })}
                    </dt>
                    <dd
                      className={`${styles.rowValue} ${
                        item.daysOfCover <= rules.stockCriticalDays ||
                        item.daysOfCover < item.leadTimeDays
                          ? styles.critical
                          : item.daysOfCover <= rules.stockWarningDays
                            ? styles.warn
                            : ''
                      }`.trim()}
                    >
                      {t('panel.days', { days: item.daysOfCover })}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ) : null}

        <footer className={styles.footer}>
          <p>
            {t('reports.thresholdNote', {
              warning: rules.receivableWarningDays,
              critical: rules.receivableCriticalDays,
              stock: rules.stockWarningDays,
            })}
          </p>
          {org.isDemo ? <p>{t('common.demoData')}</p> : null}
        </footer>
      </article>
    </div>
  )
}
