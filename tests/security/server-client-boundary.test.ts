import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

describe('granica server → klijent', () => {
  const files = [...tsxFiles('src/app'), ...tsxFiles('src/ui')]

  it('pronalazi fajlove za proveru', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('nijedna serverska komponenta ne gradi funkciju od prevodioca', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      if (source.includes("'use client'")) continue

      const code = withoutComments(source)
      // `(x) => t('kljuc', ...)` u serverskoj komponenti završi kao prop
      // klijentske komponente i obori render.
      if (/=>\s*t\(/.test(code)) offenders.push(file)
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
