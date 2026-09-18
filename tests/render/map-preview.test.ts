import { writeFileSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RetailMap } from '@/ui/charts/retail-map'
import { demoNetwork } from '@/core/retail/demo-network'

/*
 * Ovo NIJE test nego alat za gledanje.
 *
 * Validator proverava boje, ne raspored. Sudar natpisa, krug koji izlazi iz
 * okvira i preklopljena Beogradska dva se vide samo kada se karta iscrta i
 * pogleda — pa se ovde iscrtava u datoteku koju onda otvara pregledač.
 */

const OUT = process.env['MAP_PREVIEW_OUT']

describe.runIf(OUT)('pregled karte', () => {
  it('iscrtava kartu sa demo mrežom', () => {
    const locations = demoNetwork('europrofil', new Date('2026-09-18T08:00:00Z'))

    const money = (value: string, currency: string) =>
      new Intl.NumberFormat('sr-Latn-RS', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(Number(value))

    const svg = renderToStaticMarkup(
      RetailMap({
        locations,
        money,
        labels: {
          title: 'Prodajna mreža',
          aboveAverage: 'Marža iznad proseka mreže',
          average: 'Na proseku',
          belowAverage: 'Marža ispod proseka',
          bubbleMeaning: 'Veličina kruga = broj računa ovog meseca',
        },
      }),
    )

    const tokens = readFileSync('src/ui/theme/tokens.css', 'utf8')
    const css = readFileSync('src/ui/charts/retail-map.module.css', 'utf8')

    // CSS moduli u vitestu daju prazan objekat, pa se klase ne primene same.
    // Zato se ovde stil ubacuje kao obične klase istog imena.
    writeFileSync(
      `${OUT}/karta.html`,
      `<!doctype html><meta charset="utf-8"><style>${tokens}${css}
       body{background:var(--ground);margin:0;padding:24px;font-family:Inter,system-ui,sans-serif}
       </style>${svg}`,
    )

    expect(svg).toContain('<svg')
  })
})
