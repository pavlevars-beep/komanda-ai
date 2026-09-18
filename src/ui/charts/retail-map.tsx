import {
  BACKGROUND_SHAPES,
  FOREGROUND_SHAPES,
  MAP_HEIGHT,
  MAP_WIDTH,
  projectPoint,
} from './balkans-geo'
import { averageMargin, bubbleRadius, marginStep, type LocationPerformance } from '@/core/retail/network'
import styles from './retail-map.module.css'

/**
 * Karta prodajne mreže.
 *
 * Dve veličine na jednoj slici, i to je ceo smisao ekrana:
 *
 *   VELIČINA kruga = broj računa. Po površini, ne po poluprečniku.
 *   BOJA kruga     = marža u odnosu na prosek mreže. Siva je tačno prosek.
 *
 * Zbog toga se odmah vidi ono što nijedna tabela ne pokaže na prvi pogled:
 * veliki krug koji je crven — mesto kroz koje prođe najviše kupaca a koje
 * najmanje zarađuje po dinaru prometa.
 *
 * Serverska komponenta, bez interaktivnosti. Detalji stoje u karticama pored
 * karte, uvek vidljivi — to je bolje od oblačića koji se pojavi na prelaz miša,
 * jer se dva mesta mogu porediti istovremeno, a na dodirnom ekranu radi.
 */

const PADDING = 26

/** Redosled iscrtavanja: manji krugovi preko većih, da ne nestanu ispod njih. */
function byDrawOrder(a: Placed, b: Placed): number {
  return b.radius - a.radius
}

interface Placed {
  readonly location: LocationPerformance
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly step: number
  /** Y na kojem stoji natpis. Odvojen od `y` kada bi se natpisi preklopili. */
  labelY: number
  /** X natpisa — iza ivice kruga, pa zavisi od poluprečnika. */
  readonly labelX: number
  /** Ime u natpisu. Razlikuje dva objekta u istom gradu. */
  readonly title: string
}

/**
 * Razmiče natpise koji bi se preklopili, a krugove NE pomera.
 *
 * Dva objekta u Beogradu su udaljena nekoliko kilometara; na ovoj razmeri to je
 * desetak piksela. Pomeranje krugova bi bilo laž o mestu, pa se pomera samo
 * natpis i, kada je pomeren, povlači se tanka vodilica do njegovog kruga.
 */
function spreadLabels(placed: Placed[], minGap: number): void {
  const sorted = [...placed].sort((a, b) => a.labelY - b.labelY)

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!

    /*
     * Poredi se sa SVIM prethodnima koji su blizu po X-u, ne samo sa susedom
     * u nizu.
     *
     * Prva verzija je gledala samo prethodni element i zbog toga nije radila.
     * Po visini, Banja Luka pada između dva beogradska objekta; pošto je po
     * X-u daleko, poređenje se preskakalo — i drugi Beograd se nikad nije
     * uporedio sa prvim, pa su se natpisi preklopili. Greška se nije videla u
     * kodu nego tek merenjem položaja u pregledaču.
     */
    for (let j = 0; j < i; j++) {
      const other = sorted[j]!
      // Daleki po X-u se ne takmiče za isti prostor: Subotica i Niš mogu da
      // imaju istu visinu a da ne smetaju jedno drugom.
      if (Math.abs(current.x - other.x) > 150) continue
      if (current.labelY - other.labelY < minGap) {
        current.labelY = other.labelY + minGap
      }
    }
  }
}

/**
 * Ime koje ide na kartu.
 *
 * Grad je dovoljan dok je jedan objekat u njemu. Dva beogradska objekta bi
 * inače dala dva natpisa „Beograd" jedan iznad drugog — i vlasnik ne bi znao
 * koji je koji baš tamo gde mu je razlika najvažnija.
 */
function titleFor(
  location: LocationPerformance,
  all: readonly LocationPerformance[],
): string {
  const sameCity = all.filter((other) => other.city === location.city)
  if (sameCity.length < 2) return location.city

  // „Beograd — Novi Beograd" -> „Novi Beograd"
  const dash = location.label.indexOf('—')
  return dash === -1 ? location.label : location.label.slice(dash + 1).trim()
}

export interface RetailMapLabels {
  readonly title: string
  readonly aboveAverage: string
  readonly average: string
  readonly belowAverage: string
  readonly bubbleMeaning: string
}

