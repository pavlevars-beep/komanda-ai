import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Slika sa dva ograničenja mora da čuva odnos stranica.
 *
 * Ovo je bila prava greška, vidljiva klijentu: logotip Europrofila je u traci
 * bio razvučen šezdeset procenata u širinu. Uzrok nije bio ni u jednoj od te
 * dve vrednosti nego u tome što je slika dete flex kolone — a ona decu
 * podrazumevano rasteže po širini. `max-height` je onda spljošti.
 *
 * Pravilo koje zadaje i `max-width` i `max-height` opisuje KUTIJU u koju slika
 * treba da stane. Bez `object-fit` ta kutija je i oblik slike, pa se sadržaj
 * krivi kad god se odnosi ne poklope.
 */

const ROOT = join(import.meta.dirname, '../..')

function cssFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...cssFiles(full))
    else if (entry.endsWith('.css')) out.push(full)
  }
  return out
}

describe('odnos stranica slika', () => {
  it('pravilo sa obe granice zadaje i object-fit', () => {
    const prekrsaji: string[] = []

    for (const file of cssFiles(join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')

      for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1]!.trim().split('\n').pop()!.trim()
        const body = m[2]!
        if (!/max-width:/.test(body) || !/max-height:/.test(body)) continue
        if (/object-fit:/.test(body)) continue

        prekrsaji.push(`${file.slice(ROOT.length + 1)}: ${selector}`)
      }
    }

    expect(prekrsaji).toEqual([])
  })

  /*
   * `cover` seče sliku da popuni kutiju. Za logotip to znači odsečen deo imena
   * firme — gore od razvučenog, jer se ne primeti da nešto nedostaje.
   */
  it('nigde se ne koristi cover', () => {
    for (const file of cssFiles(join(ROOT, 'src'))) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('object-fit: cover')
    }
  })
})
