/**
 * Geometrija grafikona.
 *
 * Izdvojena od crtanja da bi mogla da se proveri bez pregledača. Greška u
 * skaliranju se na ekranu vidi kao „grafikon izgleda čudno" — što niko ne
 * prijavi kao kvar, a menja zaključak koji rukovodilac donese.
 */

export interface Point {
  readonly label: string
  readonly value: number
}

export interface Scale {
  /** Najveća vrednost koja se crta. Nikad manja od 1, da prazan niz ne deli nulom. */
  readonly max: number
  /** Visina stubića ili tačke u procentima visine okvira. */
  readonly height: (value: number) => number
}

/**
 * Razmera za stubiće.
 *
 * Osnova je UVEK nula. Skraćena osa uvećava razlike i od pomeraja od dva
 * procenta pravi provaliju — najčešći način da tačan podatak ispriča netačnu
 * priču.
 */
export function barScale(values: readonly number[]): Scale {
  const max = Math.max(1, ...values.map((v) => (Number.isFinite(v) ? v : 0)))
  return {
    max,
    height: (value) => {
      if (!Number.isFinite(value) || value <= 0) return 0
      // Minimum 1.5% da vrednost veća od nule nikad ne nestane sa ekrana.
      return Math.max(1.5, Math.min(100, (value / max) * 100))
    },
  }
}

/**
 * Tačke linije u koordinatama okvira `viewBox`, sa (0,0) gore levo.
 *
 * Vraća i samu putanju i tačke, jer se ista geometrija koristi za liniju, za
 * ispunu ispod nje i za tačku na kraju.
 */
export interface LineGeometry {
  readonly points: readonly { readonly x: number; readonly y: number }[]
  readonly path: string
  /** Zatvorena putanja za ispunu ispod linije. */
  readonly areaPath: string
  readonly max: number
}

export function lineGeometry(
  values: readonly number[],
  width: number,
  height: number,
  padding = 2,
): LineGeometry {
  const clean = values.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0))
  const max = Math.max(1, ...clean)
  const inner = height - padding * 2

  // Jedna tačka nema nagib; crta se na sredini da ne bi visila uz levu ivicu.
  const step = clean.length > 1 ? width / (clean.length - 1) : 0
  const points = clean.map((value, index) => ({
    x: clean.length > 1 ? index * step : width / 2,
    y: padding + inner - (value / max) * inner,
  }))

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const areaPath =
    points.length === 0
      ? ''
      : `${path} L${points[points.length - 1]!.x.toFixed(2)} ${height} L${points[0]!.x.toFixed(2)} ${height} Z`

  return { points, path, areaPath, max }
}

/**
 * Korak rampe za uređenu skalu.
 *
 * Indeks 0 je najsvetliji korak. Vrednost van opsega se privodi krajevima —
 * niz sa više stavki od koraka ne sme da ostane bez boje.
 */
export function rampStep(index: number, steps: number): number {
  if (steps <= 1) return 0
  return Math.max(0, Math.min(steps - 1, index))
}

/**
 * Oznake koje se ispisuju ispod ose.
 *
 * Kod dugih nizova se ispisuje svaka n-ta, jer se natpisi inače preklope i
 * postanu nečitljivi. Prva i poslednja se uvek ispisuju: bez njih čitalac ne
 * zna ni gde niz počinje ni gde se završava.
 */
export function tickIndices(count: number, maxTicks = 7): readonly number[] {
  if (count <= 0) return []
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i)

  const stride = Math.ceil((count - 1) / (maxTicks - 1))
  const ticks: number[] = []
  for (let i = 0; i < count; i += stride) ticks.push(i)
  if (ticks[ticks.length - 1] !== count - 1) ticks.push(count - 1)
  return ticks
}
