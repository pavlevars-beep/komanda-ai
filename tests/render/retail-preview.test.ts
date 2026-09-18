import { writeFileSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RetailMap } from '@/ui/charts/retail-map'
import { LocationCards } from '@/app/(workspace)/w/[orgSlug]/maloprodaja/location-cards'
import { demoNetwork } from '@/core/retail/demo-network'
import { averageMargin, networkTotals } from '@/core/retail/network'

/* Alat za gledanje, ne test. Raspored se ne vidi ni u jednoj tvrdnji. */
const OUT = process.env['RETAIL_PREVIEW_OUT']

describe.runIf(OUT)('pregled ekrana mreže', () => {
  it('iscrtava kartu i kartice zajedno', () => {
    const locations = demoNetwork('europrofil', new Date('2026-09-18T08:00:00Z'))
    const L = 'sr-Latn-RS'

    const money = (v: string, c: string) =>
      new Intl.NumberFormat(L, { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number(v))
    const compact = (v: string, c: string) =>
      new Intl.NumberFormat(L, { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))
    const number = (v: number) => new Intl.NumberFormat(L).format(v)
    const percent = (v: number) =>
      new Intl.NumberFormat(L, { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)

    const map = renderToStaticMarkup(
      RetailMap({
        locations,
        money: compact,
        labels: {
          title: 'Prodajna mreža',
          aboveAverage: 'Marža iznad proseka mreže',
          average: 'Na proseku',
          belowAverage: 'Marža ispod proseka',
          bubbleMeaning: 'Veličina kruga = broj računa ovog meseca',
        },
      }),
    )

    const cards = renderToStaticMarkup(
      LocationCards({
        locations,
        orgSlug: 'europrofil',
        money,
        number,
        percent,
        labels: {
          monthToDate: 'Od početka meseca',
          margin: 'Marža',
          receipts: 'Računa',
          topProducts: 'Najprodavanije',
          seeMore: 'Vidi više',
          aboveAverage: 'iznad proseka',
          belowAverage: 'ispod proseka',
          onAverage: 'na proseku',
        },
      }),
    )

    const summary = networkTotals(locations)
      .map(
        (t) =>
          `<div class="summaryCard"><span class="summaryLabel">Promet u ${t.currency}</span>
           <span class="summaryValue">${money(t.total, t.currency)}</span>
           <span class="summaryMeta">${t.locationCount === 1 ? "objekat" : t.locationCount < 5 ? "objekta" : "objekata"}</span></div>`,
      )
      .join('')

    const read = (p: string) => readFileSync(p, 'utf8')

    writeFileSync(
      `${OUT}/mreza.html`,
      `<!doctype html><meta charset="utf-8"><style>
        ${read('src/ui/theme/tokens.css')}
        ${read('src/ui/charts/retail-map.module.css')}
        ${read('src/app/(workspace)/w/[orgSlug]/maloprodaja/retail.module.css')}
        body{background:var(--ground);margin:0;padding:32px;color:var(--ink);
             font-family:Inter,system-ui,sans-serif;font-size:14.5px;
             font-variant-numeric:tabular-nums;letter-spacing:-0.006em}
        h1{font-size:24px;font-weight:600;letter-spacing:-0.014em;margin:0 0 20px}
       </style>
       <h1>Prodajna mreža</h1>
       <div class="summary">${summary}
         <div class="summaryCard"><span class="summaryLabel">Prosečna marža</span>
           <span class="summaryValue">${percent(averageMargin(locations))}</span>
           <span class="summaryMeta">Ponderisano prometom</span></div>
       </div>
       <div class="split" style="margin-top:20px">
         <section class="mapPane">${map}</section>
         <section class="cardsPane">${cards}</section>
       </div>`,
    )

    expect(map).toContain('<svg')
    expect(cards).toContain('Vidi više')
  })
})
