import { notFound } from 'next/navigation'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { resolveLocale } from '@/i18n/config'
import { createTranslator } from '@/i18n/translator'
import { NavList, type NavItem } from '@/ui/patterns/NavList'
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

  const { t } = createTranslator(resolveLocale({ userLocale: user.locale }))

  // Ruta postoji samo za ono što je stvarno implementirano; ostalo se
  // prikazuje kao neaktivno i označeno. Ekrani dolaze u fazama 2 i 3.
  const nav: NavItem[] = [
    { href: '/console', label: t('console.overview') },
    { label: t('console.clients') },
    { label: t('console.integrations') },
    { label: t('console.health') },
    { label: t('console.audit') },
  ]

  return (
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
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
