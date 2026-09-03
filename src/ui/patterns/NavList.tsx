import Link from 'next/link'
import type { Route } from 'next'
import { Icon, type IconName } from '../primitives/Icon'
import styles from './NavList.module.css'

export interface NavItem {
  readonly label: string
  /** Izostavljeno kada sposobnost još nije implementirana. */
  readonly href?: Route
  readonly icon?: IconName
  /** Broj nepročitanih stavki; prikazuje se samo kada je veći od nule. */
  readonly badge?: number
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
            <span className={styles.linkBody}>
              {item.icon ? <Icon name={item.icon} size={17} /> : null}
              {item.label}
            </span>
            {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
          </Link>
        ) : (
          <span key={item.label} className={styles.pending} aria-disabled="true">
            <span className={styles.linkBody}>
              {item.icon ? <Icon name={item.icon} size={17} /> : null}
              {item.label}
            </span>
            <span className={styles.soon}>{soonLabel}</span>
          </span>
        ),
      )}
    </nav>
  )
}
