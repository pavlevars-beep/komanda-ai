import { inflateRawSync } from 'node:zlib'

/**
 * Minimalno čitanje ZIP arhive.
 *
 * `.xlsx` je ZIP sa XML-om unutra. Umesto biblioteke za tabele — koje su sve
 * redom velike i donose širok napadni prostor u proizvod koji rukuje tuđim
 * finansijskim podacima — ovde stoji čitač onog podskupa ZIP-a koji Excel
 * stvarno koristi: unosi bez kompresije i unosi sažeti algoritmom deflate,
 * koji Node ume da raspakuje ugrađenim `zlib`-om.
 *
 * Ne podržava šifrovane arhive, deljene arhive ni ZIP64. Sve troje se ovde
 * odbija sa jasnom porukom umesto da se tiho preskoči — fajl koji se otvara
 * „napola" gori je od fajla koji se ne otvori.
 */

const SIGNATURE_END_OF_DIRECTORY = 0x06054b50
const SIGNATURE_DIRECTORY_ENTRY = 0x02014b50
const SIGNATURE_LOCAL_HEADER = 0x04034b50

const METHOD_STORED = 0
const METHOD_DEFLATE = 8

export class ZipError extends Error {
  constructor(readonly key: string) {
    super(key)
    this.name = 'ZipError'
  }
}

/**
 * Pronalazi zapis o kraju centralnog direktorijuma.
 *
 * Traži se OD KRAJA, jer se iza tog zapisa može nalaziti komentar promenljive
 * dužine. Pretraga se ograničava na poslednjih 64 KB — to je najveći mogući
 * komentar, pa dalje traženje ne bi ništa našlo a na velikom fajlu bi koštalo.
 */
function findEndOfDirectory(bytes: Buffer): number {
  const start = Math.max(0, bytes.length - 65_557)
  for (let i = bytes.length - 22; i >= start; i--) {
    if (bytes.readUInt32LE(i) === SIGNATURE_END_OF_DIRECTORY) return i
  }
  throw new ZipError('import.error.notAZip')
}

export interface ZipEntry {
  readonly name: string
  readonly offset: number
  readonly method: number
  readonly compressedSize: number
  readonly uncompressedSize: number
}

export function listEntries(bytes: Buffer): readonly ZipEntry[] {
  const end = findEndOfDirectory(bytes)
  const count = bytes.readUInt16LE(end + 10)
  let offset = bytes.readUInt32LE(end + 16)

  // 0xffffffff u polju za pomeraj znači da je arhiva u ZIP64 obliku.
  if (offset === 0xffffffff) throw new ZipError('import.error.zip64')

  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(offset) !== SIGNATURE_DIRECTORY_ENTRY) {
      throw new ZipError('import.error.corruptZip')
    }

    const flags = bytes.readUInt16LE(offset + 8)
    // Bit 0 označava šifrovan unos. Takav fajl se ne može pročitati bez
    // lozinke, a lozinku ovde niko ne unosi.
    if ((flags & 0x1) !== 0) throw new ZipError('import.error.encrypted')

    const method = bytes.readUInt16LE(offset + 10)
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const localOffset = bytes.readUInt32LE(offset + 42)

    entries.push({
      name: bytes.toString('utf8', offset + 46, offset + 46 + nameLength),
      offset: localOffset,
      method,
      compressedSize,
      uncompressedSize,
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Najveći raspakovan unos. Sprečava da mala arhiva raspakivanjem pojede memoriju. */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024

export function readEntry(bytes: Buffer, entry: ZipEntry): Buffer {
  if (bytes.readUInt32LE(entry.offset) !== SIGNATURE_LOCAL_HEADER) {
    throw new ZipError('import.error.corruptZip')
  }
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new ZipError('import.error.tooLarge')
  }

  /*
   * Dužine imena i dodatnog polja se čitaju iz LOKALNOG zaglavlja, ne iz
   * centralnog direktorijuma. Ta dva se po standardu smeju razlikovati, i kod
   * fajlova iz nekih alata se stvarno razlikuju — čitanje iz pogrešnog daje
   * pomeraj koji promaši početak podataka za nekoliko bajtova.
   */
  const nameLength = bytes.readUInt16LE(entry.offset + 26)
  const extraLength = bytes.readUInt16LE(entry.offset + 28)
  const start = entry.offset + 30 + nameLength + extraLength
  const chunk = bytes.subarray(start, start + entry.compressedSize)

  if (entry.method === METHOD_STORED) return Buffer.from(chunk)
  if (entry.method !== METHOD_DEFLATE) throw new ZipError('import.error.unsupportedZip')

  try {
    return inflateRawSync(chunk, { maxOutputLength: MAX_ENTRY_BYTES })
  } catch {
    throw new ZipError('import.error.corruptZip')
  }
}

/** Sadržaj unosa po imenu, ili `null` kada ga u arhivi nema. */
export function readNamed(bytes: Buffer, name: string): Buffer | null {
  const entry = listEntries(bytes).find((e) => e.name === name)
  return entry ? readEntry(bytes, entry) : null
}
