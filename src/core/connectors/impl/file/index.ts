import { z } from 'zod'
import type {
  CapabilityDescriptor,
  CapabilityResult,
  Connector,
  ConnectorContext,
  HealthResult,
  ImportedRows,
} from '../../types'
import { ok, err, domainError, type Result } from '../../../shared/result'
import type { Provenance } from '../../../shared/provenance'
import {
  aging,
  dailySeries,
  monthlyHistory,
  outstanding,
  payablesFrom,
  salesSummaryFrom,
  stockFrom,
  topDebtorsFrom,
  type PayableRow,
  type ReceivableRow,
  type SaleRow,
  type StockRow,
} from './shape'

/**
 * Konektor nad otpremljenom tabelom.
 *
 * Ovo je jedini put do stvarnih podataka klijenta koji ne zavisi ni od koga:
 * ne traži API, ne traži pristup bazi ERP-a, ne traži saglasnost dobavljača.
 * Firma izveze ono što ionako svakodnevno izvozi, i alat radi.
 *
 * Izlaže ISTE sposobnosti kao demo konektor, sa istim oblikom odgovora. Zbog
 * toga se tabla, brif i pitanja ne menjaju ni jednom linijom kada klijent
 * pređe sa demo podataka na svoje — a to je i bio smisao apstrakcije konektora.
 *
 * Podaci se ne parsiraju ovde. Tabela je normalizovana pri uvozu; ovde se
 * samo čitaju redovi i sabiraju.
 */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'connector.error.invalidDate')

const salesPeriod = z.object({
  total: z.string(),
  previousTotal: z.string(),
  changePercent: z.number(),
})

const CAPABILITIES = [
  {
    key: 'get_sales_summary',
    mode: 'read',
    requiredPermission: 'view_sales',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      currency: z.string(),
      asOf: z.string(),
      yesterday: salesPeriod,
      last7Days: salesPeriod,
      monthToDate: salesPeriod,
    }),
  },
  {
    key: 'get_sales_daily',
    mode: 'read',
    requiredPermission: 'view_sales',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({ days: z.number().int().min(1).max(90) }),
    outputSchema: z.object({
      currency: z.string(),
      days: z.array(z.object({ date: z.string(), total: z.string() })),
    }),
  },
  {
    key: 'get_sales_history',
    mode: 'read',
    requiredPermission: 'view_sales',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({ years: z.number().int().min(1).max(10) }),
    outputSchema: z.object({
      currency: z.string(),
      months: z.array(z.object({ month: z.string(), total: z.string() })),
    }),
  },
  {
    key: 'get_daily_sales',
    mode: 'read',
    requiredPermission: 'view_sales',
    // Zbir jednog dana iz uvezenih stavki — izvedeno, ne prepisano.
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({ date: dateOnly }),
    outputSchema: z.object({
      date: z.string(),
      total: z.string(),
      currency: z.string(),
      orderCount: z.number().int(),
    }),
  },
  {
    key: 'get_receivables_aging',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      total: z.string(),
      overdue: z.string(),
      currency: z.string(),
      asOf: z.string(),
      buckets: z.array(
        z.object({
          fromDays: z.number().int(),
          toDays: z.number().int().nullable(),
          amount: z.string(),
          invoiceCount: z.number().int(),
        }),
      ),
    }),
  },
  {
    key: 'get_top_debtors',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      total: z.string(),
      currency: z.string(),
      items: z.array(
        z.object({
          customer: z.string(),
          amount: z.string(),
          currency: z.string(),
          invoiceCount: z.number().int(),
          oldestOverdueDays: z.number().int(),
        }),
      ),
    }),
  },
  {
    key: 'get_outstanding_invoices',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'fact',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({ overdueDays: z.number().int().min(0).max(365) }),
    outputSchema: z.object({
      items: z.array(
        z.object({
          invoiceNumber: z.string(),
          customer: z.string(),
          amount: z.string(),
          currency: z.string(),
          dueDate: z.string(),
          overdueDays: z.number().int(),
        }),
      ),
      total: z.string(),
      currency: z.string(),
    }),
  },
  {
    key: 'get_payables',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'fact',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      total: z.string(),
      dueWithin7Days: z.string(),
      currency: z.string(),
      items: z.array(
        z.object({
          supplier: z.string(),
          amount: z.string(),
          currency: z.string(),
          dueDate: z.string(),
          daysUntilDue: z.number().int(),
        }),
      ),
    }),
  },
  {
    key: 'get_stock_status',
    mode: 'read',
    requiredPermission: 'view_inventory',
    classification: 'calculation',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      items: z.array(
        z.object({
          item: z.string(),
          onHand: z.number(),
          minimum: z.number(),
          averageDailySales: z.number(),
          daysOfCover: z.number(),
          leadTimeDays: z.number().int(),
        }),
      ),
    }),
  },
  {
    key: 'get_inventory_alerts',
    mode: 'read',
    requiredPermission: 'view_inventory',
    classification: 'fact',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      items: z.array(
        z.object({
          item: z.string(),
          onHand: z.number().int(),
          minimum: z.number().int(),
          daysOfCover: z.number().int(),
        }),
      ),
    }),
  },
] as const satisfies readonly CapabilityDescriptor[]

