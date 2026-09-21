import { Icon } from './Icon'
import styles from './ChangeChip.module.css'

/**
 * Oznaka promene — strelica, procenat i odgovor na „u odnosu na šta".
 *
 * Bez te poslednje stvari oznaka je zagonetka. „↘ 4%" je manje od čega —
 * prošle nedelje, prošlog meseca, plana? Procenat bez osnove ne znači ništa,
 * a izgleda kao da znači, što je gore nego da ga nema.
 *
 * Zato osnova postoji UVEK, samo se različito isporučuje:
 *
 *   - okom: ispisana pored brojke (`expose`) ili na prelaz mišem, dodir i
 *     tastaturu — zato je nosač dugme, a ne raspon teksta: dugme dobija
 *     žižu i klikom i dodirom, bez ijedne linije skripte,
 *   - čitaču ekrana: uvek, kroz `aria-label`, pa slepom korisniku ništa ne
 *     zavisi od toga da li je uspeo da „pređe mišem".
 *
 * Boja ovde nikad ne stoji sama: uz nju ide strelica, pa se smer vidi i u
 * crno-beloj štampi i daltonisti.
 */
export function ChangeChip({
  direction,
  value,
  hint,
  ariaLabel,
  expose = false,
}: {
  direction: 'up' | 'down'
  /** Već oblikovan procenat; oblikovanje jezika ostaje na pozivaocu. */
  value: string
  /** Osnova poređenja, kao nastavak rečenice: „u odnosu na prekjuče". */
  hint: string
  /** Cela rečenica za čitač ekrana, sa smerom i osnovom. */
  ariaLabel: string
  /** Ispiši osnovu odmah, umesto na prelaz mišem. Za istaknuti broj. */
  expose?: boolean
}) {
  const tone = direction === 'up' ? styles.up : styles.down
  const arrow = <Icon name={direction === 'up' ? 'trendUp' : 'trendDown'} size={14} />

  if (expose) {
    return (
      <span className={styles.exposed}>
        <span className={`${styles.chip} ${tone}`}>
          {arrow}
          {value}
        </span>
        <span className={styles.note}>{hint}</span>
      </span>
    )
  }

  return (
    <button type="button" className={`${styles.chip} ${styles.button} ${tone}`} aria-label={ariaLabel}>
      {arrow}
      {value}
      {/* Za čitač ekrana je osnova već u `aria-label`; ovde bi bila drugi put. */}
      <span className={styles.hint} aria-hidden="true">
        {hint}
      </span>
    </button>
  )
}
