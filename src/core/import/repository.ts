import { createHash } from 'node:crypto'
import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { ColumnMapping, DatasetKind } from './mapping'
import type { RowProblem } from './normalize'

/**
 * Uvezene tabele.
 *
 * Redovi se upisuju u TIPIZOVANE kolone, ne u jsonb: zbir i grupisanje po
 * datumu tako radi baza, a nad jsonb-om bi svaki upit izvlačio i pretvarao
 * vrednost pri svakom redu.
 */

const TABLE_BY_KIND: Record<DatasetKind, string> = {
  sales: 'imported_sales',
  receivables: 'imported_receivables',
  payables: 'imported_payables',
  stock: 'imported_stock',
}

/** Naziv polja u našem modelu → naziv kolone u bazi. */
const COLUMN_BY_FIELD: Record<DatasetKind, Readonly<Record<string, string>>> = {
  sales: {
    date: 'doc_date',
    amount: 'amount',
    customer: 'customer',
    product: 'product',
    category: 'category',
  },
  receivables: {
    customer: 'customer',
    amount: 'amount',
    dueDate: 'due_date',
    invoiceNumber: 'invoice_number',
  },
  payables: { supplier: 'supplier', amount: 'amount', dueDate: 'due_date' },
  stock: {
    item: 'item',
    onHand: 'on_hand',
    minimum: 'minimum',
    averageDailySales: 'average_daily_sales',
    leadTimeDays: 'lead_time_days',
  },
}

const datasetRow = z.object({
  id: uuid(),
  kind: z.string(),
  status: z.enum(['pending', 'ready', 'failed', 'superseded']),
  file_name: z.string(),
  row_count: z.number().int(),
  problem_count: z.number().int(),
  problems: z.array(z.unknown()),
  mapping: z.record(z.string(), z.number()),
  data_as_of: z.string().nullable(),
  imported_at: z.string(),
})

export type StoredDataset = z.infer<typeof datasetRow>

