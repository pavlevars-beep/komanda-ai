import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
import { ThemeToggle } from '@/app/theme-toggle'
import { readThemeCookie } from '@/ui/theme/theme'
import { NavList, type NavItem } from '@/ui/patterns/NavList'
import { listMyOpenAccessSessions } from '@/core/organizations/console-repository'
import { ConsoleAccessBanner } from './access-banner'
import styles from './console.module.css'

/**
 * Guard Delta Pro konzole.
 *
 * Nalog koji nije aktivno osoblje dobija 404, ne 403 — postojanje interne
 * konzole nije informacija koju delimo sa klijentskim korisnicima.
 *
 * Konzola NIKAD ne nosi brend klijenta. Identitet Delta Pro je konstantan da
 * se, dok se radi na više klijenata odjednom, ne bi pomešao kontekst.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const db = await userDb()
  const user = await currentUser(db)

  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t, formatDate } = createTranslator(locale)

  const [openSessions, cookieStore] = await Promise.all([
    listMyOpenAccessSessions(db),
    cookies(),
  ])
  const theme = readThemeCookie(cookieStore.get('theme')?.value)
  const now = Date.now()

  // Ruta postoji samo za ono što je stvarno implementirano; ostalo se
  // prikazuje kao neaktivno i označeno. Ekrani dolaze u fazama 2 i 3.
  const nav: NavItem[] = [
    { href: '/console', label: t('console.overview'), icon: 'chart' },
    { href: '/console/clients', label: t('console.clients'), icon: 'building' },
    { label: t('console.integrations'), icon: 'box' },
    { label: t('console.health'), icon: 'check' },
    { label: t('console.audit'), icon: 'note' },
  ]

  return (
    <div className={styles.page}>
      {openSessions.ok ? (
        <ConsoleAccessBanner
          sessions={openSessions.value.map((s) => ({
            sessionId: s.session_id,
            organizationName: s.organization_name,
            untilLabel: formatDate(s.expires_at, { timeStyle: 'short' }),
            minutesLeft: Math.max(
              0,
              Math.round((new Date(s.expires_at).getTime() - now) / 60000),
            ),
          }))}
          // Šabloni, ne funkcije — funkcija ne može da pređe granicu ka klijentu.
          labels={{
            openIn: t('access.openIn'),
            remaining: t('access.remaining'),
            end: t('access.end'),
          }}
        />
      ) : null}

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Delta Pro</span>
            <span className={styles.brandMeta}>Konzola</span>
          </div>

          <NavList items={nav} soonLabel={t('state.unavailable')} />

          <div className={styles.footer}>
            <span className={styles.user}>{user.fullName ?? user.email}</span>
            <span className={styles.role}>{user.staffRole}</span>
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
      </div>
    </div>
  )
}
