/**
 * Sabiranje uvezenih redova u oblik koji sposobnosti vraćaju.
 *
 * Odvojeno od konektora da bi moglo da se proveri bez baze. Ovde se donose sve
 * odluke koje menjaju broj na ekranu, pa svaka od njih ima test.
 *
 * Oblik odgovora je ISTI kao kod demo konektora. Zbog toga tabla, brif i
 * pitanja rade bez ijedne izmene kada klijent pređe sa demo podataka na svoje.
 */

export interface SaleRow {
  readonly doc_date: string
  readonly amount: number | string
  readonly customer?: string | null
  readonly product?: string | null
  readonly category?: string | null
}

export interface ReceivableRow {
  readonly customer: string
  readonly amount: number | string
  readonly due_date: string
  readonly invoice_number?: string | null
}

export interface PayableRow {
  readonly supplier: string
  readonly amount: number | string
  readonly due_date: string
}

export interface StockRow {
  readonly item: string
  readonly on_hand: number | string
  readonly minimum?: number | string | null
  readonly average_daily_sales?: number | string | null
  readonly lead_time_days?: number | null
}

/** PostgREST vraća `numeric` kao string, da ne izgubi preciznost. */
function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Cele dane između dva datuma; negativan broj znači da je prvi u prošlosti. */
function daysBetween(from: string, to: Date): number {
  const parsed = Date.parse(`${from}T00:00:00Z`)
  if (Number.isNaN(parsed)) return 0
  return Math.round((parsed - Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())) / 86_400_000)
}

function sumBetween(rows: readonly SaleRow[], fromIso: string, toIso: string): number {
  return rows
    .filter((r) => r.doc_date >= fromIso && r.doc_date <= toIso)
    .reduce((sum, r) => sum + num(r.amount), 0)
}

function changePercent(current: number, previous: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export interface SalesSummary {
  readonly currency: string
  readonly asOf: string
  readonly yesterday: { total: string; previousTotal: string; changePercent: number }
  readonly last7Days: { total: string; previousTotal: string; changePercent: number }
  readonly monthToDate: { total: string; previousTotal: string; changePercent: number }
}

/**
 * Prodaja juče, u sedam dana i od početka meseca.
 *
 * „Juče", ne „danas": dan koji je u toku nije uporediv ni sa čim, a prikazan
 * kao pad izgleda kao loša vest umesto kao nepotpun podatak. Isto važi i za
 * mesec — poredi se sa ISTIM brojem dana prethodnog meseca, jer bi pun
 * prethodni mesec uvek izgledao veći.
 */
export function salesSummaryFrom(
  rows: readonly SaleRow[],
  now: Date,
  currency: string,
): SalesSummary {
  const yesterday = new Date(now.getTime() - 86_400_000)
  const yesterdayIso = isoDay(yesterday)
  const dayBeforeIso = isoDay(new Date(now.getTime() - 2 * 86_400_000))

  const period = (current: number, previous: number) => ({
    total: current.toFixed(2),
    previousTotal: previous.toFixed(2),
    changePercent: changePercent(current, previous),
  })

  const day = (iso: string) => sumBetween(rows, iso, iso)

  const sevenFrom = isoDay(new Date(yesterday.getTime() - 6 * 86_400_000))
  const previousSevenTo = isoDay(new Date(yesterday.getTime() - 7 * 86_400_000))
  const previousSevenFrom = isoDay(new Date(yesterday.getTime() - 13 * 86_400_000))

  const daysThisMonth = yesterday.getUTCDate()
  const monthFrom = isoDay(
    new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1)),
  )
  const previousMonthEnd = new Date(
    Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, daysThisMonth),
  )
  const previousMonthFrom = isoDay(
    new Date(Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1)),
  )

  return {
    currency,
    asOf: yesterdayIso,
    yesterday: period(day(yesterdayIso), day(dayBeforeIso)),
    last7Days: period(
      sumBetween(rows, sevenFrom, yesterdayIso),
      sumBetween(rows, previousSevenFrom, previousSevenTo),
    ),
    monthToDate: period(
      sumBetween(rows, monthFrom, yesterdayIso),
      sumBetween(rows, previousMonthFrom, isoDay(previousMonthEnd)),
    ),
  }
}

/**
 * Dnevni niz, unazad od juče.
 *
 * Dan bez ijedne stavke se prikazuje kao NULA, ne izostavlja. Preskočen dan bi
 * grafikon sabio i pomerio ostale, pa bi neradna nedelja izgledala kao da je
 * nije ni bilo.
 */
export function dailySeries(
  rows: readonly SaleRow[],
  now: Date,
  days: number,
): readonly { date: string; total: string }[] {
  const count = Math.max(1, Math.min(90, days))
  const byDate = new Map<string, number>()
  for (const row of rows) {
    byDate.set(row.doc_date, (byDate.get(row.doc_date) ?? 0) + num(row.amount))
  }

  const out: { date: string; total: string }[] = []
  for (let back = count; back >= 1; back--) {
    const iso = isoDay(new Date(now.getTime() - back * 86_400_000))
    out.push({ date: iso, total: (byDate.get(iso) ?? 0).toFixed(2) })
  }
  return out
}

