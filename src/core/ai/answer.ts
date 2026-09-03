import { z } from 'zod'
import type { Translator } from '@/i18n/translator'
import type { MessageKey } from '@/i18n/messages/sr'
import type { Classification } from '../shared/provenance'
import type { IntentKey, PeriodHint } from './question-matcher'

/**
 * Pretvaranje izlaza sposobnosti u rečenicu.
 *
 * Odgovor se sastavlja iz PROVERENOG oblika izlaza, ne iz slobodnog teksta.
 * Ako izlaz ne odgovara očekivanom obliku, odgovora nema — bolje „ne mogu da
 * pročitam" nego rečenica sastavljena od polovičnog podatka.
 *
 * Brojevi u rečenici i brojevi u listi ispod nje dolaze iz ISTOG odgovora
 * sposobnosti. Da se računaju odvojeno, razlika bi se pojavila tek kod
 * klijenta koji sabere listu.
 */

export interface AnswerFact {
  readonly label: string
  readonly value: string
  /** Istaknuto kada traži pažnju — dospelo, ispod minimuma, u minusu. */
  readonly warn?: boolean
}

export interface Answer {
  readonly text: string
  readonly facts: readonly AnswerFact[]
}

export interface AnswerFormat {
  readonly t: Translator['t']
  readonly money: (amount: string | number, currency: string) => string
  readonly number: (value: number) => string
  readonly percent: (value: number) => string
  readonly date: (value: string) => string
}

const financial = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.string(),
  expenses: z.string(),
  profit: z.string(),
  marginPercent: z.number(),
  previousRevenue: z.string(),
  currency: z.string(),
})

const dailySales = z.object({
  date: z.string(),
  total: z.string(),
  currency: z.string(),
  orderCount: z.number().int(),
})

const periodSales = z.object({
  from: z.string(),
  to: z.string(),
  total: z.string(),
  previousTotal: z.string(),
  changePercent: z.number(),
  currency: z.string(),
})

const outstanding = z.object({
  total: z.string(),
  currency: z.string(),
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
})

const debtors = z.object({
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
})

const payables = z.object({
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
})

const headcount = z.object({
  total: z.number().int(),
  departments: z.array(z.object({ name: z.string(), count: z.number().int() })),
})

const stockStatus = z.object({
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
})

const inventory = z.object({
  items: z.array(
    z.object({
      item: z.string(),
      onHand: z.number(),
      minimum: z.number(),
      daysOfCover: z.number(),
    }),
  ),
})

/** Koliko stavki ide u odgovor. Duži spisak pripada tabeli, ne rečenici. */
const MAX_FACTS = 5

function change(current: string, previous: string): number | undefined {
  const prev = Number(previous)
  const now = Number(current)
  if (!Number.isFinite(prev) || !Number.isFinite(now) || prev === 0) return undefined
  return Math.round(((now - prev) / prev) * 1000) / 10
}

