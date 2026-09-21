import { writeFileSync, readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

/* Traka osvežavanja traži ruter; ovde se gleda raspored, ne kretanje. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
import { renderToStaticMarkup } from 'react-dom/server'
import { MetricsBoard } from '@/app/(workspace)/w/[orgSlug]/board'
import { DEFAULT_BUSINESS_RULES } from '@/core/rules/business-rules'
import { createTranslator } from '@/i18n/translator'

/* Alat za gledanje, ne test. Raspored se ne vidi ni u jednoj tvrdnji. */
const OUT = process.env['BOARD_PREVIEW_OUT']

const L = 'sr-Latn-RS'
const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}`

/* Trideset dana sa nedeljnim ritmom — vikend niži, jedan dan izrazito jak. */
const DAILY = Array.from({ length: 30 }, (_, i) => {
  const weekday = (i + 2) % 7
  const base = weekday === 6 ? 0.42 : weekday === 5 ? 0.78 : 1
  const wave = 1 + Math.sin(i / 3.2) * 0.14
  const peak = i === 21 ? 1.55 : 1
  return { date: day(i + 1), total: Math.round(1_180_000 * base * wave * peak).toString() }
})

describe.runIf(OUT)('pregled table', () => {
  it('iscrtava traku, pojaseve i grafikone', () => {
    const { t } = createTranslator('sr')

    const money = (v: string | number, c: string) =>
      new Intl.NumberFormat(L, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v))
    const parts = (v: string | number, c: string) => {
      const p = new Intl.NumberFormat(L, { style: 'currency', currency: c, maximumFractionDigits: 0 }).formatToParts(Number(v))
      return {
        value: p.filter((x) => x.type !== 'currency').map((x) => x.value).join('').trim(),
        unit: p.find((x) => x.type === 'currency')?.value ?? '',
      }
    }

    const html = renderToStaticMarkup(
      MetricsBoard({
        rules: DEFAULT_BUSINESS_RULES,
        refreshSeconds: 120,
        board: {
          readAt: '2026-09-21T08:00:00Z',
          daily: { data: { currency: 'RSD', days: DAILY } },
          history: {
            data: {
              currency: 'RSD',
              months: Array.from({ length: 13 }, (_, i) => {
                const d = new Date(Date.UTC(2025, 8 + i, 1))
                return {
                  month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
                  total: Math.round(28_000_000 * (1 + Math.sin(i / 2) * 0.18)).toString(),
                }
              }),
            },
          },
          financial: {
            data: {
              from: '2026-08-22', to: '2026-09-21',
              revenue: '34800000', expenses: '28900000', profit: '5900000',
              marginPercent: 16.9, previousRevenue: '32100000', currency: 'RSD',
            },
          },
          headcount: {
            data: {
              total: 84,
              departments: [
                { name: 'Maloprodaja', count: 38 },
                { name: 'Veleprodaja', count: 17 },
                { name: 'Magacin', count: 14 },
                { name: 'Montaža', count: 9 },
                { name: 'Uprava', count: 6 },
              ],
            },
          },
        },
        brief: {
          attention: [], rules: DEFAULT_BUSINESS_RULES, oldestAsOf: null, staleBlocks: 0,
          debtors: { unavailable: 'capability_disabled' },
          sales: {
            data: {
              currency: 'RSD', asOf: '2026-09-21T06:00:00Z',
              yesterday: { total: '1240000', previousTotal: '1090000', changePercent: 13.8 },
              last7Days: { total: '7980000', previousTotal: '8310000', changePercent: -4 },
              monthToDate: { total: '24310000', previousTotal: '21870000', changePercent: 11.2 },
            },
          },
          receivables: {
            data: {
              total: '18400000', overdue: '6250000', currency: 'RSD', asOf: '2026-09-21T06:00:00Z',
              buckets: [
                { fromDays: 0, toDays: 30, amount: '9400000', invoiceCount: 112 },
                { fromDays: 31, toDays: 60, amount: '4350000', invoiceCount: 48 },
                { fromDays: 61, toDays: 90, amount: '2400000', invoiceCount: 21 },
                { fromDays: 91, toDays: null, amount: '2250000', invoiceCount: 17 },
              ],
            },
          },
          payables: { data: { total: '11200000', dueWithin7Days: '3150000', currency: 'RSD', items: [] } },
          stock: {
            data: {
              items: [
                { item: 'Okov za klizna vrata, 80 kg', onHand: 42, minimum: 60, averageDailySales: 4.8, daysOfCover: 9, leadTimeDays: 28 },
                { item: 'Aluminijumska lajsna 2,7 m', onHand: 180, minimum: 200, averageDailySales: 12.5, daysOfCover: 14, leadTimeDays: 21 },
                { item: 'Šarka sa prigušenjem', onHand: 640, minimum: 400, averageDailySales: 31, daysOfCover: 21, leadTimeDays: 14 },
                { item: 'Cilindar 30/40, mesing', onHand: 210, minimum: 150, averageDailySales: 6.2, daysOfCover: 34, leadTimeDays: 10 },
                { item: 'Ručica za prozor, bela', onHand: 900, minimum: 300, averageDailySales: 18, daysOfCover: 50, leadTimeDays: 7 },
                { item: 'Profil za LED, 2 m', onHand: 320, minimum: 120, averageDailySales: 4.1, daysOfCover: 78, leadTimeDays: 35 },
              ],
            },
          },
        },
        f: {
          t,
          money,
          moneyParts: parts,
          number: (v) => new Intl.NumberFormat(L).format(v),
          percent: (v) => new Intl.NumberFormat(L, { style: 'percent', maximumFractionDigits: 1 }).format(v / 100),
          compact: (v, c) => new Intl.NumberFormat(L, { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(v),
          monthLabel: (m) => new Intl.DateTimeFormat(L, { month: 'short', year: '2-digit' }).format(new Date(`${m}-01T00:00:00Z`)),
          dayLabel: (d) => new Intl.DateTimeFormat(L, { day: 'numeric', month: 'numeric' }).format(new Date(`${d}T00:00:00Z`)),
        },
      }),
    )

    const read = (p: string) => readFileSync(p, 'utf8')

    writeFileSync(
      `${OUT}/tabla.html`,
      `<!doctype html><meta charset="utf-8"><style>
        ${read('src/ui/theme/tokens.css')}
        ${read('src/ui/charts/charts.module.css')}
        ${read('src/app/(workspace)/w/[orgSlug]/board.module.css')}
        ${read('src/ui/primitives/ChangeChip.module.css')}
        body{background:var(--ground);margin:0;padding:32px;color:var(--ink);
             font-family:Inter,system-ui,sans-serif;font-size:14.5px;
             font-variant-numeric:tabular-nums;letter-spacing:-0.006em}
       </style>${html}`,
    )

    expect(html).toContain('heroValue')
  })
})