/** Mesečni zbirovi unazad; tekući mesec se izostavlja jer je nepotpun. */
export function monthlyHistory(
  rows: readonly SaleRow[],
  now: Date,
  years: number,
): readonly { month: string; total: string }[] {
  const byMonth = new Map<string, number>()
  for (const row of rows) {
    const month = row.doc_date.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + num(row.amount))
  }

  const count = Math.max(1, Math.min(10, years)) * 12
  const out: { month: string; total: string }[] = []

  for (let back = count; back >= 1; back--) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    const key = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}`
    out.push({ month: key, total: (byMonth.get(key) ?? 0).toFixed(2) })
  }

  return out
}

export interface Aging {
  readonly total: string
  readonly overdue: string
  readonly currency: string
  readonly asOf: string
  readonly buckets: readonly {
    fromDays: number
    toDays: number | null
    amount: string
    invoiceCount: number
  }[]
}

const EDGES: readonly [number, number | null][] = [
  [0, 30],
  [30, 60],
  [60, 90],
  [90, null],
]

/**
 * Starosna struktura potraživanja.
 *
 * Zbir opsega je jednak ukupnom iznosu jer se oboje izvodi iz ISTE liste.
 * Stavka koja još nije dospela ulazi u ukupno ali NE u dospelo — inače bi
 * „dospelo" bilo jednako ukupnom, a to knjigovođa primeti prvi.
 */
export function aging(
  rows: readonly ReceivableRow[],
  now: Date,
  currency: string,
): Aging {
  const withAge = rows.map((r) => ({ ...r, overdueDays: -daysBetween(r.due_date, now) }))

  const buckets = EDGES.map(([fromDays, toDays]) => {
    const inBucket = withAge.filter(
      (r) => r.overdueDays >= fromDays && (toDays === null || r.overdueDays < toDays),
    )
    return {
      fromDays,
      toDays,
      amount: inBucket.reduce((sum, r) => sum + num(r.amount), 0).toFixed(2),
      invoiceCount: inBucket.length,
    }
  })

  return {
    total: withAge.reduce((sum, r) => sum + num(r.amount), 0).toFixed(2),
    overdue: withAge
      .filter((r) => r.overdueDays > 0)
      .reduce((sum, r) => sum + num(r.amount), 0)
      .toFixed(2),
    currency,
    asOf: isoDay(now),
    buckets,
  }
}

/** Najveći dužnici, izvedeni iz istih stavki kao i starosna struktura. */
export function topDebtorsFrom(
  rows: readonly ReceivableRow[],
  now: Date,
  currency: string,
) {
  const byCustomer = new Map<string, { amount: number; count: number; oldest: number }>()

  for (const row of rows) {
    const overdueDays = -daysBetween(row.due_date, now)
    const current = byCustomer.get(row.customer) ?? { amount: 0, count: 0, oldest: 0 }
    byCustomer.set(row.customer, {
      amount: current.amount + num(row.amount),
      count: current.count + 1,
      oldest: Math.max(current.oldest, overdueDays),
    })
  }

  const items = [...byCustomer.entries()]
    .map(([customer, v]) => ({
      customer,
      amount: v.amount.toFixed(2),
      currency,
      invoiceCount: v.count,
      oldestOverdueDays: Math.max(0, v.oldest),
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount))

  return {
    total: items.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2),
    currency,
    items,
  }
}

export function outstanding(
  rows: readonly ReceivableRow[],
  now: Date,
  currency: string,
  minOverdueDays: number,
) {
  const items = rows
    .map((r) => ({
      invoiceNumber: r.invoice_number ?? '—',
      customer: r.customer,
      amount: num(r.amount).toFixed(2),
      currency,
      dueDate: r.due_date,
      overdueDays: -daysBetween(r.due_date, now),
    }))
    .filter((r) => r.overdueDays >= minOverdueDays)
    .sort((a, b) => b.overdueDays - a.overdueDays)

  return {
    items,
    total: items.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2),
    currency,
  }
}

export function payablesFrom(rows: readonly PayableRow[], now: Date, currency: string) {
  const items = rows
    .map((r) => ({
      supplier: r.supplier,
      amount: num(r.amount).toFixed(2),
      currency,
      dueDate: r.due_date,
      daysUntilDue: daysBetween(r.due_date, now),
    }))
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)

  return {
    total: items.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2),
    dueWithin7Days: items
      .filter((i) => i.daysUntilDue <= 7)
      .reduce((sum, i) => sum + Number(i.amount), 0)
      .toFixed(2),
    currency,
    items,
  }
}

/**
 * Zalihe sa pokrivenošću.
 *
 * Kada izvoz ne nosi prosečnu dnevnu potrošnju, pokrivenost je NULA i artikal
 * se ne pojavljuje u upozorenjima — mehanizam pažnje preskače artikle bez
 * potrošnje. Izmišljanje potrošnje iz minimuma bi dalo pokrivenost koja izgleda
 * kao podatak a nije izvedena ni iz čega.
 */
export function stockFrom(rows: readonly StockRow[]) {
  return rows.map((r) => {
    const onHand = num(r.on_hand)
    const perDay = num(r.average_daily_sales)
    return {
      item: r.item,
      onHand,
      minimum: num(r.minimum),
      averageDailySales: perDay,
      daysOfCover: perDay > 0 ? Math.round(onHand / perDay) : 0,
      leadTimeDays: r.lead_time_days ?? 0,
    }
  })
}
