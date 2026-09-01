import { describe, expect, it } from 'vitest'
import { formatCardValue, formatChange } from '@/core/dashboard/format'
import type { DashboardCard } from '@/core/dashboard/loader'

function card(over: Partial<DashboardCard>): DashboardCard {
  return {
    cardId: 'c1',
    title: { sr: 'Test', en: 'Test' },
    format: 'number',
    classification: 'fact',
    ...over,
  }
}

describe('formatiranje vrednosti kartice', () => {
  it('skraćuje velike novčane iznose', () => {
    const out = formatCardValue(
      card({ format: 'money', value: '2400000', currency: 'RSD' }),
      'sr-Latn-RS',
    )
    // Poenta kartice je da se pročita u jednom pogledu.
    expect(out).toBeDefined()
    expect(out!.length).toBeLessThan(15)
    expect(out).toMatch(/2[,.]4/)
  })

  it('male iznose prikazuje u celini', () => {
    const out = formatCardValue(card({ format: 'money', value: '4520', currency: 'EUR' }), 'en-GB')
    expect(out).toContain('4,520')
  })

  it('poštuje valutu iz podatka, ne pretpostavlja dinare', () => {
    const eur = formatCardValue(card({ format: 'money', value: '1000', currency: 'EUR' }), 'en-GB')
    expect(eur).toContain('€')
  })

  it('broji stavke bez valute', () => {
    expect(formatCardValue(card({ format: 'count', value: '4' }), 'sr-Latn-RS')).toBe('4')
  })

  it('ne ruši se na vrednosti koja nije broj', () => {
    expect(formatCardValue(card({ format: 'number', value: 'n/d' }), 'sr-Latn-RS')).toBe('n/d')
  })

  it('vraća undefined kada vrednosti nema', () => {
    expect(formatCardValue(card({ unavailable: 'integration_down' }), 'sr-Latn-RS')).toBeUndefined()
  })
})

describe('formatiranje promene', () => {
  it('uvek prikazuje znak, i za rast i za pad', () => {
    expect(formatChange(18.4, 'en-GB')).toMatch(/^\+/)
    expect(formatChange(-7.2, 'en-GB')).toMatch(/^-/)
  })

  it('nulu prikazuje bez znaka', () => {
    expect(formatChange(0, 'en-GB')).not.toMatch(/^\+/)
  })

  it('izostaje kada poređenja nema', () => {
    expect(formatChange(undefined, 'en-GB')).toBeUndefined()
  })
})
