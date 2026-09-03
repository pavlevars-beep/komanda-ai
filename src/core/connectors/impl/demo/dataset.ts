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

// ---------------------------------------------------------------------------
// Zalihe kao POKRIVENOST, ne kao stanje
// ---------------------------------------------------------------------------

export interface StockItem {
  readonly item: string
  readonly onHand: number
  readonly minimum: number
  /** Prosečna dnevna potrošnja u poslednjih 30 dana. */
  readonly averageDailySales: number
  /** Za koliko dana zaliha traje pri toj potrošnji. */
  readonly daysOfCover: number
  /** Uobičajeni rok isporuke dobavljača, u danima. */
  readonly leadTimeDays: number
}

/**
 * Stanje zaliha sa brzinom potrošnje.
 *
 * Golo stanje ne znači ništa. Pet komada artikla koji se prodaje dvaput
 * godišnje je zaliha za deset godina; pet stotina komada artikla koji ide
 * osamnaest dnevno je zaliha za dvadeset sedam dana. Prvi ne traži nikakvu
 * radnju, drugi možda traži hitnu — a po samom broju izgleda obrnuto.
 *
 * Zato se OVDE vraća i potrošnja i rok isporuke, a ocena rizika se izvodi
 * uzvodno, iz poslovnih pravila klijenta. Konektor ne odlučuje šta je
 * kritično: to je odluka firme, ne izvora podataka.
 *
 * Vraćaju se SVI artikli, ne samo problematični. Filtriranje ovde bi značilo
 * da se prekomerna zaliha nikad ne može ni primetiti, jer nikad ne stigne do
 * sloja koji je traži.
 */
export function stockItems(dataset: DemoDataset, orgId: string): StockItem[] {
  const profile = PROFILES[dataset]
  const rand = prng(hash(`${orgId}:${dataset}:stock`))

  return profile.items.map((item) => {
    const minimum = 40 + Math.floor(rand() * 120)
    const onHand = Math.floor(minimum * (0.15 + rand() * 2.4))

    /*
     * Potrošnja se namerno NE izvodi iz minimuma. Da jeste, pokrivenost bi
     * bila puka preformulacija odnosa stanja i minimuma, pa bi ceo pojam
     * brzine bio prazan — a razlika između ta dva je upravo ono što ovaj
     * proizvod treba da pokaže.
     */
    const averageDailySales = Math.round((0.4 + rand() * 14) * 10) / 10
    const leadTimeDays = 5 + Math.floor(rand() * 21)

    return {
      item,
      onHand,
      minimum,
      averageDailySales,
      daysOfCover: Math.round(onHand / Math.max(0.1, averageDailySales)),
      leadTimeDays,
    }
  })
}

// ---------------------------------------------------------------------------
// Starosna struktura potraživanja
// ---------------------------------------------------------------------------

export interface AgingBucket {
  /** Donja granica kašnjenja u danima; gornja je sledeći opseg. */
  readonly fromDays: number
  readonly toDays: number | null
  readonly amount: string
  readonly invoiceCount: number
}

export interface ReceivablesAging {
  readonly total: string
  readonly overdue: string
  readonly currency: string
  readonly buckets: readonly AgingBucket[]
  readonly asOf: string
}

/**
 * Potraživanja razvrstana po starosti.
 *
 * Opsezi su fiksni (0, 30, 60, 90) jer su to granice koje knjigovodstvo i
 * revizija koriste. Prag NA KOJEM se otvara upozorenje je zasebna stvar i
 * dolazi iz poslovnih pravila klijenta — jedno je kako se podatak grupiše,
 * drugo je od kada je to problem.
 *
 * Zbir opsega je jednak ukupnom iznosu jer se svi izvode iz ISTE liste
 * otvorenih faktura. Da se računaju odvojeno, knjigovođa bi prvi primetio da
 * se ne slažu — i s pravom prestao da veruje ostatku ekrana.
 */
