import Link from 'next/link'
import type { Route } from 'next'
import type { Block } from '@/core/brief/loader'
import type { MessageKey, Translator } from '@/i18n/translator'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import styles from './detail.module.css'

/**
 * Okvir stranice u dubinu.
 *
 * Stavka u „zahteva pažnju" mora da vodi NEGDE. Strelica koja otvara 404
 * izgleda kao kvar proizvoda, a ne kao nedovršenost — što je gore od izostanka
 * strelice.
 *
 * Sve tri stranice u dubinu dele isti okvir: povratak na brif, naslov, sažetak
 * u brojevima, tabela, i podnožje sa poreklom. Zajednički okvir postoji da se
 * tri ekrana ne bi razišla u sitnicama koje korisnik primeti a ne ume da
 * imenuje.
 */
export function DetailShell({
  orgSlug,
  icon,
  title,
  lede,
  backLabel,
  children,
}: {
  orgSlug: string
  icon: IconName
  title: string
  lede?: string
  backLabel: string
  children: React.ReactNode
}) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/w/${orgSlug}` as Route} className={styles.crumb}>
          ← {backLabel}
        </Link>
        <h1 className={styles.title}>
          <Icon name={icon} size={22} />
          {title}
        </h1>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </header>
      {children}
    </div>
  )
}

export interface Stat {
  readonly label: string
  readonly value: string
  readonly tone?: 'warn' | 'critical' | undefined
}

export function Stats({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className={styles.summary}>
      {stats.map((s) => (
        <div key={s.label} className={styles.stat}>
          <span className={styles.statLabel}>{s.label}</span>
          <span
            className={`${styles.statValue} ${
              s.tone === 'critical' ? styles.statCritical : s.tone === 'warn' ? styles.statWarn : ''
            }`.trim()}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Poreklo i svežina uz svaki blok — isto pravilo kao na brifu. */
export function Source({
  block,
  t,
  formatDate,
}: {
  block: Block<unknown>
  t: Translator['t']
  formatDate: Translator['formatDate']
}) {
  const source = block.provenance?.sources[0]
  const asOf = block.provenance?.freshness?.asOf
  if (!source && !asOf) return null

  return (
    <div className={styles.footnote}>
      {source?.label ? <span>{source.label}</span> : null}
      {source?.isDemo ? <span>{t('common.demoData')}</span> : null}
      {asOf ? (
        <span>{t('brief.asOf', { when: formatDate(asOf, { dateStyle: 'medium' }) })}</span>
      ) : null}
      {block.freshness && block.freshness !== 'fresh' ? (
        <span>{t(`freshness.${block.freshness}` as MessageKey)}</span>
      ) : null}
    </div>
  )
}

/** Blok koji se nije učitao prikazuje razlog, nikad praznu tabelu. */
export function Unavailable({ block, t }: { block: Block<unknown>; t: Translator['t'] }) {
  return (
    <div className={styles.pending}>
      <span className={styles.pendingLabel}>{t('brief.unavailable')}</span>
      <span>{t(`brief.unavailable.${block.unavailable}` as MessageKey)}</span>
    </div>
  )
}

/**
 * Napomena o tome odakle dolaze granice.
 *
 * Bez nje kolona „kasni 94 dana" obojena crveno ostaje boja bez objašnjenja.
 * Link vodi na pragove, gde se granica i menja.
 */
export function Thresholds({
  orgSlug,
  text,
  linkLabel,
}: {
  orgSlug: string
  text: string
  linkLabel: string
}) {
  return (
    <p className={styles.thresholds}>
      {text}{' '}
      <Link href={`/w/${orgSlug}/pravila` as Route}>{linkLabel}</Link>
    </p>
  )
}
