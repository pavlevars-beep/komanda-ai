import { Icon } from '@/ui/primitives/Icon'
import styles from './links-card.module.css'

export interface LinkRow {
  readonly key: string
  readonly url: string
  readonly label: string
  readonly hint: string
  readonly needsAccount: boolean
}

export interface LinkGroupRow {
  readonly category: string
  readonly label: string
  readonly links: readonly LinkRow[]
}

/**
 * Javni servisi.
 *
 * LINKOVI, ne podaci — i to piše. Sistem ne tvrdi ništa o sadržaju sa druge
 * strane, samo vodi do njega. Prikazivanje tuđeg podatka kao svog tražilo bi da
 * za njega odgovaramo svežinom i poreklom, a to je obaveza koju link ne nosi.
 */
export function LinksCard({
  title,
  lede,
  needsAccountLabel,
  groups,
}: {
  title: string
  lede: string
  needsAccountLabel: string
  groups: readonly LinkGroupRow[]
}) {
  if (groups.length === 0) return null

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Icon name="external" size={16} />
          {title}
        </h2>
        <p className={styles.lede}>{lede}</p>
      </div>

      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.category} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.label}</h3>
            <ul className={styles.list}>
              {group.links.map((link) => (
                <li key={link.key} className={styles.item}>
                  {/*
                    `noreferrer` nije formalnost: bez njega zaglavlje govori
                    državnom sajtu iz kog radnog prostora korisnik dolazi, a
                    adresa radnog prostora nosi naziv klijenta.
                  */}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={styles.link}
                  >
                    {link.label}
                    {link.needsAccount ? (
                      <span className={styles.badge}>{needsAccountLabel}</span>
                    ) : null}
                  </a>
                  <span className={styles.hint}>{link.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
