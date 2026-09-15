import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { cookies, headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import {
  listActiveAccessSessions,
  resolveOrgContext,
} from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
import { ThemeToggle } from '@/app/theme-toggle'
import { readThemeCookie } from '@/ui/theme/theme'
import { deriveBrandPalette } from '@/core/branding/contrast'
import { getBranding } from '@/core/branding/repository'
import { AccessBanner } from '@/ui/patterns/AccessBanner'
import { DemoBadge } from '@/ui/patterns/StatusBadge'
import { NavList, type NavItem } from '@/ui/patterns/NavList'
import { BrandLogo } from '@/ui/patterns/BrandLogo'
import { countUnread } from '@/core/messages/repository'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { askableIntents } from '@/core/ai/ask'
import { suggestQuestions } from '@/core/ai/suggestions'
import { AskDock } from './ask-dock'
import { EndAccessButton } from './end-access-button'
import styles from '../../layout.module.css'

/**
 * Guard radnog prostora klijenta.
 *
 * Slug iz putanje se ne uzima kao dokaz pripadnosti — kontekst razrešava
 * baza, i vraća prazno kada korisnik nema pristup. Zato se ovde ne poziva
 * `forbidden()` nego `notFound()`: poruka "nemate pristup ovoj organizaciji"
 * potvrdila bi da organizacija postoji.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const headerList = await headers()
  const db = await userDb()

  const user = await currentUser(db)
  if (!user) notFound()

  const resolved = await resolveOrgContext(db, {
    slug: orgSlug,
    userId: user.id,
    userName: user.fullName,
    requestId: makeRequestId(headerList),
  })
  if (!resolved.ok) notFound()

  const org = resolved.value
  // Izbor korisnika ima prednost nad podešavanjem organizacije; prekidač
  // mora da radi i ovde, a ne samo u konzoli.
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t, formatDate } = createTranslator(locale)

  const [sessions, branding, unread, cookieStore] = await Promise.all([
    listActiveAccessSessions(db, org.organizationId),
    getBranding(db, org.organizationId),
    countUnread(db, org.organizationId, user.id),
    cookies(),
  ])

  const theme = readThemeCookie(cookieStore.get('theme')?.value)

  // Boja klijenta se ne primenjuje sirova — prolazi kroz istu korekciju
  // kontrasta koju konsultant vidi u pregledu pri podešavanju. Kada boja nije
  // podešena, ostaje podrazumevani akcent platforme.
  const brandHex = (branding.ok && branding.value?.primary_color) || null
  const palette = brandHex ? deriveBrandPalette({ hex: brandHex, scheme: 'light' }) : null
  const brandVars = palette
    ? ({
        '--brand': palette.brand,
        '--brand-ink': palette.brandInk,
        '--brand-soft': palette.brandSoft,
        '--brand-contrast': palette.brandContrast,
      } as React.CSSProperties)
    : undefined

  // Prikazuje se samo ono što postoji. Ostalo je vidljivo, ali označeno kao
  // nedostupno — link koji vodi na 404 izgleda kao kvar, ne kao nedovršenost.
  /*
   * Predlozi za traku dolaze iz DOSTUPNIH sposobnosti, ne iz stavki pažnje.
   *
   * Traka stoji na svakom ekranu radnog prostora, pa bi računanje stavki pažnje
   * ovde značilo pet poziva ka izvoru pri svakom otvaranju bilo koje stranice.
   * Predlozi izvedeni iz podataka ostaju na početnoj, gde su besplatni jer je
   * brif tamo ionako učitan.
   */
  initialiseConnectors()
  const source = await primaryIntegration(db, org.organizationId)
  const intents = await askableIntents(db, org, source.integrationId)
  const dockSuggestions = suggestQuestions({ attention: [], answerable: intents }).map((s) =>
    t(`ask.suggest.${s.key}` as MessageKey, s.params),
  )

  const nav: NavItem[] = [
    { href: `/w/${org.organizationSlug}` as Route, label: t('nav.home'), icon: 'home' },
    { href: `/w/${org.organizationSlug}/pitanja` as Route, label: t('nav.ask'), icon: 'ask' },
    {
      href: `/w/${org.organizationSlug}/poruke` as Route,
      label: t('messages.title'),
      icon: 'megaphone',
      ...(unread > 0 ? { badge: unread } : {}),
    },
    {
      href: `/w/${org.organizationSlug}/kontekst` as Route,
      label: t('context.nav'),
      icon: 'building',
    },
    { href: `/w/${org.organizationSlug}/beleske` as Route, label: t('notes.title'), icon: 'note' },
    {
      href: `/w/${org.organizationSlug}/izvestaji` as Route,
      label: t('nav.reports'),
      icon: 'chart',
    },
    {
      href: `/w/${org.organizationSlug}/upozorenja` as Route,
      label: t('nav.alerts'),
      icon: 'bell',
    },
    { label: t('nav.approvals'), icon: 'check' },
    {
      href: `/w/${org.organizationSlug}/pravila` as Route,
      label: t('nav.settings'),
      icon: 'settings',
    },
  ]

  return (
    <div className={styles.shell} style={brandVars}>
      {sessions.ok ? (
        <AccessBanner
          sessions={sessions.value.map((s) => ({
            sessionId: s.session_id,
            staffName: s.staff_name,
            reason: s.reason,
            expiresAtLabel: formatDate(s.expires_at, { timeStyle: 'short' }),
          }))}
          labels={{
            banner: t('impersonation.banner'),
            reason: t('impersonation.reason', { reason: '{reason}' }),
          }}
          // Prekid sme administrator klijenta. Ostali vide traku, ali bez dugmeta —
          // obaveštenje ide svima, kontrola samo onome ko za nju odgovara.
          {...(org.permissions.includes('manage_users')
            ? {
                renderAction: (sessionId: string) => (
                  <EndAccessButton
                    sessionId={sessionId}
                    organizationId={org.organizationId}
                    label={t('impersonation.end')}
                  />
                ),
              }
            : {})}
        />
      ) : null}

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.org}>
            {branding.ok && branding.value?.logo_url ? (
              <BrandLogo src={branding.value.logo_url} className={styles.logo} />
            ) : null}
            <span className={styles.orgName}>
              {(branding.ok && branding.value?.workspace_name) || org.organizationName}
            </span>
            <span className={styles.orgMeta}>{t('app.name')}</span>
            {org.isDemo ? <DemoBadge label={t('common.demoData')} /> : null}
          </div>

          <NavList items={nav} soonLabel={t('state.unavailable')} />

          <div className={styles.footer}>
            <span className={styles.user}>{user.fullName ?? user.email}</span>
            <div className={styles.switches}>
              <LocaleToggle current={locale} label={t('common.language')} />
              <ThemeToggle
                current={theme}
                label={t('theme.label')}
                optionLabels={{
                  light: t('theme.light'),
                  dark: t('theme.dark'),
                  system: t('theme.system'),
                }}
              />
            </div>
          </div>
        </aside>

        <main className={styles.main}>{children}</main>

        {/*
          Traka stoji IZVAN glavnog sadržaja, pa je ima na svakom ekranu radnog
          prostora. Pitanje se rodi dok se gleda nešto drugo, a odlazak na
          zaseban ekran znači da se to mesto izgubi — ko izgubi mesto, ne pita.
        */}
        <AskDock
          orgSlug={org.organizationSlug}
          suggestions={dockSuggestions}
          labels={{
            open: t('ask.dock.open'),
            close: t('ask.dock.close'),
            title: t('ask.dock.title'),
            placeholder: t('ask.home.placeholder'),
            thinking: t('ask.dock.thinking'),
            full: t('ask.dock.full'),
            saveNote: t('ask.saveNote'),
            savedNote: t('ask.savedNote'),
            none: t('ask.home.none'),
            messages: messagesFor(locale, ['error.', 'ask.error.', 'notes.error.']),
          }}
        />
      </div>
    </div>
  )
}
