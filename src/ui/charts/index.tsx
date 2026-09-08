import { barScale, lineGeometry, tickIndices, type Point } from './geometry'
import styles from './charts.module.css'

/**
 * Grafikoni kao serverske komponente, u čistom SVG-u i CSS-u.
 *
 * Bez biblioteke — ne zbog štednje nego zbog toga što bi svaka od njih donela
 * sopstvenu paletu, sopstvene tipografske razmere i sopstveni način da se
 * ponaša u tamnoj temi. Četiri grafikona iz dva izvora izgledaju neuredno pre
 * nego što se primeti zašto.
 *
 * Svaki grafikon crta JEDAN ton. Kategorijalna paleta ovde nema posla: nigde
 * se ne porede različiti nizovi, nego se čita veličina — a za veličinu je
 * jedan ton, svetlije ka tamnijem, i sigurniji i tačniji.
 *
 * Uz svaki grafikon stoji i tabelarni prikaz. Grafikon je pogodnost; tabela je
 * ono što čitač ekrana pročita i ono što se proverava rukom.
 */

const STEP_CLASS = [styles.barStep1!, styles.barStep2!, styles.barStep3!, styles.barStep4!]

function DataTableView({
  label,
  headers,
  rows,
}: {
  label: string
  headers: readonly [string, string]
  rows: readonly (readonly [string, string])[]
}) {
  return (
    <details>
      <summary className={styles.tableToggle}>{label}</summary>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{headers[0]}</th>
            <th scope="col">{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/**
 * Kretanje kroz vreme — linija sa blagom ispunom.
 *
 * Osnova je nula, uvek. Skraćena osa uvećava razlike i od pomeraja od dva
 * procenta pravi provaliju.
 */
export function TrendChart({
  points,
  caption,
  format,
  tableLabel,
  headers,
  height = 120,
}: {
  points: readonly Point[]
  caption?: string
  format: (value: number) => string
  tableLabel: string
  headers: readonly [string, string]
  height?: number
}) {
  const width = 600
  const geo = lineGeometry(
    points.map((p) => p.value),
    width,
    height,
  )
  const last = geo.points[geo.points.length - 1]
  const ticks = tickIndices(points.length, 6)

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={caption}
        style={{ height }}
      >
        {geo.areaPath ? <path className={styles.area} d={geo.areaPath} /> : null}
        <path className={styles.line} d={geo.path} vectorEffect="non-scaling-stroke" />
        {last ? <circle className={styles.endDot} cx={last.x} cy={last.y} r={4} /> : null}
      </svg>

      {/* Oznake ispod ose, prorešene da se natpisi ne preklope. */}
      <div className={`${styles.axis} ${styles.axisLine}`}>
        {ticks.map((i) => (
          <span
            key={i}
            className={`${styles.tick} ${i === 0 ? styles.tickFirst : ''} ${
              i === points.length - 1 ? styles.tickLast : ''
            }`.trim()}
            // Tačka linije stoji na udelu i/(n-1) širine; oznaka ide tačno ispod.
            style={{ left: `${points.length > 1 ? (i / (points.length - 1)) * 100 : 50}%` }}
          >
            {points[i]?.label}
          </span>
        ))}
      </div>

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <DataTableView
        label={tableLabel}
        headers={headers}
        rows={points.map((p) => [p.label, format(p.value)] as const)}
      />
    </figure>
  )
}

/** Vrednosti po danima — stubići, osnova na nuli. */
export function ColumnChart({
  points,
  caption,
  format,
  tableLabel,
  headers,
  height = 96,
}: {
  points: readonly Point[]
  caption?: string
  format: (value: number) => string
  tableLabel: string
  headers: readonly [string, string]
  height?: number
}) {
  const scale = barScale(points.map((p) => p.value))
  const ticks = tickIndices(points.length, 5)

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      <div className={styles.columns} style={{ height }} role="img" aria-label={caption}>
        {points.map((p) => (
          <div key={p.label} className={styles.column}>
            {/* Rodni naslov daje opis pri prelasku mišem, bez ijedne linije skripte. */}
            <div
              className={styles.columnFill}
              style={{ height: `${scale.height(p.value)}%` }}
              title={`${p.label}: ${format(p.value)}`}
            />
          </div>
        ))}
      </div>

      <div
        className={styles.axis}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, 1fr)` }}
      >
        {ticks.map((i) => (
          <span
            key={i}
            className={`${styles.tick} ${i === 0 ? styles.tickFirst : ''} ${
              i === points.length - 1 ? styles.tickLast : ''
            }`.trim()}
            style={{ gridColumn: i + 1 }}
          >
            {points[i]?.label}
          </span>
        ))}
      </div>

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <DataTableView
        label={tableLabel}
        headers={headers}
        rows={points.map((p) => [p.label, format(p.value)] as const)}
      />
    </figure>
  )
}

export interface RankedBar {
  readonly label: string
  readonly value: number
  readonly display: string
  /** Korak rampe, 0 je najsvetliji. Van opsega se privodi krajevima. */
  readonly step?: number
}

/**
 * Poređenje veličina — vodoravne trake.
 *
 * Vodoravno zato što nazivi artikala i kupaca ne staju ispod uspravnog
 * stubića; okrenut grafikon rešava to bez zakošenih natpisa, koji se čitaju
 * sporo i loše se štampaju.
 */
export function RankedBars({
  bars,
  caption,
  tableLabel,
  headers,
}: {
  bars: readonly RankedBar[]
  caption?: string
  tableLabel: string
  headers: readonly [string, string]
}) {
  const scale = barScale(bars.map((b) => b.value))

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      <div className={styles.bars} role="img" aria-label={caption}>
        {bars.map((bar) => (
          <div key={bar.label} className={styles.bar}>
            <span className={styles.barLabel}>{bar.label}</span>
            <span className={styles.barValue}>{bar.display}</span>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill} ${
                  STEP_CLASS[Math.max(0, Math.min(STEP_CLASS.length - 1, bar.step ?? 2))]
                }`}
                style={{ width: `${scale.height(bar.value)}%` }}
                title={`${bar.label}: ${bar.display}`}
              />
            </div>
          </div>
        ))}
      </div>

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <DataTableView
        label={tableLabel}
        headers={headers}
        rows={bars.map((b) => [b.label, b.display] as const)}
      />
    </figure>
  )
}

/** Mala linija uz brojku — bez ose, bez oznaka, samo oblik kretanja. */
export function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const geo = lineGeometry(values, 100, 24, 2)
  const last = geo.points[geo.points.length - 1]

  return (
    <svg
      className={`${styles.svg} ${styles.viz}`}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ height: 24 }}
    >
      <path className={styles.line} d={geo.path} vectorEffect="non-scaling-stroke" />
      {last ? <circle className={styles.endDot} cx={last.x} cy={last.y} r={3} /> : null}
    </svg>
  )
}
