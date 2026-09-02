import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import {
  listActiveAccessSessions,
  resolveOrgContext,
} from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
import { deriveBrandPalette } from '@/core/branding/contrast'
import { getBranding } from '@/core/branding/repository'
import { AccessBanner } from '@/ui/patterns/AccessBanner'
import { DemoBadge } from '@/ui/patterns/StatusBadge'
import { NavList, type NavItem } from '@/ui/patterns/NavList'
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

  const [sessions, branding] = await Promise.all([
    listActiveAccessSessions(db, org.organizationId),
    getBranding(db, org.organizationId),
  ])

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
  const nav: NavItem[] = [
    { href: `/w/${org.organizationSlug}` as Route, label: t('nav.home') },
    { label: t('nav.ask') },
    { label: t('nav.reports') },
    { label: t('nav.alerts') },
    { label: t('nav.approvals') },
    { label: t('nav.settings') },
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
            <span className={styles.orgName}>
              {(branding.ok && branding.value?.workspace_name) || org.organizationName}
            </span>
            <span className={styles.orgMeta}>{t('app.name')}</span>
            {org.isDemo ? <DemoBadge label={t('common.demoData')} /> : null}
          </div>

          <NavList items={nav} soonLabel={t('state.unavailable')} />

          <div className={styles.footer}>
            <span className={styles.user}>{user.fullName ?? user.email}</span>
            <LocaleToggle current={locale} label={t('common.language')} />
          </div>
        </aside>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
