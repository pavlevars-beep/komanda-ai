/**
 * Pravi `src/ui/charts/balkans-geo.ts` iz Natural Earth podataka.
 *
 * Granice se NE crtaju rukom. Ovo je karta koju gleda čovek koji na njoj živi —
 * izmišljen obris Bosne prepoznao bi za sekundu, i sve ostalo na ekranu bi
 * izgubilo kredibilitet zajedno sa njim.
 *
 * Izvor: Natural Earth 50m, javno vlasništvo (public domain).
 * https://github.com/nvkelso/natural-earth-vector
 *
 * Pokretanje (traži mrežu, zato NIJE deo build-a):
 *   node scripts/build-balkans-geo.mjs
 *
 * Rezultat se commit-uje, pa gradnja i testovi nikad ne zavise od mreže.
 */

import { writeFileSync } from 'node:fs'
import polygonClipping from 'polygon-clipping'

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'

/**
 * Zemlje u prvom planu — tamo gde su prodajna mesta — i one u pozadini.
 *
 * Pozadina postoji da bi se Srbija prepoznala kao Srbija. Bez suseda je to
 * mrlja koju niko ne ume da smesti.
 */
const FOREGROUND = ['Serbia', 'Bosnia and Herz.', 'Montenegro']
const BACKGROUND = [
  'Croatia',
  'Hungary',
  'Romania',
  'Bulgaria',
  'North Macedonia',
  'Albania',
  'Slovenia',
]

/**
 * Oblici koji se SPAJAJU u jednu zemlju.
 *
 * Natural Earth vodi Kosovo kao zaseban oblik. Za kartu koju gleda srpska firma
 * to nije tačno: Kosovo i Metohija je autonomna pokrajina Srbije, i tako stoji u
 * Ustavu. Zato se poligoni spajaju u JEDAN — ne samo oboje istom bojom, jer bi
 * se unutrašnja granica i dalje videla kao linija razdvajanja.
 *
 * Unutrašnja linija se ne crta ni za Vojvodinu, pa se ne crta ni ovde: Srbija je
 * na ovoj karti jedan obris.
 */
const MERGE_INTO = { Serbia: ['Kosovo'] }

/** Okvir prikaza. Bira se rukom, jer okvir izveden iz podataka uvek zaseče. */
const BOUNDS = { minLon: 15.4, maxLon: 23.4, minLat: 41.4, maxLat: 46.6 }

const WIDTH = 1000

/*
 * Ravna projekcija sa ispravkom po širini.
 *
 * Na rasponu od šest stepeni razlika prema pravoj Merkatorovoj projekciji je
 * ispod jednog procenta — manja od debljine linije. Ono što se NE sme
 * preskočiti je množenje sa kosinusom srednje širine: bez njega je Balkan
 * razvučen u širinu za skoro trećinu, i to se vidi golim okom.
 */
const MEAN_LAT = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180)
const LON_SCALE = Math.cos(MEAN_LAT)

const spanLon = (BOUNDS.maxLon - BOUNDS.minLon) * LON_SCALE
const spanLat = BOUNDS.maxLat - BOUNDS.minLat
const HEIGHT = Math.round((WIDTH * spanLat) / spanLon)

function project([lon, lat]) {
  const x = ((lon - BOUNDS.minLon) * LON_SCALE * WIDTH) / spanLon
  // Y raste nadole u SVG-u, a geografska širina naviše.
  const y = ((BOUNDS.maxLat - lat) * HEIGHT) / spanLat
  return [x, y]
}

/** Douglas–Peucker. Bez njega je datoteka 3 MB za kartu od 1000 piksela. */
function simplify(points, tolerance) {
  if (points.length < 3) return points

  let maxDist = 0
  let index = 0
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    const cx = ax + Math.max(0, Math.min(1, t)) * dx
    const cy = ay + Math.max(0, Math.min(1, t)) * dy
    const dist = Math.hypot(px - cx, py - cy)
    if (dist > maxDist) {
      maxDist = dist
      index = i
    }
  }

  if (maxDist <= tolerance) return [points[0], points[points.length - 1]]

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ]
}

/** Odbacuje ostrva i krpice koje na ovoj veličini ispadnu kao prljavština. */
function areaOf(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat()
  return []
}