/** Valuta iz konfiguracije integracije; podrazumevano dinar. */
function currencyOf(ctx: ConnectorContext): string {
  const value = ctx.config.currency
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : 'RSD'
}

/**
 * Poreklo nosi vreme na koje se UVOZ odnosi, ne trenutak poziva.
 *
 * Tabla koja piše „očitano pre 12 s" nad izvozom od prošle nedelje je tačna u
 * pogledu čitanja i obmanjujuća u pogledu podatka. Razlika između ta dva je
 * upravo ono što ovaj sloj mora da prenese uzvodno.
 */
function provenanceFor(capability: string, asOf: string | null, fileLabel: string): Provenance {
  const descriptor = CAPABILITIES.find((c) => c.key === capability)
  return {
    classification: descriptor?.classification ?? 'fact',
    sources: [{ label: fileLabel, capabilityKey: capability, isDemo: false }],
    ...(asOf
      ? {
          freshness: {
            asOf,
            ...(descriptor?.freshnessSlaSeconds !== undefined
              ? { slaSeconds: descriptor.freshnessSlaSeconds }
              : {}),
          },
        }
      : {}),
  }
}

function sourceLabel(ctx: ConnectorContext): string {
  const value = ctx.config.label
  return typeof value === 'string' && value.trim() !== '' ? value : 'Uvezena tabela'
}

/** Skup koji nije uvezen NIJE prazan skup — to je izostanak izvora. */
async function require(
  ctx: ConnectorContext,
  kind: string,
): Promise<Result<ImportedRows>> {
  const read = ctx.readImported
  if (!read) return err(domainError('integration_unavailable', 'import.error.noReader'))

  const data = await read(kind)
  if (!data) return err(domainError('integration_unavailable', 'import.error.notImported'))
  return ok(data)
}

