import { Icon } from '@/ui/primitives/Icon'
import styles from './context-links.module.css'

export interface ContextLinkRow {
  readonly key: string
  readonly url: string
  readonly label: string
  readonly hint: string
}

/**
 * Javni servisi uz podatak zbog kojeg se otvaraju.
 *
 * Isti link na spisku i uz spisak dužnika nije isti link. Kada rukovodilac
 * gleda ko mu duguje, provera da li je tom kupcu račun u blokadi je SLEDEĆI
 * potez — a ne nešto što će potražiti kasnije, kada se seti da postoji.
 *
 * Objašnjenje ide uz svaki: bez njega je ovo spisak skraćenica, sa njim je
 * savet.
 */
export function ContextLinks({
  title,
  links,
}: {
  title: string
  links: readonly ContextLinkRow[]
}) {
  if (links.length === 0) return null

  return (
    <section className={styles.box}>
      <h3 className={styles.title}>
        <Icon name="external" size={14} />
        {title}
      </h3>
      <ul className={styles.list}>
        {links.map((link) => (
          <li key={link.key} className={styles.item}>
            {/* `noreferrer`: adresa radnog prostora nosi naziv klijenta. */}
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.link}
            >
              {link.label}
            </a>
            <span className={styles.hint}>{link.hint}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
