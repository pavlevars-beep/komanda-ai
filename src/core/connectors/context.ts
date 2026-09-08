import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import type { ConnectorContext, ImportedRows } from './types'

/**
 * Sastavljanje konteksta za poziv konektora.
 *
 * Postoji zato što je isti blok od petnaest linija stajao na šest mesta —
 * kartice, table, brif, pitanja, istorija i punjenje demo sadržaja. Šest
 * prepisanih blokova znači da se izmena mora setiti svih šest, a jedan
 * zaboravljen se ne vidi kao greška nego kao „ovaj ekran se ponaša drugačije".
 */

const TABLE_BY_KIND: Readonly<Record<string, string>> = {
  sales: 'imported_sales',
  receivables: 'imported_receivables',
  payables: 'imported_payables',
  stock: 'imported_stock',
}

/** Najviše redova koje jedan poziv sposobnosti čita. */
const MAX_ROWS = 100_000

/**
 * Čitanje uvezenih redova za jednu vrstu.
 *
 * Čita se SAMO iz skupa označenog kao spreman. Skup u toku upisa je nepotpun,
 * a nepotpun izvoz daje brojeve manje od stvarnih — što je gore od izostanka
 * brojeva, jer izgleda kao podatak.
 */
function importedReader(db: Db, organizationId: string, integrationId: string) {
  return async (kind: string): Promise<ImportedRows | null> => {
    const table = TABLE_BY_KIND[kind]
    if (!table) return null

    const { data: datasets, error: datasetError } = await db
      .from('imported_datasets')
      .select('id, data_as_of')
      .eq('organization_id', organizationId)
      .eq('integration_id', integrationId)
      .eq('kind', kind)
      .eq('status', 'ready')
      .limit(1)

    if (datasetError || !Array.isArray(datasets) || datasets.length === 0) return null

    const dataset = datasets[0] as { id?: unknown; data_as_of?: unknown }
    if (typeof dataset.id !== 'string') return null

    const { data, error } = await db
      .from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .eq('dataset_id', dataset.id)
      .limit(MAX_ROWS)

    if (error || !Array.isArray(data)) return null

    return {
      asOf: typeof dataset.data_as_of === 'string' ? dataset.data_as_of : null,
      rows: data as Readonly<Record<string, unknown>>[],
    }
  }
}

export interface ContextInput {
  readonly db: Db
  readonly ctx: OrgContext
  readonly integrationId: string
  readonly config?: Readonly<Record<string, unknown>>
  readonly isDemo?: boolean
}

export function connectorContext(input: ContextInput): Omit<ConnectorContext, 'signal'> {
  return {
    organizationId: input.ctx.organizationId,
    integrationId: input.integrationId,
    userId: input.ctx.userId,
    permissions: input.ctx.permissions,
    requestId: input.ctx.requestId,
    environment: 'sandbox',
    isDemo: input.isDemo ?? true,
    config: input.config ?? {},
    // Tajne se ovde ne dohvataju: konektori koji ih traže dobijaju sopstveni
    // kontekst iz sloja integracija, gde stoji pristup trezoru.
    secret: () => Promise.resolve(null),
    readImported: importedReader(input.db, input.ctx.organizationId, input.integrationId),
  }
}
