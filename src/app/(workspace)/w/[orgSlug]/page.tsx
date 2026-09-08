import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { primaryIntegration } from '@/core/dashboard/loader'
import { loadMorningBrief } from '@/core/brief/loader'
import { loadBoard } from '@/core/dashboard/board'
import { businessRulesFor } from '@/core/rules/repository'
import { briefSections } from '@/core/brief/focus'
import { initialiseConnectors } from '@/core/connectors'
import { INTL_LOCALE } from '@/i18n/config'
import { createTranslator } from '@/i18n/translator'
import { writeAudit } from '@/core/audit/writer'
import { requestLocale } from '@/server/http/locale'
import { Brief } from './brief'
import { MetricsBoard } from './board'
import { WorldClocks, type Clock } from './clocks'
import styles from './brief.module.css'

/**
 * Razmak automatskog osvežavanja.
 *
 * Šezdeset sekundi je izabrano prema tome koliko brzo se podatak STVARNO
 * menja, ne prema tome koliko često ekran može da se ponovi. Kraći razmak
 * troši ograničenje broja zahteva ka izvoru, a brojevi ostaju isti.
 */
const REFRESH_SECONDS = 60

function greetingKey(hour: number) {
  if (hour < 11) return 'home.greeting.morning' as const
  if (hour < 18) return 'home.greeting.day' as const
  return 'home.greeting.evening' as const
}

/**
 * Početna strana klijenta je JUTARNJI BRIF, ne tabla sa grafikonima.
 *
 * Rukovodilac ne treba da pregleda sve i sam zaključi šta je važno. Ekran
 * počinje izuzecima, pa tek onda daje brojeve iz kojih su izvedeni.
 */
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
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatNumber, formatDate } = createTranslator(locale)

  initialiseConnectors()

  const [source, rules] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
  ])

  /*
   * Tabla i brif se učitavaju UPOREDO. Redom bi se njihova vremena čekanja
   * sabrala, a oba čitaju iz istog izvora — nema razloga da drugi čeka prvi.
   */
  const [brief, board] = await Promise.all([
    loadMorningBrief(db, org, source.integrationId, source.connectorType, rules),
    loadBoard(
      db,
      org,
      source.integrationId,
      source.connectorType,
      rules.forecastHistoryYears,
    ),
  ])

  await writeAudit(db, {
    action: 'workspace.opened',
    status: 'success',
    actorType: org.staff ? 'staff' : 'user',
    requestId: reqId,
    organizationId: org.organizationId,
  })

  const intl = INTL_LOCALE[locale]
  const firstName = (user.fullName ?? '').split(' ')[0]
  const greeting = `${t(greetingKey(new Date().getHours()))}${firstName ? `, ${firstName}` : ''}`

  /*
   * Zone se biraju po tome sa kim se posluje. Prva je zona same organizacije,
   * iz baze, i izostavlja se iz ostatka spiska kada se poklopi — isti sat ne
   * sme da stoji dvaput.
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

  const money = (value: string | number, currency: string) =>
    new Intl.NumberFormat(intl, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value))

  const percent = (value: number) =>
    new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)

  return (
    <>
      {/*
        Tabla stoji IZNAD brifa, ne umesto njega. Tabla odgovara na „koliko" i
        „kako se kreće", brif na „šta danas traži pažnju".
      */}
      <section className={styles.section} style={{ maxWidth: 900, marginBottom: 'var(--space-7)' }}>
        <h2 className={styles.sectionTitle}>{t('board.title')}</h2>
        <MetricsBoard
          board={board}
          brief={brief}
          rules={rules}
          refreshSeconds={REFRESH_SECONDS}
          f={{
            t,
            money,
            number: (value) => formatNumber(value),
            percent,
            // Skraćen zapis za ose i opise: pun iznos u milionima ne staje
            // ispod stubića i gura ceo grafikon u vodoravno klizanje.
            compact: (value, currency) =>
              new Intl.NumberFormat(intl, {
                style: 'currency',
                currency,
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(value),
            monthLabel: (month) =>
              new Intl.DateTimeFormat(intl, { month: 'short', year: '2-digit' }).format(
                new Date(`${month}-01T00:00:00Z`),
              ),
            dayLabel: (date) =>
              new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'numeric' }).format(
                new Date(`${date}T00:00:00Z`),
              ),
          }}
        />
      </section>

      <Brief
        brief={brief}
        orgSlug={org.organizationSlug}
        greeting={greeting}
        sections={briefSections(org.memberRole, org.permissions)}
        f={{
          t,
          money: (amount, currency) =>
            new Intl.NumberFormat(intl, {
              style: 'currency',
              currency,
              maximumFractionDigits: 0,
            }).format(Number(amount)),
          number: (value) => formatNumber(value),
          percent: (value) =>
            new Intl.NumberFormat(intl, {
              style: 'percent',
              maximumFractionDigits: 1,
            }).format(value / 100),
          date: (value) => formatDate(value.length === 10 ? `${value}T00:00:00Z` : value, {
            dateStyle: 'medium',
          }),
        }}
      />

      <section className={styles.section} style={{ maxWidth: 900, marginTop: 'var(--space-7)' }}>
        <h2 className={styles.sectionTitle}>{t('home.clocks')}</h2>
        <WorldClocks clocks={clocks} locale={intl} />
      </section>
    </>
  )
}
