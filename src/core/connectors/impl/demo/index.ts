import { z } from 'zod'
import type {
  CapabilityDescriptor,
  CapabilityResult,
  Connector,
  ConnectorContext,
  HealthResult,
} from '../../types'
import { ok, err, domainError, type Result } from '../../../shared/result'
import type { Provenance } from '../../../shared/provenance'
import {
  dailySales,
  financialSummary,
  headcount,
  inventoryAlerts,
  isDemoDataset,
  outstandingInvoices,
  payables,
  receivablesAging,
  salesSummary,
  stockItems,
  topDebtors,
  type DemoDataset,
} from './dataset'

/**
 * Demo konektor.
 *
 * Postoji da bi se ceo lanac — sposobnost, permisija, provenijencija, prikaz —
 * mogao proveriti bez ijednog stvarnog sistema klijenta. Ne dodiruje mrežu.
 *
 * Svaki rezultat nosi `isDemo: true`, pa UI ne može da ga prikaže kao podatak
 * iz produkcije čak i ako neko zaboravi da proveri.
 */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'connector.error.invalidDate')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'connector.error.invalidDate')

const salesPeriodSchema = z.object({
  total: z.string(),
  previousTotal: z.string(),
  changePercent: z.number(),
})

const CAPABILITIES = [
  {
    key: 'get_daily_sales',
    mode: 'read',
    requiredPermission: 'view_sales',
    classification: 'fact',
    freshnessSlaSeconds: 900,
    inputSchema: z.object({ date: dateOnly }),
    outputSchema: z.object({
      date: z.string(),
      total: z.string(),
      currency: z.string(),
      orderCount: z.number().int(),
    }),
  },
  {
    key: 'get_sales_by_period',
    mode: 'read',
    requiredPermission: 'view_sales',
    // Izvedeno sabiranjem dnevnih vrednosti — nije zapis iz sistema, pa
    // klasifikacija to i kaže.
    classification: 'calculation',
    freshnessSlaSeconds: 900,
    inputSchema: z
      .object({ from: dateOnly, to: dateOnly })
      .refine((v) => v.from <= v.to, 'connector.error.periodReversed'),
    outputSchema: z.object({
      from: z.string(),
      to: z.string(),
      total: z.string(),
      previousTotal: z.string(),
      changePercent: z.number(),
      currency: z.string(),
    }),
  },
  {
    key: 'get_outstanding_invoices',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'fact',
    freshnessSlaSeconds: 3600,
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
    key: 'get_financial_summary',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    // Prihod je zbir dnevnih vrednosti, a marža je izračunata — nije zapis iz
    // sistema, pa klasifikacija to i kaže.
    classification: 'calculation',
    freshnessSlaSeconds: 3600,
    inputSchema: z.object({ from: dateOnly, to: dateOnly }),
    outputSchema: z.object({
      from: z.string(),
      to: z.string(),
      revenue: z.string(),
      expenses: z.string(),
      profit: z.string(),
      marginPercent: z.number(),
      previousRevenue: z.string(),
      currency: z.string(),
    }),
  },
  {
    key: 'get_payables',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'fact',
    freshnessSlaSeconds: 3600,
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
    key: 'get_top_debtors',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'calculation',
    freshnessSlaSeconds: 3600,
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
    key: 'get_headcount',
    mode: 'read',
    requiredPermission: 'view_customers',
    classification: 'fact',
    freshnessSlaSeconds: 86_400,
    inputSchema: z.object({}),
    outputSchema: z.object({
      total: z.number().int(),
      departments: z.array(z.object({ name: z.string(), count: z.number().int() })),
    }),
  },
  {
    key: 'get_sales_summary',
    mode: 'read',
    requiredPermission: 'view_sales',
    // Zbirovi i poređenja su izvedeni iz dnevnih vrednosti, ne prepisani.
    classification: 'calculation',
    freshnessSlaSeconds: 900,
    inputSchema: z.object({}),
    outputSchema: z.object({
      currency: z.string(),
      asOf: z.string(),
      yesterday: salesPeriodSchema,
      last7Days: salesPeriodSchema,
      monthToDate: salesPeriodSchema,
    }),
  },
  {
    key: 'get_receivables_aging',
    mode: 'read',
    requiredPermission: 'view_financial_data',
    classification: 'calculation',
    freshnessSlaSeconds: 3600,
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
    key: 'get_stock_status',
    mode: 'read',
    requiredPermission: 'view_inventory',
    // Stanje i potrošnja su prepisani; pokrivenost je količnik, pa je ceo
    // odgovor izračunat a ne zapis iz sistema.
    classification: 'calculation',
    freshnessSlaSeconds: 3600,
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
    freshnessSlaSeconds: 3600,
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

function datasetOf(ctx: ConnectorContext): DemoDataset {
  const value = ctx.config.dataset
  return isDemoDataset(value) ? value : 'distribution'
}

function provenanceFor(capability: string, asOf: Date, sla: number | undefined): Provenance {
  const descriptor = CAPABILITIES.find((c) => c.key === capability)
  return {
    classification: descriptor?.classification ?? 'fact',
    sources: [{ label: 'Demo konektor', capabilityKey: capability, isDemo: true }],
    freshness: { asOf: asOf.toISOString(), ...(sla !== undefined ? { slaSeconds: sla } : {}) },
  }
}

export const demoConnector: Connector = {
  type: 'demo',

  getCapabilities: () => CAPABILITIES,

  testConnection(ctx: ConnectorContext): Promise<HealthResult> {
    const started = Date.now()
    const dataset = datasetOf(ctx)

    // Konektor ne priča ni sa čim; provera potvrđuje da je konfiguracija
    // smislena, a ne da je neko dostupan.
    if (!isDemoDataset(ctx.config.dataset) && ctx.config.dataset !== undefined) {
      return Promise.resolve({
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: 'invalid_config',
        errorMessage: `Nepoznat demo skup podataka. Očekuje se "distribution" ili "hospitality".`,
      })
    }

    return Promise.resolve({
      ok: true,
      latencyMs: Date.now() - started,
      errorMessage: `Demo skup "${dataset}" je dostupan.`,
    })
  },

  invoke(
    capabilityKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<CapabilityResult>> {
    const dataset = datasetOf(ctx)
    const now = new Date()

    switch (capabilityKey) {
      case 'get_daily_sales': {
        const args = input as { date: string }
        const data = dailySales(dataset, ctx.organizationId, args.date)
        return Promise.resolve(
          ok({ data, provenance: provenanceFor(capabilityKey, now, 900), rowCount: 1 }),
        )
      }

      case 'get_sales_by_period': {
        const args = input as { from: string; to: string }
        const sum = (from: string, to: string): number => {
          let total = 0
          for (
            let d = new Date(`${from}T00:00:00Z`);
            d <= new Date(`${to}T00:00:00Z`);
            d = new Date(d.getTime() + 86_400_000)
          ) {
            total += Number(dailySales(dataset, ctx.organizationId, d.toISOString().slice(0, 10)).total)
          }
          return total
        }

        const days =
          (Date.parse(`${args.to}T00:00:00Z`) - Date.parse(`${args.from}T00:00:00Z`)) / 86_400_000 + 1
        const prevTo = new Date(Date.parse(`${args.from}T00:00:00Z`) - 86_400_000)
        const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000)

        const total = sum(args.from, args.to)
        const previousTotal = sum(
          prevFrom.toISOString().slice(0, 10),
          prevTo.toISOString().slice(0, 10),
        )

        return Promise.resolve(
          ok({
            data: {
              from: args.from,
              to: args.to,
              total: total.toFixed(2),
              previousTotal: previousTotal.toFixed(2),
              changePercent:
                previousTotal > 0
                  ? Math.round(((total - previousTotal) / previousTotal) * 1000) / 10
                  : 0,
              currency: dailySales(dataset, ctx.organizationId, args.from).currency,
            },
            provenance: provenanceFor(capabilityKey, now, 900),
            rowCount: Math.round(days),
          }),
        )
      }

      case 'get_sales_summary': {
        const data = salesSummary(dataset, ctx.organizationId, now)
        return Promise.resolve(
          ok({ data, provenance: provenanceFor(capabilityKey, now, 900), rowCount: 3 }),
        )
      }

      case 'get_receivables_aging': {
        const data = receivablesAging(dataset, ctx.organizationId, now)
        return Promise.resolve(
          ok({
            data,
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: data.buckets.length,
          }),
        )
      }

      case 'get_stock_status': {
        const items = stockItems(dataset, ctx.organizationId)
        return Promise.resolve(
          ok({
            data: { items },
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: items.length,
          }),
        )
      }

      case 'get_outstanding_invoices': {
        const args = input as { overdueDays: number }
        const items = outstandingInvoices(dataset, ctx.organizationId, args.overdueDays, now)
        const total = items.reduce((sum, i) => sum + Number(i.amount), 0)

        return Promise.resolve(
          ok({
            data: {
              items,
              total: total.toFixed(2),
              currency: items[0]?.currency ?? 'RSD',
            },
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: items.length,
          }),
        )
      }

      case 'get_financial_summary': {
        const parsedInput = z.object({ from: dateOnly, to: dateOnly }).safeParse(input)
        if (!parsedInput.success) {
          return Promise.resolve(err(domainError('invalid_input', 'connector.error.invalidInput')))
        }

        return Promise.resolve(
          ok({
            data: financialSummary(
              dataset,
              ctx.organizationId,
              parsedInput.data.from,
              parsedInput.data.to,
            ),
            provenance: provenanceFor(capabilityKey, now, 3600),
          }),
        )
      }

      case 'get_payables': {
        const result = payables(dataset, ctx.organizationId, now)
        return Promise.resolve(
          ok({
            data: result,
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: result.items.length,
          }),
        )
      }

      case 'get_top_debtors': {
        const items = topDebtors(dataset, ctx.organizationId, now)
        const total = items.reduce((sum, d) => sum + Number(d.amount), 0)
        return Promise.resolve(
          ok({
            data: {
              total: total.toFixed(2),
              currency: items[0]?.currency ?? 'RSD',
              items,
            },
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: items.length,
          }),
        )
      }

      case 'get_headcount': {
        return Promise.resolve(
          ok({
            data: headcount(dataset, ctx.organizationId),
            provenance: provenanceFor(capabilityKey, now, 86_400),
          }),
        )
      }

      case 'get_inventory_alerts': {
        const items = inventoryAlerts(dataset, ctx.organizationId)
        return Promise.resolve(
          ok({
            data: { items },
            provenance: provenanceFor(capabilityKey, now, 3600),
            rowCount: items.length,
          }),
        )
      }

      default:
        return Promise.resolve(
          err(domainError('not_found', 'connector.error.unknownCapability')),
        )
    }
  },
}
