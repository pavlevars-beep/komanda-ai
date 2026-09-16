/**
 * Provera optičke veličine ikonica.
 *
 * Putanje se crtaju u raznim trenucima i rasponi se raziđu: kada je najveća
 * zauzimala 21,7 od 24 a najmanja 13, red ikonica se čitao kao domaća izrada
 * iako je svaka pojedinačno bila uredna.
 *
 * Meri se pravim iscrtavanjem u pregledaču (`getBBox`), ne procenom iz
 * koordinata — luk i kriva se iz teksta putanje ne mogu tačno izmeriti, a
 * upravo njih ima u najvećim ikonicama.
 *
 * Nije deo `verify` i ne obara build: pokreće se kada se skup dopunjava.
 */

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const SOURCE = 'src/ui/primitives/Icon.tsx'

/** Znaci, ne slike: interpunkcija koja namerno stoji manja. */
const GLYPHS = new Set(['plus', 'check', 'chevronUp', 'chevronDown', 'arrowRight'])

/** Dozvoljeni odnos najveće i najmanje slikovne ikonice. */
const MAX_RATIO = 1.25

const source = readFileSync(SOURCE, 'utf8')

const pathBlock = source.slice(source.indexOf('const PATHS'), source.indexOf('} as const'))
const paths = Object.fromEntries(
  [...pathBlock.matchAll(/^\s*([a-zA-Z]+):\s*\n?\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]),
)

const scaleStart = source.indexOf('const SCALE')
const scaleBlock = scaleStart === -1 ? '' : source.slice(scaleStart, source.indexOf('}', scaleStart))
const scales = Object.fromEntries(
  [...scaleBlock.matchAll(/([a-zA-Z]+):\s*([0-9.]+)/g)].map((m) => [m[1], Number(m[2])]),
)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await (await browser.newContext()).newPage()
await page.setContent('<svg viewBox="0 0 24 24"><path id="p"/></svg>')

const measured = []
for (const [name, d] of Object.entries(paths)) {
  const box = await page.evaluate((d) => {
    const p = document.getElementById('p')
    p.setAttribute('d', d)
    const { x, y, width, height } = p.getBBox()
    return { x, y, width, height }
  }, d)

  const scale = scales[name] ?? 1
  measured.push({
    name,
    span: Math.max(box.width, box.height) * scale,
    offset: Math.hypot(box.x + box.width / 2 - 12, box.y + box.height / 2 - 12),
  })
}

await browser.close()

const pictorial = measured.filter((i) => !GLYPHS.has(i.name))
const min = Math.min(...pictorial.map((i) => i.span))
const max = Math.max(...pictorial.map((i) => i.span))
const ratio = max / min

console.log(`▸ ${measured.length} ikonica u ${SOURCE}\n`)

for (const icon of [...measured].sort((a, b) => b.span - a.span)) {
  const mark = GLYPHS.has(icon.name) ? '·' : icon.span === max || icon.span === min ? '▸' : ' '
  console.log(
    `  ${mark} ${icon.name.padEnd(14)} raspon ${icon.span.toFixed(1).padStart(5)}` +
      `  pomak od središta ${icon.offset.toFixed(1)}`,
  )
}

console.log(
  `\nSlikovne: od ${min.toFixed(1)} do ${max.toFixed(1)} — odnos ${ratio.toFixed(2)}` +
    ` (granica ${MAX_RATIO})`,
)

// Pomak od središta se prijavljuje, ali ne obara: neke ikonice su namerno
// nesimetrične (strelica, spoljni link) i njihovo središte nije na sredini.
const offCentre = measured.filter((i) => i.offset > 1)
if (offCentre.length > 0) {
  console.log(`⚠ Van središta za više od 1: ${offCentre.map((i) => i.name).join(', ')}`)
}

if (ratio > MAX_RATIO) {
  console.log('\n✗ Rasponi se previše razlikuju — dodati ili ispraviti unos u SCALE.')
  process.exit(1)
}

console.log('✓ Skup je optički ujednačen')
