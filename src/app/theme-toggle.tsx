import { THEMES, type Theme } from '@/ui/theme/theme'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import { setThemeAction } from './theme-actions'
import styles from './locale-toggle.module.css'

const THEME_ICON: Record<Theme, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
}

/**
 * Svetla / tamna / sistemska.
 *
 * Sistemska je zadržana kao ravnopravan izbor, a ne izostavljena zato što je
 * podrazumevana. Korisnik koji je jednom prešao na tamnu inače nema načina da
 * se vrati na „prati sistem" — a to je jedini izbor koji radi ispravno kada
 * uređaj sam menja temu uveče.
 *
 * Obična forma bez JavaScript-a, kao i prekidač jezika. Naziv teme stoji u
 * `aria-label`, jer ikonica sama ne stiže do čitača ekrana.
 */
export function ThemeToggle({
  current,
  label,
  optionLabels,
}: {
  current: Theme
  label: string
  optionLabels: Readonly<Record<Theme, string>>
}) {
  return (
    <nav className={styles.toggle} aria-label={label}>
      {THEMES.map((theme) => (
        <form key={theme} action={setThemeAction}>
          <input type="hidden" name="theme" value={theme} />
          <button
            type="submit"
            className={`${styles.option} ${theme === current ? styles.active : ''}`}
            aria-current={theme === current ? 'true' : undefined}
            aria-label={optionLabels[theme]}
            title={optionLabels[theme]}
          >
            <Icon name={THEME_ICON[theme]} />
          </button>
        </form>
      ))}
    </nav>
  )
}
