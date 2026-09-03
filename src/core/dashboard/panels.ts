import { z } from 'zod'
import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import type { Provenance } from '../shared/provenance'

/**
 * Liste za radni prostor — dužnici i zalihe.
 *
 * Kartice odgovaraju na „koliko", tabele na „ko" i „šta". Direktor prvo vidi
 * broj, pa odmah pita ko duguje — bez toga je pregled nepotpun i razgovor se
 * prekida na prvom pitanju.
 *
 * Ide kroz ISTI runner kao kartice: ista provera permisije, isti timeout, ista
 * validacija izlaza i isti podatak o poreklu. Zaobići ga značilo bi napraviti
 * drugi put do podataka klijenta, sa sopstvenim propustima.
 */

const PANEL_TIMEOUT_MS = 8_000

export type PanelUnavailable =
  | 'no_integration'
  | 'connector_missing'
  | 'no_permission'
  | 'capability_disabled'
  | 'integration_down'

export interface Panel<T> {
  readonly rows: readonly T[]
  readonly provenance?: Provenance
  readonly unavailable?: PanelUnavailable
}

const debtorRow = z.object({
  customer: z.string(),
  amount: z.string(),
  currency: z.string(),
  invoiceCount: z.number().int(),
  oldestOverdueDays: z.number().int(),
})

const inventoryRow = z.object({
  item: z.string(),
  onHand: z.number(),
  minimum: z.number(),
  daysOfCover: z.number(),
})

const payableRow = z.object({
  supplier: z.string(),
  amount: z.string(),
  currency: z.string(),
  dueDate: z.string(),
  daysUntilDue: z.number().int(),
})

export type Debtor = z.infer<typeof debtorRow>
export type InventoryRow = z.infer<typeof inventoryRow>
export type Payable = z.infer<typeof payableRow>

async function loadPanel<T>(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  capabilityKey: string,
  schema: z.ZodType<T>,
): Promise<Panel<T>> {
  if (!integrationId || !connectorType) return { rows: [], unavailable: 'no_integration' }

  const connector = getConnector(connectorType)
  if (!connector) return { rows: [], unavailable: 'connector_missing' }

  const enabled = await listEnabledCapabilities(db, ctx.organizationId, integrationId)
  if (!enabled.ok) return { rows: [], unavailable: 'integration_down' }

  const result = await runCapability({
    connector,
    capabilityKey,
    input: {},
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: PANEL_TIMEOUT_MS,
    ctx: {
      organizationId: ctx.organizationId,
      integrationId,
      userId: ctx.userId,
      permissions: ctx.permissions,
      requestId: ctx.requestId,
      environment: 'sandbox',
      isDemo: true,
      config: {},
      secret: () => Promise.resolve(null),
    },
  })

  if (!result.ok) {
    const unavailable: PanelUnavailable =
      result.error.code === 'forbidden'
        ? 'no_permission'
        : result.error.code === 'capability_disabled'
          ? 'capability_disabled'
          : 'integration_down'
    return { rows: [], unavailable }
  }

  const data = result.value.data as { items?: unknown }
  const rows = z.array(schema).safeParse(data.items ?? [])

  // Neispravan oblik NE prikazuje praznu tabelu kao da nema podataka —
  // razlika između „nema dugovanja" i „ne mogu da pročitam" je poslovno
  // ozbiljna.
  if (!rows.success) return { rows: [], unavailable: 'integration_down' }

  return { rows: rows.data, provenance: result.value.provenance }
}

export interface WorkspacePanels {
  readonly debtors: Panel<Debtor>
  readonly inventory: Panel<InventoryRow>
  readonly payables: Panel<Payable>
}

/**
 * Sve tri liste odjednom.
 *
 * Integracija se bira iz kartica koje su već učitane — panel ne sme da sam
 * traži „bilo koju" integraciju organizacije, jer bi tada prikazivao podatke
 * iz izvora koji konsultant nije namenio početnoj strani.
 */
export async function loadPanels(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
): Promise<WorkspacePanels> {
  const [debtors, inventory, payables] = await Promise.all([
    loadPanel(db, ctx, integrationId, connectorType, 'get_top_debtors', debtorRow),
    loadPanel(db, ctx, integrationId, connectorType, 'get_inventory_alerts', inventoryRow),
    loadPanel(db, ctx, integrationId, connectorType, 'get_payables', payableRow),
  ])

  return { debtors, inventory, payables }
}
