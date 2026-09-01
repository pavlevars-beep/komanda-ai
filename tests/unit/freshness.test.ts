import { describe, expect, it } from 'vitest'
import { freshnessState } from '@/core/shared/freshness'

const NOW = new Date('2026-03-16T12:00:00Z')
const at = (offsetSeconds: number) =>
  new Date(NOW.getTime() + offsetSeconds * 1000).toISOString()

describe('svežina podatka', () => {
  it('poštuje dogovoreni prag izvora', () => {
    expect(freshnessState({ asOf: at(-300), slaSeconds: 900 }, NOW)).toBe('fresh')
    expect(freshnessState({ asOf: at(-1800), slaSeconds: 900 }, NOW)).toBe('aging')
    expect(freshnessState({ asOf: at(-5400), slaSeconds: 900 }, NOW)).toBe('stale')
  })

  it('bez zadatog praga koristi jedan sat', () => {
    expect(freshnessState({ asOf: at(-60) }, NOW)).toBe('fresh')
    expect(freshnessState({ asOf: at(-7200) }, NOW)).toBe('aging')
  })

  it('podnosi mali pomeraj satova umesto da prijavi nepoznato', () => {
    // Sat na ERP-u klijenta odstupa par sekundi; podatak je i dalje svež.
    expect(freshnessState({ asOf: at(5), slaSeconds: 900 }, NOW)).toBe('fresh')
    expect(freshnessState({ asOf: at(120), slaSeconds: 900 }, NOW)).toBe('fresh')
  })

  it('vreme daleko u budućnosti i dalje smatra sumnjivim', () => {
    // Najčešće pogrešna vremenska zona na izvoru — bolje ne tvrditi ništa.
    expect(freshnessState({ asOf: at(3600), slaSeconds: 900 }, NOW)).toBe('unknown')
  })

  it('ne tvrdi ništa kada vremena nema ili je neispravno', () => {
    expect(freshnessState(undefined, NOW)).toBe('unknown')
    expect(freshnessState({ asOf: '' }, NOW)).toBe('unknown')
    expect(freshnessState({ asOf: 'juče' }, NOW)).toBe('unknown')
  })
})
