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
import { createTranslator } from '@/i18n/translator'
import { deriveBrandPalette } from '@/core/branding/contrast'
import { AccessBanner } from '@/ui/patterns/AccessBanner'
import { DemoBadge } from '@/ui/patterns/StatusBadge'
import { NavList, type NavItem } from '@/ui/patterns/NavList'
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
  const { t, formatDate } = createTranslator(user.locale ?? org.locale)

  const sessions = await listActiveAccessSessions(db, org.organizationId)

  // Brend boja se ne primenjuje sirova — prolazi kroz korekciju kontrasta.
  // TODO(Faza 2): boja se učitava iz organization_branding; do tada se
  // koristi podrazumevani akcent platforme.
  const palette = deriveBrandPalette({ hex: '#0e6e6b', scheme: 'light' })
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
            banner: (name, until) => t('impersonation.banner', { name, until }),
            reason: t('impersonation.reason', { reason: '{reason}' }),
            end: t('impersonation.end'),
          }}
        />
      ) : null}

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.org}>
            <span className={styles.orgName}>{org.organizationName}</span>
            <span className={styles.orgMeta}>{t('app.name')}</span>
            {org.isDemo ? <DemoBadge label={t('common.demoData')} /> : null}
          </div>

          <NavList items={nav} soonLabel={t('state.unavailable')} />

          <div className={styles.footer}>
            <span className={styles.user}>{user.fullName ?? user.email}</span>
          </div>
        </aside>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
