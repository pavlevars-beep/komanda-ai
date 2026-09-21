import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex } from '@/core/branding/contrast'

/**
 * Boje grafikona se PROVERAVAJU, ne procenjuju.
 *
 * Dva niza u istom grafikonu moraju da se razlikuju i onome ko ne razlikuje
 * crveno i zeleno — a to je svaki dvanaesti muškarac. Razlika se ne vidi
 * gledanjem u palete: boje koje oku izgledaju jasno različito mogu da se pod
 * deuteranopijom stope u istu.
 *
 * Zato se ovde pokreće ista računica koju bi pokrenuo i alat: simulacija po
 * Machado–Oliveira–Fernandes (2009) i rastojanje u OKLab prostoru. Test
 * postoji da bi „malo doterivanje tirkizne" palo ovde, a ne kod korisnika.
 */

const TOKENS = readFileSync('src/ui/theme/tokens.css', 'utf8')

/*
 * Svetla vrednost je PRVA, tamna POSLEDNJA.
 *
 * Tokeni se definišu u `:root`, pa se prepisuju u dva tamna bloka (media upit
 * i `data-theme`). Ta dva su ista, pa je poslednja pojava tamna vrednost.
 */
function token(name: string): { light: string; dark: string } {
  const found = [...TOKENS.matchAll(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'g'))].map((m) => m[1]!)
  if (found.length === 0) throw new Error(`token ${name} nije definisan`)
  return { light: found[0]!, dark: found[found.length - 1]! }
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function linear(hex: string): [number, number, number] {
  const rgb = parseHex(hex)
  if (!rgb) throw new Error(`neispravan zapis boje: ${hex}`)
  return [srgbToLinear(rgb.r / 255), srgbToLinear(rgb.g / 255), srgbToLinear(rgb.b / 255)]
}

function oklab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/* Machado, Oliveira & Fernandes (2009), puna jačina, u linearnom RGB-u. */
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const

function simulate(hex: string, kind: keyof typeof CVD): [number, number, number] {
  const [r, g, b] = linear(hex)
  const M = CVD[kind]
  const clamp = (c: number) => Math.max(0, Math.min(1, c))
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ]
}

/** Rastojanje u OKLab prostoru ×100; bez simulacije je normalan vid. */
function deltaE(a: string, b: string, kind?: keyof typeof CVD): number {
  const x = oklab(kind ? simulate(a, kind) : linear(a))
  const y = oklab(kind ? simulate(b, kind) : linear(b))
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const chroma = (hex: string) => {
  const [, a, b] = oklab(linear(hex))
  return Math.hypot(a, b)
}

const SURFACE = token('--surface')

describe('kategorijalne boje grafikona', () => {
  const cat1 = token('--cat-1')
  const cat2 = token('--cat-2')

  for (const tema of ['light', 'dark'] as const) {
    it(`razlikuju se i pod daltonizmom — ${tema}`, () => {
      const a = cat1[tema]
      const b = cat2[tema]
      // Prag 8 je cilj; 6–8 je dozvoljeno samo uz drugo obeležje. Ovde su
      // oznake uvek ispisane, ali se ipak traži pun prag.
      expect(deltaE(a, b, 'deutan')).toBeGreaterThanOrEqual(8)
      expect(deltaE(a, b, 'protan')).toBeGreaterThanOrEqual(8)
      // Normalan vid mora da ih razlikuje bez napora.
      expect(deltaE(a, b)).toBeGreaterThanOrEqual(15)
    })

    it(`nisu toliko isprane da se čitaju kao siva — ${tema}`, () => {
      expect(chroma(cat1[tema])).toBeGreaterThanOrEqual(0.1)
      expect(chroma(cat2[tema])).toBeGreaterThanOrEqual(0.1)
    })

    it(`vide se na površini kartice — ${tema}`, () => {
      const surface = parseHex(SURFACE[tema])!
      expect(contrastRatio(parseHex(cat1[tema])!, surface)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(parseHex(cat2[tema])!, surface)).toBeGreaterThanOrEqual(3)
    })
  }
})

describe('istaknuta traka na tabli', () => {
  const bg = token('--hero-bg')
  const ink = token('--hero-ink')
  const line = token('--hero-line')

  for (const tema of ['light', 'dark'] as const) {
    it(`tekst i linija se čitaju na podlozi trake — ${tema}`, () => {
      const podloga = parseHex(bg[tema])!
      // Sitan tekst traži 4,5 : 1; linija grafikona je grafički element, 3 : 1.
      expect(contrastRatio(parseHex(ink[tema])!, podloga)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(parseHex(line[tema])!, podloga)).toBeGreaterThanOrEqual(3)
    })

    it(`traka ostaje tamna, da ne bi pratila temu — ${tema}`, () => {
      /*
       * Traka je jedina površina koja namerno ne prati temu. Da je uzela
       * `--accent-ink`, u tamnoj temi bi postala svetla ploča i sve boje na
       * njoj bi se prevrnule — zato se ovde meri, a ne pamti.
       */
      expect(contrastRatio(parseHex(bg[tema])!, parseHex('#ffffff')!)).toBeGreaterThanOrEqual(4.5)
    })
  }
})
