import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Funkcija ne sme da pređe granicu server → klijent.
 *
 * React odbija da serijalizuje funkciju prosleđenu klijentskoj komponenti i
 * ceo render pukne. Podmuklo je što se to NE VIDI ni u typecheck-u, ni u
 * lint-u, ni u testovima — nego tek kada se ekran stvarno otvori u pregledaču.
 *
 * Ovaj obrazac je jednom bio na sedamnaest mesta u projektu i oborio je celu
 * konzolu pri prvom ulasku. Umesto funkcije prosleđuje se ŠABLON (tekst sa
 * {mestima}) ili REČNIK, a umetanje radi klijent.
 */

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Uklanja komentare, da tekst koji OPISUJE obrazac ne bude prijavljen kao obrazac. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Članovi prevodioca — prosleđeni kao prop, svaki od njih je funkcija. */
const TRANSLATOR_MEMBERS = ['t', 'formatNumber', 'formatDate', 'formatRelative']

/**
 * Atributi jednog JSX elementa, od `<Ime` do kraja otvarajuće oznake.
 *
 * Broje se zagrade, jer prop često sadrži i `{...}` i `(...)` — naivno
 * traženje prvog `>` preseklo bi element na prvoj strelici u telu propa.
 */
function attributesOf(code: string, start: number): string {
  let depth = 0
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '{' || ch === '(') depth += 1
    else if (ch === '}' || ch === ')') depth -= 1
    else if (ch === '>' && depth === 0) return code.slice(start, i)
  }
  return code.slice(start)
}

/**
 * Propovi sa vrednošću tipa funkcije, na elementima klijentskih komponenti.
 *
 * Prijavljuju se dva oblika:
 *   prop={(x) => ...}   — strelica napisana na licu mesta
 *   prop={ime}          — ime koje u istom fajlu označava funkciju
 *
 * NE prijavljuje se strelica koja se odmah poziva, npr. `xs.map((x) => t(x))`.
 * Ta funkcija ne prelazi nikakvu granicu — prelazi njen rezultat. Prva verzija
 * ove provere ih je prijavljivala i time oborila build na ispravnom kodu, pa
 * je odredište sada deo provere, a ne samo oblik.
 */
export function findFunctionProps(code: string, clientComponents: Set<string>): string[] {
  const localFunctions = new Set<string>()
  for (const m of code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/g)) {
    localFunctions.add(m[1]!)
  }
  for (const m of code.matchAll(/function\s+(\w+)\s*\(/g)) localFunctions.add(m[1]!)
  // `const { t, formatDate } = createTranslator(locale)`
  for (const m of code.matchAll(/const\s*\{([^}]*)\}\s*=\s*createTranslator\(/g)) {
    for (const name of m[1]!.split(',')) {
      const clean = name.trim().split(':')[0]!.trim()
      if (TRANSLATOR_MEMBERS.includes(clean)) localFunctions.add(clean)
    }
  }

  const found: string[] = []

  for (const name of clientComponents) {
    const opening = new RegExp(`<${name}\\b`, 'g')
    for (const match of code.matchAll(opening)) {
      const attrs = attributesOf(code, match.index + name.length + 1)

      for (const prop of attrs.matchAll(/(\w+)=\{\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/g)) {
        found.push(`<${name} ${prop[1]}={(…) => …}`)
      }
      for (const prop of attrs.matchAll(/(\w+)=\{(\w+)\}/g)) {
        if (localFunctions.has(prop[2]!)) found.push(`<${name} ${prop[1]}={${prop[2]}}`)
      }
    }
  }

  return found
}

describe('granica server → klijent', () => {
  const files = [...tsxFiles('src/app'), ...tsxFiles('src/ui')]

  it('pronalazi fajlove za proveru', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('nijedna serverska komponenta ne prosleđuje funkciju KLIJENTSKOJ komponenti', () => {
    const clientComponents = new Set(
      files
        .filter((f) => readFileSync(f, 'utf8').includes("'use client'"))
        .map((f) => basename(f, '.tsx')),
    )

    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (source.includes("'use client'")) continue

      for (const found of findFunctionProps(withoutComments(source), clientComponents)) {
        offenders.push(`${file} → ${found}`)
      }
    }

    expect(offenders, `Prosleđuju funkciju klijentu:\n${offenders.join('\n')}`).toEqual([])
  })

  it('nijedna klijentska komponenta ne deklariše prop tipa funkcije za tekst', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes("'use client'")) continue

      const code = withoutComments(source)
      // `readonly nesto: (x: T) => string` — prop koji server ne može da popuni.
      const match = code.match(/readonly\s+\w+:\s*\([^)]*\)\s*=>\s*string/)
      if (match) offenders.push(`${file} → ${match[0]}`)
    }

    expect(offenders, `Traže funkciju od servera:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * Jezik se bira na JEDNOM mestu.
 *
 * Prekidač jezika je stajao u layout-u, a pojedine stranice su jezik i dalje
 * čitale samo iz profila — pa bi se okvir prebacio a sadržaj ne. Korisnik to
 * vidi kao pola prevedene stranice, što je gore nego nijedan prekidač.
 */
describe('izbor jezika je na jednom mestu', () => {
  const pages = [...tsxFiles('src/app')].filter((f) => f.endsWith('page.tsx') || f.endsWith('layout.tsx'))

  it('nijedna stranica ne zaobilazi requestLocale', () => {
    const offenders: string[] = []

    for (const file of pages) {
      const code = withoutComments(readFileSync(file, 'utf8'))
      if (!code.includes('createTranslator')) continue
      if (!code.includes('requestLocale')) offenders.push(file)
    }

    expect(offenders, `Biraju jezik mimo requestLocale:\n${offenders.join('\n')}`).toEqual([])
  })
})

/**
 * Provera same provere.
 *
 * Guard koji ništa ne prijavljuje izgleda isto kao guard koji radi. Ova dva
 * slučaja su tačno onaj kvar zbog kojeg guard postoji i tačno onaj ispravan
 * kod na kojem je prethodna, pregruba verzija padala.
 */
describe('sama provera prepoznaje kvar i ne prijavljuje ispravan kod', () => {
  const clients = new Set(['AskForm'])

  it('prijavljuje prevodioca prosleđenog klijentskoj komponenti', () => {
    const code = `
      const { t } = createTranslator(locale)
      return <AskForm t={t} />
    `
    expect(findFunctionProps(code, clients)).toEqual(['<AskForm t={t}'])
  })

  it('prijavljuje strelicu napisanu u propu', () => {
    const code = `return <AskForm label={(x) => t(x)} />`
    expect(findFunctionProps(code, clients)).toEqual(['<AskForm label={(…) => …}'])
  })

  it('NE prijavljuje strelicu koja se odmah poziva u istom fajlu', () => {
    const code = `
      const { t } = createTranslator(locale)
      return <AskForm suggestions={intents.map((i) => t(i))} />
    `
    expect(findFunctionProps(code, clients)).toEqual([])
  })

  it('NE prijavljuje pomoćnu funkciju koja se koristi van JSX-a', () => {
    const code = `
      const label = (x: string) => t(x)
      const rows = items.map(label)
      return <AskForm rows={rows} />
    `
    expect(findFunctionProps(code, clients)).toEqual([])
  })
})
