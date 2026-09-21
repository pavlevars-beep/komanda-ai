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
 * Boja se bira prema POSLU koji obavlja, ne prema ukusu. Veličina i udeo
 * dobijaju rampu jednog tona, svetlije ka tamnijem. Stanje dobija statusnu
 * boju. Kategorijalne boje se troše samo tamo gde se zaista porede dva niza —
 * a takav je ovde jedan jedini grafikon.
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

/**
 * Vrednosti po danima — stubići, osnova na nuli.
 *
 * Uz `emphasis` se jedan stubić izdvaja bojom, a ostali se utišaju. To nije
 * ukras: u nizu od trideset jednakih stubića se najjači dan traži okom, a
 * istaknut se vidi odmah. Istaknut sme da bude samo stubić koji je pozivalac
 * IZRAČUNAO — isticanje po oku bi tvrdilo nešto što podatak ne kaže.
 */
export function ColumnChart({
  points,
  caption,
  format,
  tableLabel,
  headers,
  height = 96,
  emphasis,
}: {
  points: readonly Point[]
  caption?: string
  format: (value: number) => string
  tableLabel: string
  headers: readonly [string, string]
  height?: number
  /** Redni broj stubića koji se ističe; ostali se utišaju. */
  emphasis?: number | undefined
}) {
  const scale = barScale(points.map((p) => p.value))
  const ticks = tickIndices(points.length, 5)
  const dimmed = emphasis !== undefined && emphasis >= 0 && emphasis < points.length

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      <div className={styles.columns} style={{ height }} role="img" aria-label={caption}>
        {points.map((p, index) => (
          <div key={p.label} className={styles.column}>
            {/* Rodni naslov daje opis pri prelasku mišem, bez ijedne linije skripte. */}
            <div
              className={`${styles.columnFill} ${
                dimmed ? (index === emphasis ? styles.columnLead : styles.columnQuiet) : ''
              }`.trim()}
              style={{ height: `${scale.height(p.value)}%` }}
              title={`${p.label}: ${format(p.value)}`}
            />
          </div>
        ))}
      </div>

      {/*
        `minmax(0, 1fr)`, ne golo `1fr`.
        Podrazumevani najmanji trag kolone je njen sadržaj, pa je kolona sa
        natpisom „30. 9." tražila punu širinu tog natpisa. Na telefonu je zbir
        tih najmanjih širina premašivao okvir i cela strana je dobijala
        vodoravno pomeranje — mereno 26px prekoračenja na 400px ekrana.
      */}
      <div
        className={styles.axis}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}
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

/**
 * Mala linija uz brojku — bez ose, bez oznaka, samo oblik kretanja.
 *
 * Na kartici stoji niska i bez ispune. Na istaknutoj traci dobija visinu i
 * ispunu, jer tamo nosi ceo prikaz umesto da ga prati.
 */
export function Sparkline({
  values,
  label,
  height = 24,
  area = false,
}: {
  values: readonly number[]
  label: string
  height?: number
  area?: boolean
}) {
  const geo = lineGeometry(values, 100, height, 2)
  const last = geo.points[geo.points.length - 1]

  return (
    <svg
      className={`${styles.svg} ${styles.viz}`}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      style={{ height }}
    >
      {area && geo.areaPath ? <path className={styles.area} d={geo.areaPath} /> : null}
      <path className={styles.line} d={geo.path} vectorEffect="non-scaling-stroke" />
      {last ? <circle className={styles.endDot} cx={last.x} cy={last.y} r={3} /> : null}
    </svg>
  )
}

export interface ShareSegment {
  readonly label: string
  readonly value: number
  readonly display: string
  /** Korak rampe, 0 je najsvetliji. Van opsega se privodi krajevima. */
  readonly step?: number
}

/**
 * Udeo u celini — jedna traka podeljena na odsečke.
 *
 * Postoji zato što deo pitanja nije „koliko" nego „koliki deo". Pet zasebnih
 * traka prikazuje pet iznosa; jedna podeljena traka prikazuje RASPODELU, i iz
 * nje se odnos čita bez sabiranja.
 *
 * Zbir odsečaka mora da bude celina koju traka predstavlja. Kada to nije tačno
 * — recimo kada rashod premaši prihod — pozivalac NE sme da nacrta ovu traku;
 * odsečci bi tada prikazali udele u zbiru koji nigde ne postoji.
 */
