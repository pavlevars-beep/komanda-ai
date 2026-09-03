/**
 * Deterministički generator demo podataka.
 *
 * Isti ulaz uvek daje isti izlaz. To nije sitnica: demo koji pri svakom
 * osvežavanju prikaže drugačiji broj izgleda kao kvar, a i onemogućava da se
 * u testu tvrdi bilo šta o rezultatu.
 *
 * Podaci su izmišljeni i UVEK nose oznaku demo — nikad se ne prikazuju kao da
 * dolaze iz stvarnog sistema klijenta.
 */

/** mulberry32 — mali, brz i, što je ovde bitno, ponovljiv. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type DemoDataset = 'distribution' | 'hospitality'

export function isDemoDataset(value: unknown): value is DemoDataset {
  return value === 'distribution' || value === 'hospitality'
}

interface Profile {
  readonly dailyBase: number
  readonly spread: number
  readonly currency: string
  readonly customers: readonly string[]
  readonly items: readonly string[]
  /** Udeo rashoda u prihodu. Distribucija ima nisku maržu, ugostiteljstvo višu. */
  readonly expenseRatio: number
  readonly suppliers: readonly string[]
  readonly departments: readonly { readonly name: string; readonly share: number }[]
  readonly headcount: number
}

const PROFILES: Record<DemoDataset, Profile> = {
  distribution: {
    dailyBase: 2_400_000,
    spread: 0.35,
    currency: 'RSD',
    customers: [
      'Market Lazić d.o.o.',
      'Trgovina Jug',
      'Vega Retail',
      'Panonija Trade',
      'Delta Market Niš',
      'Zlatibor Promet',
    ],
    items: [
      'Brašno T-500 25kg',
      'Ulje suncokretovo 1l',
      'Šećer kristal 1kg',
      'Kafa mlevena 200g',
      'Deterdžent 3kg',
    ],
    expenseRatio: 0.87,
    suppliers: [
      'Žitopromet a.d.',
      'Uljara Vojvodina',
      'Sirovine Balkan',
      'Ambalaža Plus',
      'Transport Logistik',
    ],
    departments: [
      { name: 'Prodaja', share: 0.34 },
      { name: 'Magacin', share: 0.29 },
      { name: 'Transport', share: 0.18 },
      { name: 'Administracija', share: 0.12 },
      { name: 'Rukovodstvo', share: 0.07 },
    ],
    headcount: 68,
  },
  hospitality: {
    dailyBase: 18_400,
    spread: 0.42,
    currency: 'EUR',
    customers: [
      'Agencija Panorama',
      'Booking rezervacije',
      'Korporativni klijent Vektor',
      'Grupa Adriatik',
      'Direktne rezervacije',
    ],
    items: [
      'Standard soba',
      'Superior soba',
      'Apartman',
      'Konferencijska sala',
      'Wellness paket',
    ],
    expenseRatio: 0.71,
    suppliers: [
      'Veleprodaja Gurman',
      'Pekara Klas',
      'Vinarija Kovačević',
      'Higijena Servis',
      'Perionica Tekstil',
    ],
    departments: [
      { name: 'Recepcija', share: 0.22 },
      { name: 'Kuhinja', share: 0.31 },
      { name: 'Održavanje', share: 0.24 },
      { name: 'Administracija', share: 0.14 },
      { name: 'Rukovodstvo', share: 0.09 },
    ],
    headcount: 41,
  },
}

/** Vikendom promet pada — bez toga niz izgleda kao šum, a ne kao poslovanje. */
function weekdayFactor(date: Date): number {
  const day = date.getUTCDay()
  if (day === 0) return 0.42
  if (day === 6) return 0.68
  if (day === 1) return 1.08
  return 1
}

export interface DailySales {
  readonly date: string
  readonly total: string
  readonly currency: string
  readonly orderCount: number
}

