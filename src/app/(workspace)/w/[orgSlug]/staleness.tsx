import { Icon } from '@/ui/primitives/Icon'
import styles from './staleness.module.css'

/**
 * Traka „podatak nije stigao".
 *
 * Stoji IZNAD table, ne pored nje i ne u podnožju. Brojevi ispod nje su tačni
 * onako kako su poslednji put pročitani — ali se odnose na raniji dan, i to je
 * jedino što rukovodilac mora da zna pre nego što ih pogleda.
 *
 * Prikazuje se samo kada nešto ne stiže. Traka koja svakog dana javlja da je
 * sve u redu nauči korisnika da je preskače, pa je ne pročita ni onog dana kada
 * piše suprotno.
 */
export function StalenessBanner({
  tone,
  title,
  lines,
}: {
  tone: 'warn' | 'critical'
  title: string
  lines: readonly string[]
}) {
  if (lines.length === 0) return null

  return (
    <section
      className={`${styles.banner} ${tone === 'critical' ? styles.critical : styles.warn}`}
      // Zastareo podatak nije hitan prekid rada, ali se mora pročitati čim se
      // pojavi — čitač ekrana ga najavljuje bez prekidanja trenutne rečenice.
      role="status"
      aria-live="polite"
    >
      <Icon name="warning" size={18} className={styles.icon!} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <ul className={styles.list}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