export function ShareBar({
  segments,
  caption,
  tableLabel,
  headers,
  shareLabel,
}: {
  segments: readonly ShareSegment[]
  caption?: string
  tableLabel: string
  headers: readonly [string, string]
  /** Ispisuje udeo kao procenat; oblikovanje ostaje na pozivaocu. */
  shareLabel: (share: number) => string
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  // Bez celine nema udela. Prazna traka je iskrenija od trake podeljene na nule.
  const share = (value: number) => (total > 0 ? (Math.max(0, value) / total) * 100 : 0)

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      <div className={styles.shareTrack} role="img" aria-label={caption}>
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`${styles.shareSegment} ${
              STEP_CLASS[Math.max(0, Math.min(STEP_CLASS.length - 1, segment.step ?? 2))]
            }`}
            style={{ width: `${share(segment.value)}%` }}
            title={`${segment.label}: ${segment.display}`}
          />
        ))}
      </div>

      {/*
        Odsečci se imenuju ISPOD trake, ne u njoj.
        Natpis u odsečku staje samo dok je odsečak dovoljno širok — a najuži
        odsečak je obično onaj zbog kojeg se traka i gleda.
      */}
      <ul className={styles.shareLegend}>
        {segments.map((segment) => (
          <li key={segment.label} className={styles.shareItem}>
            <span
              className={`${styles.shareSwatch} ${
                STEP_CLASS[Math.max(0, Math.min(STEP_CLASS.length - 1, segment.step ?? 2))]
              }`}
              aria-hidden="true"
            />
            <span className={styles.shareName}>{segment.label}</span>
            <span className={styles.shareValue}>{segment.display}</span>
            <span className={styles.shareShare}>{shareLabel(share(segment.value))}</span>
          </li>
        ))}
      </ul>

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <DataTableView
        label={tableLabel}
        headers={headers}
        rows={segments.map((s) => [s.label, s.display] as const)}
      />
    </figure>
  )
}

export interface DumbbellRow {
  readonly label: string
  /** Prva vrednost — ono što jeste. */
  readonly from: number
  readonly fromDisplay: string
  /** Druga vrednost — ono sa čim se poredi. */
  readonly to: number
  readonly toDisplay: string
  /** Istakni red kao rizik: veza dobija boju upozorenja. */
  readonly alert?: boolean
}

/**
 * Dve vrednosti po stavci — tačke povezane linijom.
 *
 * Traka prikazuje jednu vrednost i ćuti o pragu uz koji ta vrednost ima
 * smisla. „Pokrivenost 9 dana" nije ni dobra ni loša dok se ne zna da rok
 * isporuke iznosi 21 dan — a tek tada je to nestašica koja se sprema.
 *
 * Zato dve tačke i razmak između njih: razmak JE nalaz. Kada je prva levo od
 * druge, stavka će se potrošiti pre nego što nova roba stigne, pa veza dobija
 * boju upozorenja — boja, međutim, nikad ne stoji sama: uz nju idu oba broja.
 */
export function Dumbbell({
  rows,
  legend,
  caption,
  tableLabel,
  headers,
}: {
  rows: readonly DumbbellRow[]
  legend: { readonly from: string; readonly to: string }
  caption?: string
  tableLabel: string
  headers: readonly [string, string]
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.from, r.to]))
  const at = (value: number) => Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <figure className={`${styles.figure} ${styles.viz}`}>
      {/* Legenda stoji IZNAD, jer bez nje dve tačke nemaju ime. */}
      <div className={styles.pairLegend}>
        <span className={styles.pairKey}>
          <span className={`${styles.pairDot} ${styles.pairFrom}`} aria-hidden="true" />
          {legend.from}
        </span>
        <span className={styles.pairKey}>
          <span className={`${styles.pairDot} ${styles.pairTo}`} aria-hidden="true" />
          {legend.to}
        </span>
      </div>

      <div className={styles.pairs} role="img" aria-label={caption}>
        {rows.map((row) => {
          const a = at(Math.min(row.from, row.to))
          const b = at(Math.max(row.from, row.to))
          return (
            <div key={row.label} className={styles.pairRow}>
              <span className={styles.barLabel}>{row.label}</span>
              <span className={styles.pairValues}>
                {row.fromDisplay} <span className={styles.pairArrow}>→</span> {row.toDisplay}
              </span>
              <div className={styles.pairTrack}>
                <span
                  className={`${styles.pairLink} ${row.alert ? styles.pairAlert : ''}`.trim()}
                  style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%` }}
                />
                <span
                  className={`${styles.pairDot} ${styles.pairTo} ${styles.pairPlaced}`}
                  style={{ left: `${at(row.to)}%` }}
                  title={`${legend.to}: ${row.toDisplay}`}
                />
                <span
                  className={`${styles.pairDot} ${styles.pairFrom} ${styles.pairPlaced}`}
                  style={{ left: `${at(row.from)}%` }}
                  title={`${legend.from}: ${row.fromDisplay}`}
                />
              </div>
            </div>
          )
        })}
      </div>

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <DataTableView
        label={tableLabel}
        headers={headers}
        rows={rows.map((r) => [r.label, `${r.fromDisplay} / ${r.toDisplay}`] as const)}
      />
    </figure>
  )
}
