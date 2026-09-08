import { parseDelimited } from './csv'
import { readXlsx } from './xlsx'
import { ZipError } from './zip'

/**
 * Jedan ulaz za sve podržane oblike tabele.
 *
 * Vrsta se bira po sadržaju, ne po nazivu fajla. Ekstenzija je tvrdnja
 * korisnika: `.xlsx` preimenovan u `.csv` je čest slučaj kada se fajl šalje
 * poštom, a poruka „nije ispravan CSV" tada ne pomaže nikome.
 */

export interface SheetTable {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly sheetName?: string
}

export class ImportError extends Error {
  constructor(readonly key: string) {
    super(key)
    this.name = 'ImportError'
  }
}

/** ZIP arhiva počinje sa `PK\x03\x04`; `.xlsx` je ZIP. */
function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

export const MAX_ROWS = 100_000

export function readTable(bytes: Buffer): SheetTable {
  if (bytes.length === 0) throw new ImportError('import.error.empty')

  let rows: readonly (readonly string[])[]
  let sheetName: string | undefined

  if (looksLikeZip(bytes)) {
    try {
      const sheet = readXlsx(bytes)
      rows = sheet.rows
      sheetName = sheet.name
    } catch (cause) {
      throw new ImportError(cause instanceof ZipError ? cause.key : 'import.error.unreadable')
    }
  } else {
    /*
     * Tekst se čita kao UTF-8. Stariji domaći izvozi umeju da budu u
     * Windows-1250, i tamo se „č" i „ć" pretvore u znak zamene — ali podaci
     * ostaju upotrebljivi, a naziv sa pokvarenim slovom je vidljiv problem
     * koji korisnik ume da prijavi. Tiho odbijanje fajla ne bi bilo bolje.
     */
    rows = parseDelimited(bytes.toString('utf8'))
  }

  if (rows.length === 0) throw new ImportError('import.error.empty')
  if (rows.length > MAX_ROWS) throw new ImportError('import.error.tooManyRows')

  /*
   * Zaglavlje je PRVI red koji nije prazan.
   *
   * Izvozi iz ERP-a često imaju prazan red ili naslov iznad tabele. Uzimanje
   * doslovno prvog reda dalo bi zaglavlje sa jednom popunjenom ćelijom, i
   * mapiranje ne bi imalo šta da prepozna.
   */
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.trim() !== ''))
  if (headerIndex === -1) throw new ImportError('import.error.empty')

  const headers = (rows[headerIndex] ?? []).map((h) => h.trim())

  return {
    headers,
    // Redovi ISPOD zaglavlja, uključujući i samo zaglavlje kao prvi element —
    // normalizacija preskače zadati broj redova zaglavlja.
    rows: rows.slice(headerIndex),
    ...(sheetName ? { sheetName } : {}),
  }
}
