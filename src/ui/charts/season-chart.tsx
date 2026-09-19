import type { SeasonalComparison } from '@/core/retail/analytics'
import styles from './season-chart.module.css'

/**
 * Mesečni tok, sa istim mesecom prošle godine iza svakog stupca.
 *
 * Ovo NIJE grafikon sa dve ose. Obe vrednosti su promet u istoj valuti, pa dele
 * istu razmeru — prošlogodišnji mesec stoji kao tiha traka iza tekućeg, ne kao
 * druga serija sa svojom osom.
 *
 * Zašto baš tako: trgovina okovom ide za građevinom, a građevina ima godišnji
 * ritam. Februar je uvek slabiji od januara i to ne znači ništa. Februar slabiji
 * od PROŠLOG februara znači sve — i to se ovde vidi bez računanja.
 */

const HEIGHT = 140
const BAR_GAP = 3

export interface SeasonLabels {
  readonly title: string
  readonly thisYear: string
  readonly lastYear: string
  readonly tableLabel: string
  readonly monthHeader: string
  readonly valueHeader: string
}

export function SeasonChart({
  points,
  labels,
  money,
  monthLabel,
  currency,
}: {
  points: readonly SeasonalComparison[]
  labels: SeasonLabels
  money: (value: string, currency: string) => string
  monthLabel: (month: string) => string
  currency: string
}) {
  /*
   * Prikazuje se poslednjih trinaest meseci, a računa se iz svih.
   *
   * Istorija nosi dvadeset pet meseci baš zato da i najstariji prikazani mesec
   * ima svoj par prošle godine. Prikazati svih dvadeset pet značilo bi stupce
   * uže od razmaka među njima.
   */
  const shown = points.slice(-13)

  const max = shown.reduce(
    (m, p) => Math.max(m, Number(p.total), Number(p.sameMonthLastYear ?? 0)),
    0,
  )

  if (shown.length === 0 || max <= 0) return null

  const barWidth = 100 / shown.length

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.chart}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={labels.title}
      >
        {shown.map((point, index) => {
          const x = index * barWidth
          const now = (Number(point.total) / max) * HEIGHT
          const before = ((Number(point.sameMonthLastYear ?? 0) / max) * HEIGHT) | 0

          return (
            <g key={point.month}>
              {/* Prošla godina: tiha traka iza, puna širina ćelije. */}
              {point.sameMonthLastYear ? (
                <rect
                  className={styles.last}
                  x={x + BAR_GAP / 2}
                  y={HEIGHT - before}
                  width={barWidth - BAR_GAP}
                  height={before}
                />
              ) : null}

              <rect
                className={styles.now}
                x={x + BAR_GAP}
                y={HEIGHT - now}
                width={Math.max(0.5, barWidth - BAR_GAP * 2)}
                height={now}
              >
                <title>
                  {monthLabel(point.month)}: {money(point.total, currency)}
                  {point.yearOverYear !== undefined
                    ? ` (${point.yearOverYear > 0 ? '+' : ''}${point.yearOverYear}%)`
                    : ''}
                </title>
              </rect>
            </g>
          )
        })}
      </svg>

      {/*
        Ispisuje se svaki drugi mesec.
        Trinaest natpisa na ovoj širini se slepi u sivu traku; svaki drugi drži
        ritam godine čitljivim, a poslednji je uvek tu jer se on i gleda.
      */}
      <div className={styles.axis}>
        {shown.map((point, index) => (
          <span key={point.month} className={styles.tick}>
            {index % 2 === shown.length % 2 ? monthLabel(point.month) : ''}
          </span>
        ))}
      </div>

      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.now}`} />
          {labels.thisYear}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.last}`} />
          {labels.lastYear}
        </span>
      </figcaption>

      {/*
        Tabela je OBAVEZNA, ne dodatak: stupci bez brojeva su neupotrebljivi
        čitaču ekrana, a i čoveku koji hoće tačan iznos a ne oblik.
      */}
      <details className={styles.table}>
        <summary className={styles.tableSummary}>{labels.tableLabel}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{labels.monthHeader}</th>
              <th scope="col">{labels.valueHeader}</th>
              <th scope="col">{labels.lastYear}</th>
            </tr>
          </thead>
          <tbody>
            {[...shown].reverse().map((point) => (
              <tr key={point.month}>
                <td>{monthLabel(point.month)}</td>
                <td className={styles.numeric}>{money(point.total, currency)}</td>
                <td className={styles.numeric}>
                  {point.sameMonthLastYear ? money(point.sameMonthLastYear, currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
