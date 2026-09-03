import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { businessRulesFor } from '@/core/rules/repository'
import { loadSalesHistory } from '@/core/context/history'
import { CONTEXT_EVENT_KINDS } from '@/core/context/repository'
import { Icon } from '@/ui/primitives/Icon'
import { ContextEventForm, DeleteEventButton } from './event-form'
import styles from './context.module.css'

export default async function ContextPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const reqId = makeRequestId(await headers())

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
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatDate } = createTranslator(locale)
  const intl = INTL_LOCALE[locale]

  initialiseConnectors()

  const [source, rules] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
  ])

  const history = await loadSalesHistory(
    db,
    org,
    source.integrationId,
    source.connectorType,
    rules.forecastHistoryYears,
  )

  const money = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'currency',
      currency: history.currency ?? org.currency,
      maximumFractionDigits: 0,
    }).format(value)

  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value / 100)

  // Događaj menja osnovicu za poređenje, dakle i koja se upozorenja otvaraju.
  // To nije komentar nego podešavanje analize, i ne sme svako.
  const canEdit = org.permissions.includes('manage_alerts')

  const months = history.months ?? []
  const peak = months.reduce((max, m) => Math.max(max, m.total), 0)
  const yoy = history.yearOverYear

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="note" size={22} />
          {t('context.title')}
        </h1>
        <p className={styles.lede}>{t('context.lede')}</p>
      </header>

      {months.length > 0 ? (
        <section className={styles.head}>
          <h2 className={styles.label}>{t('history.title')}</h2>

          <div className={styles.months}>
            {months.map((m) => (
              <div key={m.month} className={styles.month} title={`${m.month} · ${money(m.total)}`}>
                <div
                  className={`${styles.monthBar} ${m.events.length > 0 ? styles.monthBarEvent : ''}`.trim()}
                  style={{ height: `${peak > 0 ? Math.max(2, (m.total / peak) * 80) : 2}px` }}
                />
                {/* Oznaka samo za januar — inače se natpisi preklope i postanu nečitljivi. */}
                <span className={styles.monthLabel}>
                  {m.month.endsWith('-01') ? m.month.slice(0, 4) : ''}
                </span>
              </div>
            ))}
          </div>

          {yoy ? (
            <div className={styles.compare}>
              <div className={styles.compareRow}>
                <span className={styles.compareLabel}>
                  {t('history.yoy')} · {yoy.current.month}
                </span>
                <span className={styles.compareValue}>{money(yoy.current.total)}</span>
              </div>

              {yoy.previous === undefined ? (
                <p className={styles.compareLabel}>{t('history.noPrevious')}</p>
              ) : (
                <>
                  <div className={styles.compareRow}>
                    <span className={styles.compareLabel}>{t('history.raw')}</span>
                    <span
                      className={`${styles.compareValue} ${
                        (yoy.rawChangePercent ?? 0) >= 0 ? styles.up : styles.down
                      }`}
                    >
                      {yoy.rawChangePercent === undefined
                        ? '—'
                        : percent(yoy.rawChangePercent)}
                    </span>
                  </div>

                  {/*
                    Prilagođeni procenat stoji PORED izvornog, nikad umesto
                    njega. Samo prilagođeni bi sakrio da je poređenje dirano;
                    samo izvorni vraća lažni pad.
                  */}
                  {yoy.adjustedChangePercent !== undefined ? (
                    <div className={styles.compareRow}>
                      <span className={styles.compareLabel}>{t('history.adjusted')}</span>
                      <span
                        className={`${styles.compareValue} ${
                          yoy.adjustedChangePercent >= 0 ? styles.up : styles.down
                        }`}
                      >
                        {percent(yoy.adjustedChangePercent)}
                      </span>
                    </div>
                  ) : null}

                  {yoy.needsNote ? (
                    <p className={styles.note}>
                      <Icon name="warning" size={16} />
                      {t('history.adjustedNote')}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {canEdit ? (
        <ContextEventForm
          orgSlug={org.organizationSlug}
          kinds={CONTEXT_EVENT_KINDS.map((key) => ({
            key,
            label: t(`context.kind.${key}` as MessageKey),
          }))}
          labels={{
            title: t('context.eventTitle'),
            kind: t('context.kind'),
            note: t('context.note'),
            startsOn: t('context.startsOn'),
            endsOn: t('context.endsOn'),
            endsOnHint: t('context.endsOnHint'),
            revenueImpact: t('context.revenueImpact'),
            revenueImpactHint: t('context.revenueImpactHint'),
            treatment: t('context.treatment'),
            excludeFromBaseline: t('context.excludeFromBaseline'),
            keepInTotals: t('context.keepInTotals'),
            excludeFromForecast: t('context.excludeFromForecast'),
            annotateComparison: t('context.annotateComparison'),
            add: t('context.add'),
            saved: t('context.saved'),
            messages: messagesFor(locale, ['error.', 'context.error.']),
          }}
        />
      ) : null}

      {(history.events ?? []).length === 0 ? (
        <p className={styles.empty}>{t('context.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {(history.events ?? []).map((event) => (
            <li key={event.id} className={styles.event}>
              <div className={styles.eventHead}>
                <span className={styles.eventTitle}>{event.title}</span>
                <span className={styles.eventPeriod}>
                  {event.endsOn === null
                    ? t('context.periodOpen', {
                        from: formatDate(`${event.startsOn}T00:00:00Z`, { dateStyle: 'medium' }),
                      })
                    : t('context.period', {
                        from: formatDate(`${event.startsOn}T00:00:00Z`, { dateStyle: 'medium' }),
                        to: formatDate(`${event.endsOn}T00:00:00Z`, { dateStyle: 'medium' }),
                      })}
                </span>
              </div>

              {event.note ? <p className={styles.eventNote}>{event.note}</p> : null}

              <div className={styles.eventMeta}>
                <span className={styles.tag}>
                  {t(`context.kind.${event.kind}` as MessageKey)}
                </span>
                {event.revenueImpact !== null ? (
                  <span className={styles.impact}>{money(event.revenueImpact)}</span>
                ) : null}
                {event.excludeFromBaseline ? (
                  <span className={styles.tag}>{t('context.excludeFromBaseline')}</span>
                ) : null}
                {event.excludeFromForecast ? (
                  <span className={styles.tag}>{t('context.excludeFromForecast')}</span>
                ) : null}
                {canEdit ? (
                  <DeleteEventButton
                    orgSlug={org.organizationSlug}
                    eventId={event.id}
                    label={t('context.delete')}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