export async function listDatasets(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Result<StoredDataset[]>> {
  const { data, error } = await db
    .from('imported_datasets')
    .select(
      'id, kind, status, file_name, row_count, problem_count, problems, mapping, data_as_of, imported_at',
    )
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .order('imported_at', { ascending: false })
    .limit(50)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(datasetRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export interface SaveInput {
  readonly organizationId: string
  readonly integrationId: string
  readonly kind: DatasetKind
  readonly filePath: string
  readonly fileName: string
  readonly fileSize: number
  readonly mapping: ColumnMapping
  readonly currency: string
  readonly rows: readonly Readonly<Record<string, string | number | null>>[]
  readonly problems: readonly RowProblem[]
  readonly importedBy: string
  /** SHA-256 sadržaja fajla — po njemu se prepoznaje ponovo poslata ista tabela. */
  readonly contentHash: string
}

/** Koliko redova ide u jednom upisu. Ceo niz od sto hiljada redova ruši zahtev. */
const CHUNK = 1_000

/**
 * Upis uvezenog skupa.
 *
 * Redosled je namerno ovakav: prvo se skup upiše kao `pending`, pa redovi, pa
 * se tek na kraju prebacuje u `ready` — i tek tada prethodni prelazi u
 * `superseded`.
 *
 * Da se prethodni sklanja odmah, prekid usred upisa ostavio bi klijenta BEZ
 * ijednog skupa: stari sklonjen, novi nepotpun. Ovako u najgorem slučaju
 * ostaje nedovršen `pending` koji niko ne čita, a stari nastavlja da radi.
 */
export async function saveDataset(db: Db, input: SaveInput): Promise<Result<string>> {
  const { data, error } = await db
    .from('imported_datasets')
    .insert({
      organization_id: input.organizationId,
      integration_id: input.integrationId,
      kind: input.kind,
      status: 'pending',
      file_path: input.filePath,
      file_name: input.fileName,
      file_size: input.fileSize,
      mapping: input.mapping,
      row_count: input.rows.length,
      problem_count: input.problems.length,
      problems: input.problems.slice(0, 20),
      imported_by: input.importedBy,
      content_hash: input.contentHash,
    })
    .select('id')
    .single()

  if (error) {
    return err(domainError('forbidden', 'import.error.saveFailed', { detail: error.message }))
  }

  const parsed = z.object({ id: uuid() }).safeParse(data)
  if (!parsed.success) {
    return err(domainError('internal', 'error.internal', { detail: 'imported_datasets.id' }))
  }
  const datasetId = parsed.data.id

  const columns = COLUMN_BY_FIELD[input.kind]
  const table = TABLE_BY_KIND[input.kind]

  const records = input.rows.map((row) => {
    const record: Record<string, unknown> = {
      organization_id: input.organizationId,
      dataset_id: datasetId,
    }
    for (const [field, column] of Object.entries(columns)) {
      if (row[field] !== undefined && row[field] !== null) record[column] = row[field]
    }
    // Valuta se ne čita iz tabele nego iz podešavanja organizacije: kolona sa
    // valutom je retka, a mešane valute u jednom izvozu su još ređe.
    if (input.kind !== 'stock') record.currency = input.currency
    return record
  })

  for (let i = 0; i < records.length; i += CHUNK) {
    const { error: rowError } = await db.from(table).insert(records.slice(i, i + CHUNK))
    if (rowError) {
      // Nedovršen skup ostaje kao `failed`, sa razlogom — ne briše se, jer je
      // trag pokušaja ono što se pri istrazi prvo traži.
      await db
        .from('imported_datasets')
        .update({ status: 'failed' })
        .eq('id', datasetId)
        .eq('organization_id', input.organizationId)

      return err(
        domainError('internal', 'import.error.saveFailed', { detail: rowError.message }),
      )
    }
  }

  // Stari skup iste vrste se sklanja TEK sada, pa novi postaje spreman.
  await db
    .from('imported_datasets')
    .update({ status: 'superseded' })
    .eq('organization_id', input.organizationId)
    .eq('integration_id', input.integrationId)
    .eq('kind', input.kind)
    .eq('status', 'ready')

  const { error: readyError } = await db
    .from('imported_datasets')
    .update({ status: 'ready', data_as_of: new Date().toISOString() })
    .eq('id', datasetId)
    .eq('organization_id', input.organizationId)

  if (readyError) {
    return err(domainError('internal', 'import.error.saveFailed', { detail: readyError.message }))
  }

  return ok(datasetId)
}

export interface ReadyDataset {
  readonly id: string
  readonly kind: DatasetKind
  readonly importedAt: string
  readonly dataAsOf: string | null
  readonly rowCount: number
}

/** Spremni skupovi po vrsti — ono što konektor stvarno čita. */
export async function readyDatasets(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Map<DatasetKind, ReadyDataset>> {
  const { data, error } = await db
    .from('imported_datasets')
    .select('id, kind, imported_at, data_as_of, row_count')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('status', 'ready')

  if (error) return new Map()

  const rows = z
    .array(
      z.object({
        id: uuid(),
        kind: z.enum(['sales', 'receivables', 'payables', 'stock']),
        imported_at: z.string(),
        data_as_of: z.string().nullable(),
        row_count: z.number().int(),
      }),
    )
    .safeParse(data)

  if (!rows.success) return new Map()

  return new Map(
    rows.data.map((r) => [
      r.kind,
      {
        id: r.id,
        kind: r.kind,
        importedAt: r.imported_at,
        dataAsOf: r.data_as_of,
        rowCount: r.row_count,
      },
    ]),
  )
}

/**
 * Otisak sadržaja fajla.
 *
 * Računa se nad BAJTOVIMA, ne nad pročitanim redovima. Isti podaci sačuvani
 * ponovo iz Excel-a daju drugačije bajtove (menja se vreme izmene unutar
 * arhive), pa otisak neće prepoznati takav fajl kao isti — i to je ispravno:
 * tada je izvoz stvarno ponovo pokrenut. Prepoznaje se tačno ono što jeste
 * isti fajl poslat dvaput.
 */
export function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export interface ActiveDataset {
  readonly id: string
  readonly fileName: string
  readonly importedAt: string
  readonly seenCount: number
}

/**
 * Aktivan skup iste vrste, ako mu je sadržaj identičan.
 *
 * Poredi se samo sa `ready` skupom — onim koji se trenutno čita. Poklapanje sa
 * ranije zamenjenim skupom je vraćanje na stariji fajl, što ume da bude i
 * namerno (ispravka pa povratak), pa se ne blokira.
 */
export async function findActiveByHash(
  db: Db,
  organizationId: string,
  integrationId: string,
  kind: DatasetKind,
  hash: string,
): Promise<ActiveDataset | null> {
  const { data, error } = await db
    .from('imported_datasets')
    .select('id, file_name, imported_at, seen_count')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('kind', kind)
    .eq('status', 'ready')
    .eq('content_hash', hash)
    .limit(1)

  if (error) return null

  const rows = z
    .array(
      z.object({
        id: uuid(),
        file_name: z.string(),
        imported_at: z.string(),
        seen_count: z.number().int(),
      }),
    )
    .safeParse(data)

  const row = rows.success ? rows.data[0] : undefined
  if (!row) return null

  return {
    id: row.id,
    fileName: row.file_name,
    importedAt: row.imported_at,
    seenCount: row.seen_count,
  }
}

/**
 * Beleženje da je ista tabela poslata ponovo.
 *
 * Pokušaj se NE odbacuje ćutke. „Klijent svaki dan šalje istu tabelu" je nalaz
 * koji objašnjava zašto alarm na tišinu i dalje stoji iako neko svakodnevno
 * nešto otprema — bez ovog traga bi ta dva podatka izgledala protivrečno.
 *
 * Brojač je OKVIRAN, ne tačan: čita se pa upisuje, pa bi dva istovremena
 * otpremanja istog fajla upisala istu vrednost. Tačan brojač bi tražio
 * funkciju u bazi, a razlika između „poslato 7 puta" i „poslato 8 puta" ne
 * menja nijednu odluku. Vreme poslednjeg slanja, koje i jeste poenta, ostaje
 * tačno u svakom slučaju.
 */
export async function recordResubmission(
  db: Db,
  organizationId: string,
  datasetId: string,
  seenCount: number,
  now = new Date(),
): Promise<void> {
  await db
    .from('imported_datasets')
    .update({ last_seen_at: now.toISOString(), seen_count: seenCount + 1 })
    .eq('organization_id', organizationId)
    .eq('id', datasetId)
}

// ---------------------------------------------------------------------------
// Zapamćeno mapiranje kolona
// ---------------------------------------------------------------------------

const mappingRow = z.object({
  mapping: z.record(z.string(), z.number()),
  headers: z.array(z.string()),
  confirmed_at: z.string(),
})

export type StoredMapping = z.infer<typeof mappingRow>

export async function getStoredMapping(
  db: Db,
  organizationId: string,
  integrationId: string,
  kind: DatasetKind,
): Promise<StoredMapping | null> {
  const { data, error } = await db
    .from('import_mappings')
    .select('mapping, headers, confirmed_at')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('kind', kind)
    .maybeSingle()

  if (error) return null

  const parsed = mappingRow.safeParse(data)
  return parsed.success ? parsed.data : null
}

/**
 * Pamćenje potvrđenog mapiranja.
 *
 * Pamti se TEK po uspešnom uvozu, i pamti se ono što je čovek potvrdio — ne
 * ono što je sistem predložio. Zapamćen predlog koji niko nije pogledao bi
 * sledeći put prošao bez pitanja, sa greškom u sebi.
 */
export async function rememberMapping(
  db: Db,
  input: {
    readonly organizationId: string
    readonly integrationId: string
    readonly kind: DatasetKind
    readonly mapping: ColumnMapping
    readonly headers: readonly string[]
    readonly userId: string
  },
): Promise<void> {
  await db.from('import_mappings').upsert(
    {
      organization_id: input.organizationId,
      integration_id: input.integrationId,
      kind: input.kind,
      mapping: input.mapping,
      headers: [...input.headers],
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.userId,
    },
    { onConflict: 'integration_id,kind' },
  )
}