export const fileConnector: Connector = {
  type: 'file',

  getCapabilities: () => CAPABILITIES,

  async testConnection(ctx: ConnectorContext): Promise<HealthResult> {
    const started = Date.now()
    const read = ctx.readImported

    if (!read) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: 'no_reader',
        errorMessage: 'Čitanje uvezenih tabela nije dostupno u ovom kontekstu.',
      }
    }

    const kinds = ['sales', 'receivables', 'payables', 'stock']
    const present: string[] = []
    for (const kind of kinds) {
      if (await read(kind)) present.push(kind)
    }

    // Nijedan uvezen skup nije kvar integracije nego nedovršeno podešavanje.
    // Poruka to i kaže, umesto „veza nije uspostavljena".
    return {
      ok: present.length > 0,
      latencyMs: Date.now() - started,
      ...(present.length === 0
        ? { errorCode: 'nothing_imported', errorMessage: 'Nijedna tabela još nije uvezena.' }
        : {}),
      errorMessage:
        present.length > 0 ? `Uvezeno: ${present.join(', ')}.` : 'Nijedna tabela još nije uvezena.',
    }
  },

  async invoke(
    capabilityKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<CapabilityResult>> {
    const currency = currencyOf(ctx)
    const label = sourceLabel(ctx)
    const now = new Date()

    const withSales = async () => {
      const data = await require(ctx, 'sales')
      return data.ok ? ok({ rows: data.value.rows as unknown as SaleRow[], asOf: data.value.asOf }) : data
    }

    switch (capabilityKey) {
      case 'get_sales_summary': {
        const data = await withSales()
        if (!data.ok) return data
        return ok({
          data: salesSummaryFrom(data.value.rows, now, currency),
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: 3,
        })
      }

      case 'get_sales_daily': {
        const args = input as { days: number }
        const data = await withSales()
        if (!data.ok) return data
        const days = dailySeries(data.value.rows, now, args.days)
        return ok({
          data: { currency, days },
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: days.length,
        })
      }

      case 'get_sales_history': {
        const args = input as { years: number }
        const data = await withSales()
        if (!data.ok) return data
        const months = monthlyHistory(data.value.rows, now, args.years)
        return ok({
          data: { currency, months },
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: months.length,
        })
      }

      case 'get_daily_sales': {
        const args = input as { date: string }
        const data = await withSales()
        if (!data.ok) return data
        const forDay = data.value.rows.filter((r) => r.doc_date === args.date)
        const total = forDay.reduce((sum, r) => sum + Number(r.amount), 0)
        return ok({
          data: {
            date: args.date,
            total: total.toFixed(2),
            currency,
            orderCount: forDay.length,
          },
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: forDay.length,
        })
      }

      case 'get_receivables_aging': {
        const data = await require(ctx, 'receivables')
        if (!data.ok) return data
        return ok({
          data: aging(data.value.rows as unknown as ReceivableRow[], now, currency),
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: 4,
        })
      }

      case 'get_top_debtors': {
        const data = await require(ctx, 'receivables')
        if (!data.ok) return data
        return ok({
          data: topDebtorsFrom(data.value.rows as unknown as ReceivableRow[], now, currency),
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: 0,
        })
      }

      case 'get_outstanding_invoices': {
        const args = input as { overdueDays: number }
        const data = await require(ctx, 'receivables')
        if (!data.ok) return data
        return ok({
          data: outstanding(
            data.value.rows as unknown as ReceivableRow[],
            now,
            currency,
            args.overdueDays,
          ),
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: 0,
        })
      }

      case 'get_payables': {
        const data = await require(ctx, 'payables')
        if (!data.ok) return data
        return ok({
          data: payablesFrom(data.value.rows as unknown as PayableRow[], now, currency),
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: 0,
        })
      }

      case 'get_stock_status':
      case 'get_inventory_alerts': {
        const data = await require(ctx, 'stock')
        if (!data.ok) return data
        const items = stockFrom(data.value.rows as unknown as StockRow[])

        return ok({
          data:
            capabilityKey === 'get_stock_status'
              ? { items }
              : {
                  // Stara sposobnost traži cele brojeve i samo ono ispod
                  // minimuma — oblik se poštuje da postojeći ekrani rade.
                  items: items
                    .filter((i) => i.onHand < i.minimum)
                    .map((i) => ({
                      item: i.item,
                      onHand: Math.round(i.onHand),
                      minimum: Math.round(i.minimum),
                      daysOfCover: Math.round(i.daysOfCover),
                    })),
                },
          provenance: provenanceFor(capabilityKey, data.value.asOf, label),
          rowCount: items.length,
        })
      }

      default:
        return err(domainError('not_found', 'connector.error.unknownCapability'))
    }
  },
}