export function buildAnswer(intent: IntentKey, data: unknown, f: AnswerFormat): Answer | null {
  switch (intent) {
    case 'get_financial_summary': {
      const parsed = financial.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data
      const delta = change(d.revenue, d.previousRevenue)

      return {
        text: f.t('ask.answer.financial', {
          revenue: f.money(d.revenue, d.currency),
          profit: f.money(d.profit, d.currency),
          margin: f.percent(d.marginPercent),
        }),
        facts: [
          { label: f.t('ask.fact.revenue'), value: f.money(d.revenue, d.currency) },
          { label: f.t('ask.fact.expenses'), value: f.money(d.expenses, d.currency) },
          {
            label: f.t('ask.fact.profit'),
            value: f.money(d.profit, d.currency),
            warn: Number(d.profit) < 0,
          },
          { label: f.t('ask.fact.margin'), value: f.percent(d.marginPercent) },
          ...(delta === undefined
            ? []
            : [{ label: f.t('ask.fact.vsPrevious'), value: f.percent(delta), warn: delta < 0 }]),
        ],
      }
    }

    case 'get_daily_sales': {
      const parsed = dailySales.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text: f.t('ask.answer.dailySales', {
          date: f.date(d.date),
          total: f.money(d.total, d.currency),
          orders: f.number(d.orderCount),
        }),
        facts: [
          { label: f.t('ask.fact.total'), value: f.money(d.total, d.currency) },
          { label: f.t('ask.fact.orders'), value: f.number(d.orderCount) },
        ],
      }
    }

    case 'get_sales_by_period': {
      const parsed = periodSales.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text: f.t('ask.answer.periodSales', {
          from: f.date(d.from),
          to: f.date(d.to),
          total: f.money(d.total, d.currency),
          change: f.percent(d.changePercent),
        }),
        facts: [
          { label: f.t('ask.fact.total'), value: f.money(d.total, d.currency) },
          { label: f.t('ask.fact.previousPeriod'), value: f.money(d.previousTotal, d.currency) },
          {
            label: f.t('ask.fact.change'),
            value: f.percent(d.changePercent),
            warn: d.changePercent < 0,
          },
        ],
      }
    }

    case 'get_outstanding_invoices': {
      const parsed = outstanding.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text: f.t('ask.answer.outstanding', {
          total: f.money(d.total, d.currency),
          count: f.number(d.items.length),
        }),
        facts: d.items.slice(0, MAX_FACTS).map((i) => ({
          label: `${i.customer} · ${i.invoiceNumber}`,
          value: f.money(i.amount, i.currency),
          warn: i.overdueDays > 0,
        })),
      }
    }

    case 'get_top_debtors': {
      const parsed = debtors.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data
      const top = d.items[0]

      return {
        text: top
          ? f.t('ask.answer.debtors', {
              total: f.money(d.total, d.currency),
              name: top.customer,
              amount: f.money(top.amount, top.currency),
            })
          : f.t('ask.answer.debtorsNone'),
        facts: d.items.slice(0, MAX_FACTS).map((i) => ({
          label: f.t('ask.fact.debtor', { name: i.customer, days: i.oldestOverdueDays }),
          value: f.money(i.amount, i.currency),
          // Preko 60 dana je granica posle koje naplata postaje ozbiljna —
          // ista granica kao u tabeli dužnika na početnoj strani.
          warn: i.oldestOverdueDays > 60,
        })),
      }
    }

    case 'get_payables': {
      const parsed = payables.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text: f.t('ask.answer.payables', {
          total: f.money(d.total, d.currency),
          soon: f.money(d.dueWithin7Days, d.currency),
        }),
        facts: d.items.slice(0, MAX_FACTS).map((i) => ({
          label: f.t('ask.fact.payable', { name: i.supplier, date: f.date(i.dueDate) }),
          value: f.money(i.amount, i.currency),
          warn: i.daysUntilDue <= 7,
        })),
      }
    }

    case 'get_headcount': {
      const parsed = headcount.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text: f.t('ask.answer.headcount', {
          total: f.number(d.total),
          departments: f.number(d.departments.length),
        }),
        facts: d.departments.map((dep) => ({
          label: dep.name,
          value: f.number(dep.count),
        })),
      }
    }

    case 'get_stock_status': {
      const parsed = stockStatus.safeParse(data)
      if (!parsed.success) return null

      /*
       * Odgovor se vodi NAJKRAĆOM pokrivenošću, ne prvim artiklom u nizu.
       * Pitanje „koliko dana možemo da izdržimo" traži najslabiju kariku;
       * prosek bi je sakrio, a redosled iz izvora nije obećanje.
       *
       * Artikli bez potrošnje se izostavljaju — pokrivenost izračunata
       * deljenjem nulom nije uvid nego artefakt računa.
       */
      const withDemand = parsed.data.items.filter((i) => i.averageDailySales > 0)
      const sorted = [...withDemand].sort((a, b) => a.daysOfCover - b.daysOfCover)
      const worst = sorted[0]

      return {
        text: worst
          ? f.t('ask.answer.stockStatus', {
              name: worst.item,
              days: f.number(worst.daysOfCover),
              perDay: f.number(worst.averageDailySales),
            })
          : f.t('ask.answer.stockStatusNone'),
        facts: sorted.slice(0, MAX_FACTS).map((i) => ({
          label: f.t('ask.fact.inventoryItem', { name: i.item, days: i.daysOfCover }),
          value: f.t('ask.fact.coverageOf', {
            days: f.number(i.daysOfCover),
            leadTime: f.number(i.leadTimeDays),
          }),
          // Zaliha koja se istroši pre isporuke je jedini problem sa zalihom
          // koji se ne može popraviti kasnije.
          warn: i.daysOfCover < i.leadTimeDays,
        })),
      }
    }

    case 'get_inventory_alerts': {
      const parsed = inventory.safeParse(data)
      if (!parsed.success) return null
      const d = parsed.data

      return {
        text:
          d.items.length === 0
            ? f.t('ask.answer.inventoryNone')
            : f.t('ask.answer.inventory', { count: f.number(d.items.length) }),
        facts: d.items.slice(0, MAX_FACTS).map((i) => ({
          label: f.t('ask.fact.inventoryItem', { name: i.item, days: i.daysOfCover }),
          value: f.t('ask.fact.stockOf', {
            onHand: f.number(i.onHand),
            minimum: f.number(i.minimum),
          }),
          warn: i.onHand < i.minimum,
        })),
      }
    }
  }
}

/** Naslov predloženog pitanja za spisak „ovo umem da odgovorim". */
export function suggestionKey(intent: IntentKey): MessageKey {
  return `ask.suggest.${intent}` as MessageKey
}

/** Klasifikacija ide iz definicije sposobnosti; ovde je samo tip prolaza. */
export type AnswerClassification = Classification

/** Ulaz koji server sastavlja za sposobnost — nikad iz teksta pitanja. */
export function inputFor(
  intent: IntentKey,
  period: PeriodHint | undefined,
  now: Date,
): Record<string, unknown> {
  const day = (offsetDays: number) =>
    new Date(now.getTime() - offsetDays * 86_400_000).toISOString().slice(0, 10)

  switch (intent) {
    case 'get_daily_sales':
      return { date: period === 'yesterday' ? day(1) : day(0) }

    case 'get_sales_by_period':
    case 'get_financial_summary': {
      const span = period === 'week' ? 6 : 29
      if (period === 'previousMonth') {
        const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
        const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
        return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
      }
      return { from: day(span), to: day(0) }
    }

    case 'get_outstanding_invoices':
      return { overdueDays: 0 }

    default:
      return {}
  }
}
