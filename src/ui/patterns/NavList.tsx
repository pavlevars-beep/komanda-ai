import Link from 'next/link'
import type { Route } from 'next'
import styles from './NavList.module.css'

export interface NavItem {
  readonly label: string
  /** Izostavljeno kada sposobnost još nije implementirana. */
  readonly href?: Route
}

/**
 * Navigacija koja ne laže.
 *
 * Stavka bez rute se ne prikazuje kao link nego kao označena, neaktivna
 * stavka. Alternativa — link koji vodi na 404 ili na praznu stranicu —
 * ostavlja utisak da je proizvod pokvaren, a ne nedovršen.
 */
export function NavList({ items, soonLabel }: { items: readonly NavItem[]; soonLabel: string }) {
  return (
    <nav className={styles.nav}>
      {items.map((item) =>
        item.href ? (
          <Link key={item.label} href={item.href} className={styles.link}>
            {item.label}
          </Link>
        ) : (
          <span key={item.label} className={styles.pending} aria-disabled="true">
            {item.label}
            <span className={styles.soon}>{soonLabel}</span>
          </span>
        ),
      )}
    </nav>
  )
}