export function dailySales(dataset: DemoDataset, orgId: string, date: string): DailySales {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:${date}`))
  const parsed = new Date(`${date}T00:00:00Z`)

  const variation = 1 + (rand() - 0.5) * 2 * profile.spread
  const total = profile.dailyBase * variation * weekdayFactor(parsed)

  return {
    date,
    total: total.toFixed(2),
    currency: profile.currency,
    orderCount: Math.max(1, Math.round((total / profile.dailyBase) * 42)),
  }
}

export interface OutstandingInvoice {
  readonly invoiceNumber: string
  readonly customer: string
  readonly amount: string
  readonly currency: string
  readonly dueDate: string
  readonly overdueDays: number
}

export function outstandingInvoices(
  dataset: DemoDataset,
  orgId: string,
  overdueDays: number,
  today: Date,
): OutstandingInvoice[] {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:invoices:${overdueDays}`))

  const count = 3 + Math.floor(rand() * 5)
  const out: OutstandingInvoice[] = []

  for (let i = 0; i < count; i++) {
    const days = overdueDays + Math.floor(rand() * 45)
    const due = new Date(today.getTime() - days * 86_400_000)
    const customer = profile.customers[Math.floor(rand() * profile.customers.length)]

    out.push({
      invoiceNumber: `${today.getUTCFullYear()}-${String(1000 + Math.floor(rand() * 8999))}`,
      customer: customer ?? 'Nepoznat kupac',
      amount: (profile.dailyBase * (0.02 + rand() * 0.12)).toFixed(2),
      currency: profile.currency,
      dueDate: due.toISOString().slice(0, 10),
      overdueDays: days,
    })
  }

  return out.sort((a, b) => b.overdueDays - a.overdueDays)
}

export interface InventoryAlert {
  readonly item: string
  readonly onHand: number
  readonly minimum: number
  readonly daysOfCover: number
}

export function inventoryAlerts(dataset: DemoDataset, orgId: string): InventoryAlert[] {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:inventory`))

  return profile.items
    .map((item) => {
      const minimum = 40 + Math.floor(rand() * 120)
      const onHand = Math.floor(minimum * (0.15 + rand() * 1.6))
      return {
        item,
        onHand,
        minimum,
        daysOfCover: Math.max(0, Math.round((onHand / Math.max(1, minimum)) * 7)),
      }
    })
    .filter((row) => row.onHand < row.minimum)
    .sort((a, b) => a.daysOfCover - b.daysOfCover)
}

// ---------------------------------------------------------------------------
// Finansijski pregled
// ---------------------------------------------------------------------------

export interface FinancialSummary {
  readonly from: string
  readonly to: string
  readonly revenue: string
  readonly expenses: string
  readonly profit: string
  /** Marža u procentima, zaokružena na jednu decimalu. */
  readonly marginPercent: number
  readonly previousRevenue: string
  readonly currency: string
}

/**
 * Prihodi i rashodi za period.
 *
 * Prihod se SABIRA iz dnevnih vrednosti, ne generiše zasebno. Da se računa
 * nezavisno, zbir dnevnih kartica ne bi odgovarao mesečnom pregledu — a
 * upravo to je vrsta nesaglasnosti zbog koje klijent prestane da veruje alatu.
 */
export function financialSummary(
  dataset: DemoDataset,
  orgId: string,
  from: string,
  to: string,
): FinancialSummary {
  const profile = PROFILES[dataset]

  const sum = (start: string, end: string): number => {
    let total = 0
    const cursor = new Date(`${start}T00:00:00Z`)
    const last = new Date(`${end}T00:00:00Z`)
    while (cursor <= last) {
      total += Number(dailySales(dataset, orgId, cursor.toISOString().slice(0, 10)).total)
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return total
  }

  const revenue = sum(from, to)

  // Prethodni period iste dužine, radi poređenja.
  const days =
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
    ) + 1
  const prevTo = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000)
  const previousRevenue = sum(
    prevFrom.toISOString().slice(0, 10),
    prevTo.toISOString().slice(0, 10),
  )

  // Rashodi prate prihod, uz malo šuma — fiksni troškovi ne skaliraju savršeno.
  const rand = prng(hash(`${orgId}:${dataset}:expenses:${from}:${to}`))
  const expenses = revenue * profile.expenseRatio * (0.96 + rand() * 0.08)
  const profit = revenue - expenses

  return {
    from,
    to,
    revenue: revenue.toFixed(2),
    expenses: expenses.toFixed(2),
    profit: profit.toFixed(2),
    marginPercent: Math.round((profit / Math.max(1, revenue)) * 1000) / 10,
    previousRevenue: previousRevenue.toFixed(2),
    currency: profile.currency,
  }
}

// ---------------------------------------------------------------------------
// Obaveze prema dobavljačima
// ---------------------------------------------------------------------------

export interface PayableItem {
  readonly supplier: string
  readonly amount: string
  readonly currency: string
  readonly dueDate: string
  readonly daysUntilDue: number
}

export interface Payables {
  readonly total: string
  readonly dueWithin7Days: string
  readonly currency: string
  readonly items: readonly PayableItem[]
}

export function payables(dataset: DemoDataset, orgId: string, today: Date): Payables {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:payables`))

  const items: PayableItem[] = profile.suppliers.map((supplier) => {
    // Neke obaveze su već dospele — negativan broj dana. To je stvarno stanje
    // u malim firmama i demo koji ga sakriva ne pomaže razgovoru.
    const daysUntilDue = Math.round(-8 + rand() * 46)
    const due = new Date(today.getTime() + daysUntilDue * 86_400_000)

    return {
      supplier,
      amount: (profile.dailyBase * (0.15 + rand() * 0.55)).toFixed(2),
      currency: profile.currency,
      dueDate: due.toISOString().slice(0, 10),
      daysUntilDue,
    }
  })

  const total = items.reduce((sum, i) => sum + Number(i.amount), 0)
  const soon = items
    .filter((i) => i.daysUntilDue <= 7)
    .reduce((sum, i) => sum + Number(i.amount), 0)

  return {
    total: total.toFixed(2),
    dueWithin7Days: soon.toFixed(2),
    currency: profile.currency,
    items: items.sort((a, b) => a.daysUntilDue - b.daysUntilDue),
  }
}

