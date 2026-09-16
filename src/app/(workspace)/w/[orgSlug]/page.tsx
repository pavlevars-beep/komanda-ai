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
import { organizationStaleness } from '@/core/import/expectations'
import { formatLocal } from '@/core/import/silence-message'
import { resolveBriefSections } from '@/core/brief/preferences'
import { getBriefPreference } from '@/core/brief/preferences-repository'
import { initialiseConnectors } from '@/core/connectors'
import { INTL_LOCALE } from '@/i18n/config'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { writeAudit } from '@/core/audit/writer'
import { requestLocale } from '@/server/http/locale'
import { Brief } from './brief'
import { MetricsBoard } from './board'
import { WorldClocks, type Clock } from './clocks'
import { StalenessBanner } from './staleness'
import { AskBox } from './ask-box'
import { LinksCard } from './links-card'
import { groupedLinks } from '@/core/links/catalog'
import { suggestQuestions } from '@/core/ai/suggestions'
import { askableIntents } from '@/core/ai/ask'
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

  const [source, rules, staleness, briefPreference] = await Promise.all([
    primaryIntegration(db, org.organizationId),
    businessRulesFor(db, org.organizationId),
    /*
     * Provera tišine ide UPOREDO sa učitavanjem podataka i nezavisno od
     * zakazanog prolaza. Prolaz javlja konsultantu i kada niko ne gleda; ovo
     * garantuje da onaj ko GLEDA nikad ne vidi zastareo broj bez oznake, čak i
     * kada je zakazani posao stao.
     */
    organizationStaleness(db, org.organizationId),
    getBriefPreference(db, org.organizationId, user.id),
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

  /*
   * Redosled je namerno ovakav: prvo se kaže da podatak NEDOSTAJE, pa se tek
   * onda prikazuju brojevi. Obrnuto bi značilo da rukovodilac pročita iznos pre
   * nego što sazna na koji se dan odnosi.
   */
  const stalenessLines = staleness.map((item) => {
    const kind = t(`import.kind.${item.kind}` as MessageKey)
    const when = item.verdict.silentSince
      ? formatLocal(item.verdict.silentSince, item.timeZone)
      : ''

    if (item.verdict.state === 'never') return t('staleness.never', { kind })
    if (item.verdict.state === 'late') return t('staleness.late', { kind, when })
    return t('staleness.missing', {
      kind,
      when,
      count: item.verdict.missedPeriods,
    })
  })

  const stalenessTone = staleness.some((item) => item.verdict.state !== 'late')
    ? ('critical' as const)
    : ('warn' as const)

  /*
   * Predlozi pitanja se računaju OVDE, a ne na stranici razgovora.
   *
   * Stavke koje traže pažnju su već učitane za brif, pa predlog izveden iz njih
   * ne košta nijedan dodatni poziv ka izvoru. Ista računica na drugom ekranu
   * značila bi pet poziva samo da bi se ponudila četiri pitanja.
   */
  const intents = await askableIntents(db, org, source.integrationId)
  const suggestions = suggestQuestions({
    attention: brief.attention,
    answerable: intents,
  }).map((s) => t(`ask.suggest.${s.key}` as MessageKey, s.params))

  return (
    <>
      <StalenessBanner
        tone={stalenessTone}
        title={t('staleness.title')}
        lines={stalenessLines}
      />

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

      <AskBox
        orgSlug={org.organizationSlug}
        suggestions={suggestions}
        labels={{
          title: t('ask.home.title'),
          placeholder: t('ask.home.placeholder'),
          open: t('ask.home.open'),
          none: t('ask.home.none'),
        }}
      />

      <Brief
        brief={brief}
        orgSlug={org.organizationSlug}
        greeting={greeting}
        sections={resolveBriefSections(briefPreference, org.memberRole, org.permissions)}
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
        {/*
        Javni servisi stoje na DNU: to je pomoćni alat koji se otvori jednom
        nedeljno, a ne podatak zbog kojeg se ekran gleda svakog jutra.
      */}
      <LinksCard
        title={t('links.title')}
        lede={t('links.lede')}
        needsAccountLabel={t('links.needsAccount')}
        groups={groupedLinks().map((group) => ({
          category: group.category,
          label: t(`links.category.${group.category}` as MessageKey),
          links: group.links.map((link) => ({
            key: link.key,
            url: link.url,
            label: t(`links.${link.key}` as MessageKey),
            hint: t(`links.${link.key}.hint` as MessageKey),
            needsAccount: link.needsAccount ?? false,
          })),
        }))}
      />

      <WorldClocks clocks={clocks} locale={intl} />
      </section>
    </>
  )
}
