import { Icon } from '@/ui/primitives/Icon'
import styles from './links-card.module.css'

export interface LinkRow {
  readonly key: string
  readonly url: string
  readonly label: string
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
 * Samo nazivi, bez objašnjenja uz svaki. Da su linkovi spoljni podrazumeva se
 * iz ikonice i iz toga što se otvaraju u novoj kartici; rečenica koja to kaže
 * naglas je red sivog teksta koji niko ne pročita dvaput.
 */
export function LinksCard({
  title,
  needsAccountLabel,
  groups,
}: {
  title: string
  needsAccountLabel: string
  groups: readonly LinkGroupRow[]
}) {
  if (groups.length === 0) return null

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>
        <Icon name="external" size={16} />
        {title}
      </h2>

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
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
