import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Nedefinisan token ne puca — TIHO NESTANE.
 *
 * `gap: var(--space-7)` bez definisanog `--space-7` nije greška u CSS-u: cela
 * deklaracija se odbaci i razmak padne na nulu. Ekran se skupi, niko ne dobije
 * poruku, a uzrok se traži u rasporedu umesto u pravopisu.
 *
 * Tako je i nastalo: pet mesta je koristilo `--space-7` koje nikad nije
 * postojalo, među njima i razmak između odeljaka jutarnjeg brifa. Ovaj test
 * postoji da se to ne ponovi ćutke.
 */

const ROOT = join(import.meta.dirname, '../..')
const TOKENS = join(ROOT, 'src/ui/theme/tokens.css')

/*
 * Tokeni koji se NE definišu u tokens.css jer im vrednost dolazi spolja:
 * font iz `next/font` (promenljiva se pravi pri gradnji), a boja radnog
 * prostora sa servera, tek pošto prođe proveru kontrasta.
 */
const SPOLJNI = new Set(['--font-sans-loaded', '--font-mono-loaded'])

function filesUnder(dir: string, exts: readonly string[]): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts))
    else if (exts.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

function definedTokens(): Set<string> {
  const css = readFileSync(TOKENS, 'utf8')
  const names = new Set<string>()
  for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) names.add(m[1]!)
  return names
}

describe('dizajn tokeni', () => {
  const defined = definedTokens()

  it('tokens.css je zaista pročitan', () => {
    // Bez ove provere bi prazan skup učinio sve ostale testove trivijalno tačnim.
    expect(defined.size).toBeGreaterThan(40)
    expect(defined.has('--space-4')).toBe(true)
  })

  it('svaki var(--token) u stilovima je negde definisan', () => {
    const nedostaju = new Map<string, string[]>()

    for (const file of filesUnder(join(ROOT, 'src'), ['.css', '.tsx'])) {
      const text = readFileSync(file, 'utf8')
      // Lokalno definisan token važi u svom fajlu (npr. lokalna promenljiva u
      // jednom modulu) — zato se prvo skupe definicije iz samog fajla.
      const lokalni = new Set<string>()
      for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:/g)) lokalni.add(m[1]!)

      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const name = m[1]!
        if (defined.has(name) || lokalni.has(name) || SPOLJNI.has(name)) continue
        const where = file.slice(ROOT.length + 1)
        nedostaju.set(name, [...(nedostaju.get(name) ?? []), where])
      }
    }

    expect(Object.fromEntries(nedostaju)).toEqual({})
  })

  /*
   * Debljina i razmak slova su se razišli tiho.
   *
   * Ista zamisao — sitna verzalna oznaka — bila je napisana jedanaest puta, sa
   * razmakom slova od 0.04em do 0.12em. Svaka vrednost je pojedinačno razumna,
   * a zajedno daju ekran na kojem ništa nije poravnato ni sa čim. Isto i sa
   * `font-weight: 500` na tridesetak mesta: promena jedne debljine u tokenima
   * tada ne stiže nigde.
   */
  it('stilovi ne upisuju debljinu i razmak slova brojem', () => {
    const prekrsaji: string[] = []

    for (const file of filesUnder(join(ROOT, 'src'), ['.module.css'])) {
      const text = readFileSync(file, 'utf8')
      const where = file.slice(ROOT.length + 1)

      for (const m of text.matchAll(/font-weight:\s*([0-9]+)/g)) {
        prekrsaji.push(`${where}: font-weight: ${m[1]!}`)
      }
      // `letter-spacing: 0` i `normal` su u redu — oni PONIŠTAVAJU nasleđeno,
      // a ne uvode novu vrednost pored tokena.
      for (const m of text.matchAll(/letter-spacing:\s*(-?[0-9]*\.?[0-9]+)(em|px|rem)/g)) {
        if (Number(m[1]!) !== 0) prekrsaji.push(`${where}: letter-spacing: ${m[1]!}${m[2]!}`)
      }
    }

    expect(prekrsaji).toEqual([])
  })

  it('skala razmaka nema rupu', () => {
    // Rupa u nizu je poziv da neko napiše sledeći broj koji ne postoji.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(defined.has(`--space-${n}`)).toBe(true)
    }
  })
})