// ---------------------------------------------------------------------------
// Najveći dužnici
// ---------------------------------------------------------------------------

export interface Debtor {
  readonly customer: string
  readonly amount: string
  readonly currency: string
  readonly invoiceCount: number
  readonly oldestOverdueDays: number
}

/**
 * Sabira otvorene fakture po kupcu.
 *
 * Izvodi se iz `outstandingInvoices`, ne iz zasebnog generatora — inače bi
 * zbir po dužnicima bio drugačiji od ukupnih potraživanja, a to je greška koju
 * knjigovođa primeti prvi.
 */
export function topDebtors(dataset: DemoDataset, orgId: string, today: Date): Debtor[] {
  const invoices = outstandingInvoices(dataset, orgId, 0, today)
  const byCustomer = new Map<string, { amount: number; count: number; oldest: number }>()

  for (const invoice of invoices) {
    const current = byCustomer.get(invoice.customer) ?? { amount: 0, count: 0, oldest: 0 }
    byCustomer.set(invoice.customer, {
      amount: current.amount + Number(invoice.amount),
      count: current.count + 1,
      oldest: Math.max(current.oldest, invoice.overdueDays),
    })
  }

  const currency = PROFILES[dataset].currency

  return [...byCustomer.entries()]
    .map(([customer, v]) => ({
      customer,
      amount: v.amount.toFixed(2),
      currency,
      invoiceCount: v.count,
      oldestOverdueDays: v.oldest,
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount))
}

// ---------------------------------------------------------------------------
// Zaposleni
// ---------------------------------------------------------------------------

export interface HeadcountDepartment {
  readonly name: string
  readonly count: number
}

export interface Headcount {
  readonly total: number
  readonly departments: readonly HeadcountDepartment[]
}

export function headcount(dataset: DemoDataset, orgId: string): Headcount {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:headcount`))
  const total = profile.headcount + Math.floor(rand() * 5) - 2

  const departments = profile.departments.map((d) => ({
    name: d.name,
    count: Math.max(1, Math.round(total * d.share)),
  }))

  // Zbir po odeljenjima mora da bude jednak ukupnom broju; zaokruživanje ga
  // inače razmine za jedan-dva, a to je prvo što neko primeti na ekranu.
  const drift = total - departments.reduce((sum, d) => sum + d.count, 0)
  const adjusted = departments.map((d, i) =>
    i === 0 ? { ...d, count: Math.max(1, d.count + drift) } : d,
  )

  return { total: adjusted.reduce((sum, d) => sum + d.count, 0), departments: adjusted }
}
