import { writeFileSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Brief } from '@/app/(workspace)/w/[orgSlug]/brief'
import { YearOverYear } from '@/app/(workspace)/w/[orgSlug]/kontekst/year-over-year'
import { DEFAULT_BUSINESS_RULES } from '@/core/rules/business-rules'
import { createTranslator } from '@/i18n/translator'

/* Alat za gledanje, ne test. Raspored se ne vidi ni u jednoj tvrdnji. */
const OUT = process.env['BRIEF_PREVIEW_OUT']

const L = 'sr-Latn-RS'

describe.runIf(OUT)('pregled brifa i konteksta', () => {
  it('iscrtava oznake promene sa osnovom poređenja', () => {
    const { t, formatDate } = createTranslator('sr')

    const money = (amount: number | string, currency: string) =>
      new Intl.NumberFormat(L, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
    const percent = (v: number) =>
      new Intl.NumberFormat(L, { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)

    const brief = renderToStaticMarkup(
      Brief({
        orgSlug: 'europrofil',
        greeting: 'Dobro jutro, Pavle',
        sections: ['sales', 'receivables'],
        f: {
          t,
          money,
          number: (v) => new Intl.NumberFormat(L).format(v),
          percent,
          date: (v) => formatDate(v),
        },
        brief: {
          attention: [], rules: DEFAULT_BUSINESS_RULES, oldestAsOf: null, staleBlocks: 0,
          debtors: { unavailable: 'capability_disabled' },
          payables: { unavailable: 'capability_disabled' },
          stock: { unavailable: 'capability_disabled' },
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
                { fromDays: 31, toDays: null, amount: '9000000', invoiceCount: 86 },
              ],
            },
          },
        },
      }),
    )

    const kontekst = renderToStaticMarkup(
      YearOverYear({
        t,
        money: (v: number) => money(v, 'RSD'),
        percent,
        yoy: {
          current: { month: '2026-09', total: 31_400_000, baseline: 29_800_000, events: [], adjusted: true },
          previous: { month: '2025-09', total: 26_900_000, baseline: 28_100_000, events: [], adjusted: true },
          rawChangePercent: 16.7,
          adjustedChangePercent: -6,
          needsNote: true,
        },
      }),
    )

    const read = (p: string) => readFileSync(p, 'utf8')

    /*
     * Dva fajla, ne jedan.
     *
     * U pregledu imena razreda nisu opsegovana, pa dva modula koja oba imaju
     * `.row` prepisuju jedan drugog: `brief` ga definiše kao flex red, a
     * `kontekst` kao mrežu, i brif se u zajedničkom fajlu raspao na dva reda
     * po stavci — kvar koji postoji samo u pregledu, ali koji je tražio pola
     * sata da se ne proglasi pravim.
     */
    const stranica = (body: string, ...css: readonly string[]) =>
      `<!doctype html><meta charset="utf-8"><style>
        ${read('src/ui/theme/tokens.css')}
        ${css.map(read).join('\n')}
        ${read('src/ui/primitives/ChangeChip.module.css')}
        body{background:var(--ground);margin:0;padding:32px;color:var(--ink);
             font-family:Inter,system-ui,sans-serif;font-size:14.5px;
             font-variant-numeric:tabular-nums;letter-spacing:-0.006em}
       </style>${body}`

    writeFileSync(
      `${OUT}/brif.html`,
      stranica(brief, 'src/app/(workspace)/w/[orgSlug]/brief.module.css'),
    )
    writeFileSync(
      `${OUT}/kontekst.html`,
      stranica(
        `<div class="page">${kontekst}</div>`,
        'src/app/(workspace)/w/[orgSlug]/kontekst/context.module.css',
      ),
    )

    expect(brief).toContain('chip')
    expect(kontekst).toContain('chip')
  })
})
