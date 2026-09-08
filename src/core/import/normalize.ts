import { FIELDS, type ColumnMapping, type DatasetKind } from './mapping'

/**
 * Pretvaranje redova tabele u naš model.
 *
 * Vodeće pravilo: red koji se ne može pročitati SE PRIJAVLJUJE, ne preskače
 * tiho. Uvoz koji od hiljadu redova upiše devetsto i ćuti daje brojeve manje
 * od stvarnih, a niko ne zna zašto — to je najgori mogući ishod, gori i od
 * odbijenog uvoza.
 */

export interface RowProblem {
  /** Broj reda kako ga korisnik vidi u tabeli, sa zaglavljem kao redom 1. */
  readonly row: number
  readonly field: string
  readonly key: string
  /** Vrednost koja nije prošla, skraćena. Pomaže da se greška nađe u tabeli. */
  readonly value: string
}

export interface NormalizedRows {
  readonly rows: readonly Readonly<Record<string, string | number | null>>[]
  readonly problems: readonly RowProblem[]
  /** Redovi koji su u celini prazni; ne broje se ni kao uvezeni ni kao greška. */
  readonly skippedEmpty: number
}

/**
 * Broj iz ćelije.
 *
 * Domaći izvozi pišu „1.234.567,89" — tačka za hiljade, zarez za decimale.
 * Engleski pišu obrnuto. Razlikuju se po tome KOJI znak stoji poslednji: on je
 * decimalni. Bez toga bi „1.234" postalo hiljadu dvesta trideset četiri ili
 * jedan cela dvesta trideset četiri, u zavisnosti od sreće.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (text === '' || text === '-') return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // Zarez je poslednji → zarez je decimalni znak, tačke su hiljade.
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = text.replace(/,/g, '')
  } else {
    normalized = text
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Prag ispod kojeg se broj tumači kao Excel-ov redni broj dana, ne kao godina. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const MAX_EXCEL_SERIAL = 60_000

/**
 * Datum iz ćelije.
 *
 * Prihvata ISO oblik, domaći „31.12.2025." i Excel-ov redni broj dana. Redni
 * broj se prepoznaje po tome što je go broj u opsegu koji odgovara datumima
 * između 1900. i otprilike 2064 — van tog opsega je verovatnije da je reč o
 * nečem drugom, pa se odbija umesto da se pogađa.
 *
 * Excel računa od 30. decembra 1899, a ne od 1. januara 1900, zbog poznate
 * greške u kojoj 1900. ima 29. februar. Pomeraj je ovde već uračunat.
 */
export function parseDate(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = text.slice(0, 10)
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso
  }

  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\.?$/)
  if (local) {
    const [, d, m, y] = local
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    // Provera da datum stvarno postoji: 31.02. bi se inače prelio u mart.
    if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null
    return date.toISOString().slice(0, 10)
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial > 0 && serial < MAX_EXCEL_SERIAL) {
      return new Date(EXCEL_EPOCH_MS + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
    }
  }

  return null
}

/** Najviše grešaka koje se prijavljuju. Spisak od hiljadu redova niko ne čita. */
export const MAX_REPORTED_PROBLEMS = 50

export function normalizeRows(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  kind: DatasetKind,
  /** Redova zaglavlja koje treba preskočiti, obično jedan. */
  headerRows = 1,
): NormalizedRows {
  const fields = FIELDS[kind]
  const out: Record<string, string | number | null>[] = []
  const problems: RowProblem[] = []
  let skippedEmpty = 0

  for (let i = headerRows; i < rows.length; i++) {
    const row = rows[i]!
    const lineNumber = i + 1

    // Prazan red je najčešće rep tabele ili razmak između sekcija, ne greška.
    if (row.every((cell) => cell.trim() === '')) {
      skippedEmpty++
      continue
    }

    const record: Record<string, string | number | null> = {}
    let usable = true

    for (const field of fields) {
      const index = mapping[field.key]
      if (index === undefined) {
        record[field.key] = null
        continue
      }

      const raw = (row[index] ?? '').trim()

      if (raw === '') {
        if (field.required) {
          usable = false
          if (problems.length < MAX_REPORTED_PROBLEMS) {
            problems.push({ row: lineNumber, field: field.key, key: 'import.error.emptyRequired', value: '' })
          }
        }
        record[field.key] = null
        continue
      }

      if (field.type === 'number') {
        const value = parseNumber(raw)
        if (value === null) {
          if (field.required) usable = false
          if (problems.length < MAX_REPORTED_PROBLEMS) {
            problems.push({ row: lineNumber, field: field.key, key: 'import.error.notANumber', value: raw.slice(0, 40) })
          }
          record[field.key] = null
        } else {
          record[field.key] = value
        }
        continue
      }

      if (field.type === 'date') {
        const value = parseDate(raw)
        if (value === null) {
          if (field.required) usable = false
          if (problems.length < MAX_REPORTED_PROBLEMS) {
            problems.push({ row: lineNumber, field: field.key, key: 'import.error.notADate', value: raw.slice(0, 40) })
          }
          record[field.key] = null
        } else {
          record[field.key] = value
        }
        continue
      }

      // Tekst se skraćuje, ne odbija: predugačak naziv je neuredan podatak, ne
      // neispravan, a odbijanje bi izgubilo ceo red zbog jedne kolone.
      record[field.key] = raw.slice(0, 200)
    }

    if (usable) out.push(record)
  }

  return { rows: out, problems, skippedEmpty }
}