export function receivablesAging(
  dataset: DemoDataset,
  orgId: string,
  today: Date,
): ReceivablesAging {
  const profile = PROFILES[dataset]
  const invoices = outstandingInvoices(dataset, orgId, 0, today)

  const edges: readonly [number, number | null][] = [
    [0, 30],
    [30, 60],
    [60, 90],
    [90, null],
  ]

  const buckets = edges.map(([fromDays, toDays]) => {
    const inBucket = invoices.filter(
      (i) => i.overdueDays >= fromDays && (toDays === null || i.overdueDays < toDays),
    )
    return {
      fromDays,
      toDays,
      amount: inBucket.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2),
      invoiceCount: inBucket.length,
    }
  })

  const total = invoices.reduce((sum, i) => sum + Number(i.amount), 0)
  const overdue = invoices
    .filter((i) => i.overdueDays > 0)
    .reduce((sum, i) => sum + Number(i.amount), 0)

  return {
    total: total.toFixed(2),
    overdue: overdue.toFixed(2),
    currency: profile.currency,
    buckets,
    asOf: today.toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Pregled prodaje za jutarnji brif
// ---------------------------------------------------------------------------

export interface SalesPeriod {
  readonly total: string
  readonly previousTotal: string
  readonly changePercent: number
}

export interface SalesSummary {
  readonly currency: string
  readonly yesterday: SalesPeriod
  readonly last7Days: SalesPeriod
  readonly monthToDate: SalesPeriod
  readonly asOf: string
}

function sumDays(dataset: DemoDataset, orgId: string, end: Date, days: number): number {
  let total = 0
  for (let i = 0; i < days; i++) {
    const day = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    total += Number(dailySales(dataset, orgId, day).total)
  }
  return total
}

/**
 * Prodaja juče, u sedam dana i od početka meseca, svaka sa poređenjem.
 *
 * Svaki zbir se SABIRA iz istih dnevnih vrednosti koje daje `dailySales`.
 * Nezavisno generisanje bilo kog od njih značilo bi da zbir sedam dana ne
 * odgovara zbiru sedam kartica — nesaglasnost koju korisnik otkrije prvi put
 * kada nešto sabere rukom, i posle koje prestane da veruje svakom broju na
 * ekranu.
 *
 * „Juče", ne „danas": dan koji je u toku nije uporediv ni sa čim, a prikazan
 * kao pad izgleda kao loša vest umesto kao nepotpun podatak.
 */
export function salesSummary(dataset: DemoDataset, orgId: string, today: Date): SalesSummary {
  const profile = PROFILES[dataset]
  const yesterday = new Date(today.getTime() - 86_400_000)
  const dayBefore = new Date(today.getTime() - 2 * 86_400_000)

  const change = (current: number, previous: number) =>
    previous === 0 ? 0 : Math.round(((current - previous) / previous) * 1000) / 10

  const period = (current: number, previous: number): SalesPeriod => ({
    total: current.toFixed(2),
    previousTotal: previous.toFixed(2),
    changePercent: change(current, previous),
  })

  const yesterdayTotal = Number(
    dailySales(dataset, orgId, yesterday.toISOString().slice(0, 10)).total,
  )
  const dayBeforeTotal = Number(
    dailySales(dataset, orgId, dayBefore.toISOString().slice(0, 10)).total,
  )

  const last7 = sumDays(dataset, orgId, yesterday, 7)
  const previous7 = sumDays(dataset, orgId, new Date(yesterday.getTime() - 7 * 86_400_000), 7)

  // Od prvog u mesecu do juče. Poređenje ide sa ISTIM brojem dana prethodnog
  // meseca — pun prethodni mesec bi uvek izgledao veći, pa bi svaki početak
  // meseca lažno prijavljivao pad.
  const daysThisMonth = yesterday.getUTCDate()
  const monthToDate = sumDays(dataset, orgId, yesterday, daysThisMonth)
  const previousMonthEnd = new Date(
    Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, daysThisMonth),
  )
  const previousMonth = sumDays(dataset, orgId, previousMonthEnd, daysThisMonth)

  return {
    currency: profile.currency,
    yesterday: period(yesterdayTotal, dayBeforeTotal),
    last7Days: period(last7, previous7),
    monthToDate: period(monthToDate, previousMonth),
    asOf: yesterday.toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Istorija prodaje po mesecima
// ---------------------------------------------------------------------------

export interface MonthlySales {
  readonly month: string
  readonly total: string
}

export interface SalesHistory {
  readonly currency: string
  readonly months: readonly MonthlySales[]
}

/**
 * Mesečna prodaja unazad, za poređenje i trend.
 *
 * Zbir meseca se SABIRA iz istih dnevnih vrednosti koje daje `dailySales`.
 * Nezavisno generisanje bi značilo da mesečna istorija ne odgovara zbiru
 * dnevnih kartica — a to je nesaglasnost koju korisnik otkrije prvi put kada
 * nešto sabere rukom.
 *
 * Tekući mesec se IZOSTAVLJA. Nepotpun mesec u nizu izgleda kao nagli pad na
 * kraju grafikona, i to je najčešće pogrešno pročitana slika u celom prikazu.
 */
export function salesHistory(
  dataset: DemoDataset,
  orgId: string,
  today: Date,
  years: number,
): SalesHistory {
  const profile = PROFILES[dataset]
  const months: MonthlySales[] = []

  const count = Math.max(1, Math.min(10, years)) * 12

  for (let back = count; back >= 1; back--) {
    const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1))
    const year = anchor.getUTCFullYear()
    const month = anchor.getUTCMonth()
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

    let total = 0
    for (let d = 1; d <= days; d++) {
      const iso = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10)
      total += Number(dailySales(dataset, orgId, iso).total)
    }

    months.push({
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      total: total.toFixed(2),
    })
  }

  return { currency: profile.currency, months }
}
