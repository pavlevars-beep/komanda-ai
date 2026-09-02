import { LOCALES, LOCALE_LABEL, type Locale } from '@/i18n/config'
import { setLocaleAction } from './locale-actions'
import styles from './locale-toggle.module.css'

/**
 * Prebacivanje srpski / engleski.
 *
 * Serverska komponenta sa običnom formom, bez JavaScript-a — prekidač mora da
 * radi i na stranici za prijavu, pre nego što se bilo šta učita. Trenutni
 * jezik je `aria-current`, ne samo drugačija boja, jer boja sama ne stiže do
 * čitača ekrana.
 */
export function LocaleToggle({ current, label }: { current: Locale; label: string }) {
  return (
    <nav className={styles.toggle} aria-label={label}>
      {LOCALES.map((locale) => (
        <form key={locale} action={setLocaleAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className={`${styles.option} ${locale === current ? styles.active : ''}`}
            aria-current={locale === current ? 'true' : undefined}
            // Jezik oznake je jezik koji nudi, ne jezik stranice.
            lang={locale}
          >
            {LOCALE_LABEL[locale]}
          </button>
        </form>
      ))}
    </nav>
  )
}
