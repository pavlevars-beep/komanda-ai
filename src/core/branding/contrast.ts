/**
 * Normalizacija brend boje klijenta.
 *
 * Klijent bira boju koja mu se dopada; ona ne sme da pokvari čitljivost.
 * Umesto da boju odbijemo i pošaljemo korisnika da pogađa, izvodimo iz nje
 * varijantu koja zadovoljava kontrast, a zadržava prepoznatljiv ton.
 *
 * Čist modul: bez zavisnosti, potpuno determinističan, lako testabilan.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX = /^#([0-9a-f]{6})$/i

export function parseHex(hex: string): Rgb | null {
  const m = HEX.exec(hex.trim())
  if (!m?.[1]) return null
  const n = Number.parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** WCAG 2.1 relativna luminancija. */
export function luminance({ r, g, b }: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** Odnos kontrasta dve boje, od 1 do 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// --- HSL, za pomeranje svetline uz očuvanje tona ---

interface Hsl {
  h: number
  s: number
  l: number
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 }
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const NEAR_BLACK: Rgb = { r: 20, g: 26, b: 27 }

/**
 * Pomera svetlinu dok se ne dostigne traženi kontrast prema podlozi.
 * Ton i zasićenost ostaju netaknuti, pa boja i dalje deluje kao klijentova.
 */
function adjustForContrast(color: Rgb, background: Rgb, target: number): Rgb {
  if (contrastRatio(color, background) >= target) return color

  const hsl = rgbToHsl(color)
  // Ako je podloga svetla, boju tamnimo; ako je tamna, posvetljujemo.
  const darken = luminance(background) > 0.5
  const step = 0.02

  let best = color
  for (let i = 1; i <= 50; i++) {
    const l = darken ? hsl.l - step * i : hsl.l + step * i
    if (l <= 0 || l >= 1) break
    const candidate = hslToRgb({ ...hsl, l })
    best = candidate
    if (contrastRatio(candidate, background) >= target) return candidate
  }
  return best
}

export interface BrandPalette {
  /** Boja za tekst i ivice na podlozi radnog prostora. */
  readonly brand: string
  /** Tamnija/svetlija varijanta za tekst koji mora da bude čitljiv. */
  readonly brandInk: string
  /** Blaga pozadina za istaknuta stanja. */
  readonly brandSoft: string
  /** Boja teksta NA brend boji (dugme). */
  readonly brandContrast: string
  /** True ako je originalna boja morala da se koriguje. */
  readonly adjusted: boolean
}

export interface BrandInput {
  readonly hex: string
  readonly scheme: 'light' | 'dark'
}

const GROUND: Record<'light' | 'dark', Rgb> = {
  light: { r: 246, g: 248, b: 248 },
  dark: { r: 13, g: 17, b: 19 },
}

/** WCAG AA za veliki tekst i grafičke elemente. */
const TARGET_UI = 3.0
/** WCAG AA za normalan tekst. */
const TARGET_TEXT = 4.5

/**
 * Izvodi pristupačnu paletu iz klijentove boje.
 * Vraća null ako uneta vrednost uopšte nije ispravan heksadecimalni zapis —
 * to je greška u unosu i prijavljuje se korisniku, ne ćuti se.
 */
export function deriveBrandPalette(input: BrandInput): BrandPalette | null {
  const base = parseHex(input.hex)
  if (!base) return null

  const ground = GROUND[input.scheme]
  const brand = adjustForContrast(base, ground, TARGET_UI)
  const brandInk = adjustForContrast(base, ground, TARGET_TEXT)

  // Podloga za istaknuta stanja: brend ton, vrlo blizu podloge.
  const hsl = rgbToHsl(base)
  const brandSoft = hslToRgb({
    h: hsl.h,
    s: Math.min(hsl.s, 0.35),
    l: input.scheme === 'light' ? 0.93 : 0.14,
  })

  // Tekst NA brend boji: bira se ono od belog/tamnog što bolje kontrastira.
  const onWhite = contrastRatio(brand, WHITE)
  const onBlack = contrastRatio(brand, NEAR_BLACK)
  const brandContrast = onWhite >= onBlack ? WHITE : NEAR_BLACK

  return {
    brand: toHex(brand),
    brandInk: toHex(brandInk),
    brandSoft: toHex(brandSoft),
    brandContrast: toHex(brandContrast),
    adjusted: toHex(brand) !== toHex(base),
  }
}

/**
 * Provera koju koristi ekran za brendiranje pre snimanja.
 * Vraća poruku za korisnika kada boja ne prolazi ni nakon korekcije.
 */
export interface BrandCheck {
  readonly valid: boolean
  readonly reason?: 'invalid_hex' | 'unusable'
  readonly palette?: BrandPalette
  readonly adjustedFrom?: string
}

export function checkBrandColor(hex: string): BrandCheck {
  const light = deriveBrandPalette({ hex, scheme: 'light' })
  const dark = deriveBrandPalette({ hex, scheme: 'dark' })
  if (!light || !dark) return { valid: false, reason: 'invalid_hex' }

  // Boja mora da bude upotrebljiva u obe teme.
  const okLight = contrastRatio(parseHex(light.brand)!, GROUND.light) >= TARGET_UI
  const okDark = contrastRatio(parseHex(dark.brand)!, GROUND.dark) >= TARGET_UI
  if (!okLight || !okDark) return { valid: false, reason: 'unusable' }

  return {
    valid: true,
    palette: light,
    ...(light.adjusted ? { adjustedFrom: hex.toLowerCase() } : {}),
  }
}
