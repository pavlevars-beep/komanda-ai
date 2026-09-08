/**
 * Mapiranje kolona iz tuđe tabele na naš model.
 *
 * Nijedna firma ne zove kolone isto. „Iznos", „Vrednost", „Ukupno", „Amount",
 * „Bruto" — sve je isto polje. Zato mapiranje nije pogađanje nego PREDLOG koji
 * čovek potvrđuje: sistem predloži ono što prepozna, konsultant ispravi, i tek
 * onda se čita.
 *
 * Potvrđeno mapiranje se pamti uz integraciju, pa sledeći izvoz iste tabele
 * prolazi bez ponovnog rada.
 */

export type DatasetKind = 'sales' | 'receivables' | 'payables' | 'stock'

export const DATASET_KINDS: readonly DatasetKind[] = [
  'sales',
  'receivables',
  'payables',
  'stock',
]

export interface FieldSpec {
  readonly key: string
  readonly type: 'date' | 'number' | 'text'
  /** Bez ovog polja skup podataka nema smisla i uvoz se odbija. */
  readonly required: boolean
  /**
   * Reči po kojima se kolona prepoznaje. Bez dijakritika, mala slova.
   *
   * Pišu se kao OSNOVA, ne kao pun oblik: „faktur" hvata i „faktura" i „broj
   * fakture" i „fakturi". Pun oblik promašuje svaki padež osim jednog — a u
   * zaglavljima domaćih izvoza retko stoji nominativ.
   */
  readonly hints: readonly string[]
}

/**
 * Polja po vrsti skupa.
 *
 * Namerno mali skup — samo ono što neka sposobnost stvarno koristi. Polje koje
 * niko ne čita je posao za konsultanta pri svakom uvozu, bez ijedne koristi.
 */
export const FIELDS: Record<DatasetKind, readonly FieldSpec[]> = {
  sales: [
    { key: 'date', type: 'date', required: true, hints: ['datum', 'date', 'dan', 'period'] },
    { key: 'amount', type: 'number', required: true, hints: ['iznos', 'vrednost', 'ukupno', 'amount', 'total', 'bruto', 'promet'] },
    { key: 'customer', type: 'text', required: false, hints: ['kupac', 'kupc', 'klijent', 'customer', 'partner', 'naziv'] },
    { key: 'product', type: 'text', required: false, hints: ['artik', 'proizvod', 'product', 'item', 'roba'] },
    { key: 'category', type: 'text', required: false, hints: ['kategorija', 'grupa', 'category', 'group'] },
  ],
  receivables: [
    { key: 'customer', type: 'text', required: true, hints: ['kupac', 'kupc', 'klijent', 'customer', 'partner', 'duznik', 'naziv'] },
    { key: 'amount', type: 'number', required: true, hints: ['iznos', 'dug', 'saldo', 'amount', 'balance', 'potrazivanj'] },
    { key: 'dueDate', type: 'date', required: true, hints: ['dospec', 'dospev', 'valuta', 'rok', 'due', 'datum'] },
    // „broj" namerno NIJE trag: hvata i „broj dana" i „broj komada".
    { key: 'invoiceNumber', type: 'text', required: false, hints: ['faktur', 'racun', 'invoice', 'dokument'] },
  ],
  payables: [
    { key: 'supplier', type: 'text', required: true, hints: ['dobavljac', 'supplier', 'vendor', 'partner', 'naziv'] },
    { key: 'amount', type: 'number', required: true, hints: ['iznos', 'obavez', 'saldo', 'amount', 'dug'] },
    { key: 'dueDate', type: 'date', required: true, hints: ['dospec', 'dospev', 'valuta', 'rok', 'due', 'datum'] },
  ],
  stock: [
    { key: 'item', type: 'text', required: true, hints: ['artik', 'proizvod', 'naziv', 'item', 'product', 'roba'] },
    { key: 'onHand', type: 'number', required: true, hints: ['stanje', 'kolicin', 'zalih', 'on hand', 'quantity', 'raspoloziv'] },
    { key: 'averageDailySales', type: 'number', required: false, hints: ['prosek', 'prosecn', 'dnevn', 'potrosnj', 'daily', 'average', 'obrt'] },
    { key: 'minimum', type: 'number', required: false, hints: ['minimum', 'minimaln', 'signaln'] },
    { key: 'leadTimeDays', type: 'number', required: false, hints: ['rok isporuke', 'isporuk', 'lead', 'nabavk'] },
  ],
}

