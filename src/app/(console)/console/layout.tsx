import { notFound } from 'next/navigation'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
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

  const openSessions = await listMyOpenAccessSessions(db)
  const now = Date.now()

  // Ruta postoji samo za ono što je stvarno implementirano; ostalo se
  // prikazuje kao neaktivno i označeno. Ekrani dolaze u fazama 2 i 3.
  const nav: NavItem[] = [
    { href: '/console', label: t('console.overview') },
    { href: '/console/clients', label: t('console.clients') },
    { label: t('console.integrations') },
    { label: t('console.health') },
    { label: t('console.audit') },
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
          labels={{
            openIn: (name, until) => t('access.openIn', { name, until }),
            remaining: (minutes) => t('access.remaining', { minutes }),
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
            <LocaleToggle current={locale} label={t('common.language')} />
          </div>
        </aside>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