export function RetailMap({
  locations,
  labels,
  money,
}: {
  locations: readonly LocationPerformance[]
  labels: RetailMapLabels
  /** Skraćen iznos za natpis na karti — pun broj ne staje pored kruga. */
  money: (value: string, currency: string) => string
}) {
  const average = averageMargin(locations)

  /*
   * Veličina kruga je BROJ RAČUNA, ne iznos prometa.
   *
   * Iznosi su u tri valute. Prva verzija ih je skalirala unutar valute, da
   * evri ne bi ispali kao zrno pored dinara — i time napravila goru grešku:
   * jedini objekat u nekoj valuti je uvek bio najveći u svojoj grupi, pa su
   * Banja Luka i Podgorica dobile najkrupnije krugove na karti iako su
   * najmanji objekti u mreži. Karta je tvrdila suprotno od istine.
   *
   * Broj računa nema valutu. Uporediv je u sve tri zemlje bez kursa, i sam po
   * sebi znači nešto trgovcu — koliko kupaca prođe kroz objekat. Iznos u
   * lokalnoj valuti stoji ispisan pored kruga, gde se ne poredi pogledom nego
   * čita.
   */
  const maxTransactions = locations.reduce((max, l) => Math.max(max, l.transactions), 0)

  const placed: Placed[] = locations.map((location) => {
    const { x, y } = projectPoint(location.longitude, location.latitude)
    const radius = bubbleRadius(location.transactions, maxTransactions, 46)
    return {
      location,
      x,
      y,
      radius,
      step: marginStep(location.marginPercent, average),
      labelY: y,
      // Natpis počinje iza ivice kruga, ne na fiksnom rastojanju od središta:
      // inače veliki krug proguta prvih nekoliko slova.
      labelX: x + radius + 10,
      title: titleFor(location, locations),
    }
  })

  /*
   * Razmak mora da bude VEĆI od visine natpisa, ne od visine jednog reda.
   *
   * Natpis su dva reda: ime grada i iznos ispod njega. Sa razmakom od 34px dva
   * beogradska objekta su se i dalje preklapala — mereno u pregledaču, ne
   * procenjeno.
   */
  spreadLabels(placed, 48)

  const drawOrder = [...placed].sort(byDrawOrder)

  return (
    <figure className={styles.figure}>
      <svg
        className={styles.map}
        viewBox={`${-PADDING} ${-PADDING} ${MAP_WIDTH + PADDING * 2} ${MAP_HEIGHT + PADDING * 2}`}
        role="img"
        aria-label={labels.title}
      >
        {/* Susedi: postoje samo da bi se Srbija prepoznala kao Srbija. */}
        <g className={styles.quietLand}>
          {BACKGROUND_SHAPES.map((shape) => (
            <path key={shape.name} d={shape.d} />
          ))}
        </g>

        <g className={styles.land}>
          {FOREGROUND_SHAPES.map((shape) => (
            <path key={shape.name} d={shape.d} />
          ))}
        </g>

        {/* Vodilice idu ISPOD krugova, da im ne seku ivicu. */}
        <g className={styles.leaders}>
          {placed
            .filter((p) => Math.abs(p.labelY - p.y) > 2)
            .map((p) => (
              <line key={p.location.id} x1={p.x} y1={p.y} x2={p.labelX - 4} y2={p.labelY - 5} />
            ))}
        </g>

        <g>
          {drawOrder.map((p) => (
            <circle
              key={p.location.id}
              className={`${styles.bubble} ${styles[`step${p.step}`] ?? ''}`.trim()}
              cx={p.x}
              cy={p.y}
              r={p.radius}
            >
              {/* Ime mesta i za čitač ekrana i za rezervni oblačić pregledača. */}
              <title>
                {p.location.label} — {money(p.location.monthToDate, p.location.currency)},{' '}
                {p.location.marginPercent.toFixed(1)}%
              </title>
            </circle>
          ))}
        </g>

        {/*
          Natpisi su OBAVEZNI, ne ukras.
          Sitni krug na svetloj podlozi ne dostiže kontrast 3:1, pa boja sama ne
          sme da nosi značenje. Ime i iznos pored kruga to rešavaju — i čine
          kartu upotrebljivom u crno-beloj štampi izveštaja.
        */}
        <g className={styles.labels}>
          {placed.map((p) => (
            <g key={p.location.id} transform={`translate(${p.labelX} ${p.labelY})`}>
              <text className={styles.city}>{p.title}</text>
              <text className={styles.amount} dy="17">
                {money(p.location.monthToDate, p.location.currency)}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <figcaption className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles['step3']}`} />
          {labels.aboveAverage}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles['step0']}`} />
          {labels.average}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles['step-3']}`} />
          {labels.belowAverage}
        </span>
        <span className={styles.legendSize}>{labels.bubbleMeaning}</span>
      </figcaption>
    </figure>
  )
}
