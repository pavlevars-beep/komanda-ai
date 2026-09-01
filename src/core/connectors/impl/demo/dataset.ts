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