/** Isto svođenje kao kod prepoznavanja pitanja — ćirilica i dijakritici ne smeju da odlučuju. */
const CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
}

export function normalizeHeader(value: string): string {
  const latin = [...value.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join('')
  return latin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'dj')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mapiranje: naziv polja → indeks kolone u tabeli. */
export type ColumnMapping = Readonly<Record<string, number>>

/**
 * Predlog mapiranja iz zaglavlja.
 *
 * Kolona se dodeljuje NAJVIŠE JEDNOM polju. Bez toga bi kolona „Datum" u
 * potraživanjima pokrila i `dueDate`, pa bi svaka faktura dospevala na dan
 * izdavanja — greška koja se ne vidi kao greška nego kao „sve kasni".
 *
 * Poklapanje celom reči je jače od poklapanja delom, jer „broj dana" ne treba
 * da pobedi „broj fakture" samo zato što se pojavljuje ranije u tabeli.
 */
export function suggestMapping(
  headers: readonly string[],
  kind: DatasetKind,
): ColumnMapping {
  const normalized = headers.map(normalizeHeader)
  const taken = new Set<number>()
  const mapping: Record<string, number> = {}

  for (const field of FIELDS[kind]) {
    let bestIndex = -1
    let bestScore = 0

    for (let i = 0; i < normalized.length; i++) {
      if (taken.has(i)) continue
      const header = normalized[i]!
      if (header === '') continue

      for (const hint of field.hints) {
        const base = header === hint ? 3 : header.split(' ').includes(hint) ? 2 : header.includes(hint) ? 1 : 0
        if (base === 0) continue

        /*
         * Pri jednakoj vrsti poklapanja pobeđuje DUŽI trag.
         *
         * „Rok isporuke" i „Rok" oba sadrže „rok"; duži trag znači precizniji
         * pogodak, pa se dužina koristi kao razrešenje neodlučenog.
         */
        const score = base * 100 + hint.length
        if (score > bestScore) {
          bestScore = score
          bestIndex = i
        }
      }
    }

    if (bestIndex >= 0) {
      mapping[field.key] = bestIndex
      taken.add(bestIndex)
    }
  }

  return mapping
}

export interface MappingProblem {
  readonly field: string
  readonly key: string
}

/**
 * Provera mapiranja pre uvoza.
 *
 * Obavezno polje bez kolone i dve iste kolone su različite greške i tako se i
 * prijavljuju. Uvoz sa nepotpunim mapiranjem bi upisao redove koji se ne mogu
 * upotrebiti, a to se otkriva tek kad tabla ostane prazna.
 */
export function validateMapping(
  mapping: ColumnMapping,
  kind: DatasetKind,
  columnCount: number,
): readonly MappingProblem[] {
  const problems: MappingProblem[] = []
  const used = new Map<number, string>()

  for (const field of FIELDS[kind]) {
    const index = mapping[field.key]

    if (index === undefined) {
      if (field.required) problems.push({ field: field.key, key: 'import.error.fieldMissing' })
      continue
    }

    if (!Number.isInteger(index) || index < 0 || index >= columnCount) {
      problems.push({ field: field.key, key: 'import.error.columnOutOfRange' })
      continue
    }

    const previous = used.get(index)
    if (previous !== undefined) {
      problems.push({ field: field.key, key: 'import.error.columnReused' })
      continue
    }
    used.set(index, field.key)
  }

  return problems
}
