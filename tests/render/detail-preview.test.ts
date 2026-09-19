import { writeFileSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocationAnalysis } from '@/app/(workspace)/w/[orgSlug]/maloprodaja/[locationId]/analysis'
import { SeasonChart } from '@/ui/charts/season-chart'
import { demoNetwork } from '@/core/retail/demo-network'
import { seasonalComparison } from '@/core/retail/analytics'
import { DEFAULT_BUSINESS_RULES } from '@/core/rules/business-rules'
import { sr } from '@/i18n/messages/sr'

/* Alat za gledanje: nalazi moraju da se ČITAJU kao nalazi, ne kao brojevi. */
const OUT = process.env['DETAIL_PREVIEW_OUT']

describe.runIf(OUT)('pregled dubinskog prikaza', () => {
  it('iscrtava istoriju i nalaze', () => {
    const network = demoNetwork('europrofil', new Date('2026-09-19T08:00:00Z'))
    const location = network.find((l) => l.id === 'nis')!
    const L = 'sr-Latn-RS'

    const money = (v: string | number, c: string) =>
      new Intl.NumberFormat(L, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v))
    const number = (v: number) => new Intl.NumberFormat(L).format(v)
    const percent = (v: number) =>
      new Intl.NumberFormat(L, { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)

    const chart = renderToStaticMarkup(
      SeasonChart({
        points: seasonalComparison(location.history),
        currency: location.currency,
        money: (v, c) => money(v, c),
        monthLabel: (m) =>
          new Intl.DateTimeFormat(L, { month: 'short', year: '2-digit' }).format(new Date(`${m}-01T00:00:00Z`)),
        labels: {
          title: sr['retail.history'],
          thisYear: sr['retail.history.thisYear'],
          lastYear: sr['retail.history.lastYear'],
          tableLabel: sr['retail.history.table'],
          monthHeader: sr['retail.col.month'],
          valueHeader: sr['retail.col.revenue'],
        },
      }),
    )

    const analysis = renderToStaticMarkup(
      LocationAnalysis({
        location,
        rules: DEFAULT_BUSINESS_RULES,
        orgSlug: 'europrofil',
        money,
        number,
        percent,
        question: () => 'pitanje',
        itemsPhrase: (count) => {
          const form = new Intl.PluralRules(L).select(count)
          return (sr[`retail.items.${form}` as 'retail.items.one'] ?? '{count}').replace(
            '{count}',
            String(count),
          )
        },
        labels: {
          deadTitle: sr['retail.dead.title'],
          deadEmpty: sr['retail.dead.empty'],
          deadFinding: sr['retail.dead.finding'],
          shortageTitle: sr['retail.shortage.title'],
          shortageEmpty: sr['retail.shortage.empty'],
          shortageFinding: sr['retail.shortage.finding'],
          volumeTitle: sr['retail.volume.title'],
          volumeEmpty: sr['retail.volume.empty'],
          volumeFinding: sr['retail.volume.finding'],
          abcTitle: sr['retail.abc.title'],
          abcFinding: sr['retail.abc.finding'],
          colProduct: sr['retail.col.product'],
          colStock: sr['retail.col.stock'],
          colValue: sr['retail.col.value'],
          colLastSold: sr['retail.col.lastSold'],
          colCover: sr['retail.col.cover'],
          colLead: sr['retail.col.lead'],
          colRevenue: sr['retail.col.revenue'],
          colMargin: sr['retail.margin'],
          colShare: sr['retail.col.share'],
          days: sr['retail.days'],
          ask: sr['retail.analysisAsk'],
        },
      }),
    )

    const read = (p: string) => readFileSync(p, 'utf8')
    writeFileSync(
      `${OUT}/detalj.html`,
      `<!doctype html><meta charset="utf-8"><style>
        ${read('src/ui/theme/tokens.css')}
        ${read('src/ui/charts/season-chart.module.css')}
        ${read('src/app/(workspace)/w/[orgSlug]/maloprodaja/retail.module.css')}
        body{background:var(--ground);margin:0;padding:32px;color:var(--ink);
             font-family:Inter,system-ui,sans-serif;font-size:14.5px;
             font-variant-numeric:tabular-nums;letter-spacing:-0.006em}
        h1{font-size:24px;font-weight:600;margin:0 0 8px}
        .box{padding:20px;background:var(--surface);border:1px solid var(--line);
             border-radius:11px;box-shadow:var(--shadow-sm);margin-bottom:16px}
        h2{font-size:16px;font-weight:600;margin:0 0 12px}
       </style>
       <h1>Niš</h1>
       <div class="box"><h2>Mesečni tok</h2>${chart}</div>
       ${analysis}`,
    )

    expect(analysis).toContain('Mrtav novac')
  })
})