function pathFor(geometry, tolerance, minArea) {
  const parts = []

  for (const ring of ringsOf(geometry)) {
    const projected = ring.map(project)
    const reduced = simplify(projected, tolerance)
    if (reduced.length < 4) continue
    if (areaOf(reduced) < minArea) continue

    const d = reduced
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join('')
    parts.push(`${d}Z`)
  }

  return parts.join('')
}

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`Natural Earth nije dostupan: ${response.status}`)
const geo = await response.json()

const byName = new Map()
for (const feature of geo.features) {
  const name = feature.properties?.NAME
  if (name) byName.set(name, feature.geometry)
}

/** Geometrija kao niz poligona, u obliku koji traži spajanje. */
function toPolygons(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  throw new Error(`Nepoznat tip geometrije: ${geometry.type}`)
}

function geometryFor(name) {
  const base = byName.get(name)
  if (!base) throw new Error(`Natural Earth nema zemlju: ${name}`)

  const merge = MERGE_INTO[name]
  if (!merge) return base

  const parts = merge.map((other) => {
    const g = byName.get(other)
    if (!g) throw new Error(`Natural Earth nema oblik za spajanje: ${other}`)
    return toPolygons(g)
  })

  // Spajanje pravi JEDAN obris bez unutrašnje granice. Da su samo obojeni isto,
  // linija između njih bi ostala — a ona je upravo ono što ne sme da stoji.
  const united = polygonClipping.union(toPolygons(base), ...parts)
  return { type: 'MultiPolygon', coordinates: united }
}

function collect(names, tolerance, minArea) {
  return names.map((name) => {
    const d = pathFor(geometryFor(name), tolerance, minArea)
    if (d === '') throw new Error(`Prazna putanja za: ${name}`)
    return { name, d }
  })
}

// Prvi plan nosi manju toleranciju: te obrise čovek zaista gleda.
const foreground = collect(FOREGROUND, 0.7, 6)
const background = collect(BACKGROUND, 1.4, 12)

const file = `/**
 * Obrisi Balkana, u projektovanim koordinatama.
 *
 * GENERISANO — ne menja se rukom.
 * Ponovo se pravi sa: node scripts/build-balkans-geo.mjs
 *
 * Izvor: Natural Earth 50m (public domain). Granice su prave; izmišljen obris
 * bi čovek sa ovih prostora prepoznao odmah, i poneo bi sa sobom poverenje u
 * sve ostale brojke na ekranu.
 */

export const MAP_WIDTH = ${WIDTH}
export const MAP_HEIGHT = ${HEIGHT}

/** Okvir u geografskim koordinatama — iz njega se računa položaj gradova. */
export const MAP_BOUNDS = {
  minLon: ${BOUNDS.minLon},
  maxLon: ${BOUNDS.maxLon},
  minLat: ${BOUNDS.minLat},
  maxLat: ${BOUNDS.maxLat},
} as const

/** Kosinus srednje širine. Bez njega je Balkan širi nego što jeste. */
export const LON_SCALE = ${LON_SCALE.toFixed(6)}

export interface CountryShape {
  readonly name: string
  readonly d: string
}

/** Zemlje u kojima ima prodajnih mesta. */
export const FOREGROUND_SHAPES: readonly CountryShape[] = ${JSON.stringify(foreground, null, 2)}

/** Susedi — postoje samo da bi se prvi plan prepoznao. */
export const BACKGROUND_SHAPES: readonly CountryShape[] = ${JSON.stringify(background, null, 2)}

/** Geografske koordinate u koordinate crteža. */
export function projectPoint(lon: number, lat: number): { x: number; y: number } {
  const spanLon = (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon) * LON_SCALE
  const spanLat = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat
  return {
    x: ((lon - MAP_BOUNDS.minLon) * LON_SCALE * MAP_WIDTH) / spanLon,
    y: ((MAP_BOUNDS.maxLat - lat) * MAP_HEIGHT) / spanLat,
  }
}
`

writeFileSync(new URL('../src/ui/charts/balkans-geo.ts', import.meta.url), file)

const points = [...foreground, ...background].reduce(
  (sum, s) => sum + (s.d.match(/[ML]/g) ?? []).length,
  0,
)
console.log(`Napisano: src/ui/charts/balkans-geo.ts`)
console.log(`Okvir crteža: ${WIDTH}×${HEIGHT}, ukupno tačaka: ${points}`)
console.log(`Veličina: ${(file.length / 1024).toFixed(1)} kB`)
