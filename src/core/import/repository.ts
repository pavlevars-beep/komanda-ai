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
