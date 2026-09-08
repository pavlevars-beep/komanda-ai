import { listEntries, readEntry, readNamed, ZipError } from './zip'

/**
 * Čitanje `.xlsx` tabele.
 *
 * Podržan je onaj podskup koji Excel, LibreOffice i izvozi iz ERP-a stvarno
 * proizvode: deljena tabela stringova, ugrađeni stringovi, brojevi i formule
 * sa keširanom vrednošću.
 *
 * Ne tumači se stil ćelije. Datum je u `.xlsx` obično broj dana od 1899, a šta
 * je datum a šta iznos zna se tek iz stila — pa bi pogrešno pročitan stil
 * pretvorio iznos u datum iz 1900. Umesto toga se broj vraća kao broj, a koja
 * kolona je datum kaže MAPIRANJE, gde to čovek potvrđuje.
 */

/** Raspakuje XML entitete. Redosled je bitan: `&amp;` ide poslednji. */
function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * Tekst jednog `<si>` unosa iz deljene tabele.
 *
 * Unos može da bude razbijen na više `<t>` delova kada je deo teksta drugačije
 * oblikovan. Delovi se spajaju — inače bi ćelija „Market Lazić d.o.o." u kojoj
 * je „d.o.o." podebljano vratila samo prvi deo.
 */
function sharedStringText(block: string): string {
  const parts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '')
  return decodeXml(parts.join(''))
}

function parseSharedStrings(xml: string): readonly string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => sharedStringText(m[1] ?? ''))
}

/** Slovni deo oznake ćelije („BC12" → 54, nulom počev). */
export function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A'
  let index = 0
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

export interface Sheet {
  readonly name: string
  /** Redovi kao tekst; prazne ćelije su prazan string. */
  readonly rows: readonly (readonly string[])[]
}

function parseSheet(xml: string, shared: readonly string[]): readonly (readonly string[])[] {
  const rows: string[][] = []

  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []

    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1] ?? ''
      const body = cellMatch[2] ?? ''
      const reference = attributes.match(/r="([A-Z]+\d+)"/)?.[1]
      const type = attributes.match(/t="([^"]+)"/)?.[1]

      let value = ''
      if (type === 'inlineStr') {
        value = sharedStringText(body)
      } else {
        const raw = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')
        if (type === 's') {
          // Indeks van opsega znači neusklađenu deljenu tabelu; prazno je
          // pošteniji ishod od nasumičnog tuđeg teksta.
          value = shared[Number(raw)] ?? ''
        } else {
          value = raw
        }
      }

      /*
       * Prazne ćelije se u `.xlsx` jednostavno IZOSTAVE, pa se položaj čita iz
       * oznake ćelije. Bez toga bi red sa rupom pomerio sve vrednosti ulevo i
       * poravnanje sa zaglavljem bi se raspalo — a to se na ekranu vidi tek
       * kao „iznosi su u pogrešnoj koloni".
       */
      const index = reference ? columnIndex(reference) : cells.length
      while (cells.length < index) cells.push('')
      cells[index] = value
    }

    rows.push(cells)
  }

  return rows
}

/**
 * Prvi list radne sveske.
 *
 * Uzima se PRVI po redosledu u svesci, ne po nazivu fajla: `sheet1.xml` nije
 * nužno prvi list koji korisnik vidi, jer se listovi pri premeštanju ne
 * preimenuju.
 */
export function readXlsx(bytes: Buffer): Sheet {
  const workbook = readNamed(bytes, 'xl/workbook.xml')?.toString('utf8')
  if (!workbook) throw new ZipError('import.error.notASpreadsheet')

  const firstSheet = workbook.match(/<sheet\b[^>]*\/>/)?.[0] ?? ''
  const name = decodeXml(firstSheet.match(/name="([^"]*)"/)?.[1] ?? 'Sheet1')
  const relationshipId = firstSheet.match(/r:id="([^"]*)"/)?.[1]

  const rels = readNamed(bytes, 'xl/_rels/workbook.xml.rels')?.toString('utf8') ?? ''
  const target = relationshipId
    ? rels
        .match(new RegExp(`<Relationship[^>]*Id="${relationshipId}"[^>]*>`))?.[0]
        ?.match(/Target="([^"]*)"/)?.[1]
    : undefined

  const path = target
    ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`
    : 'xl/worksheets/sheet1.xml'

  const entries = listEntries(bytes)
  const entry =
    entries.find((e) => e.name === path) ??
    // Rezerva: prvi list koji uopšte postoji, ako veza ne vodi nikuda.
    entries.find((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name))

  if (!entry) throw new ZipError('import.error.notASpreadsheet')

  const shared = parseSharedStrings(
    readNamed(bytes, 'xl/sharedStrings.xml')?.toString('utf8') ?? '',
  )

  return { name, rows: parseSheet(readEntry(bytes, entry).toString('utf8'), shared) }
}
