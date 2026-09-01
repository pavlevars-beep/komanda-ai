import { describe, expect, it } from 'vitest'
import { isValidSlug, slugify } from '@/core/shared/slug'

describe('adresa radnog prostora', () => {
  it('preslovljava srpske dijakritike umesto da ih kodira', () => {
    expect(slugify('Čačak Trade')).toBe('cacak-trade')
    expect(slugify('Šećer i Žito')).toBe('secer-i-zito')
    expect(slugify('Đorđević doo')).toBe('djordjevic-doo')
    expect(slugify('Miloš Ćirić')).toBe('milos-ciric')
  })

  it('skida dijakritike i iz drugih jezika', () => {
    expect(slugify('Café Über')).toBe('cafe-uber')
  })

  it('uklanja pravni oblik i interpunkciju u crtice', () => {
    expect(slugify('Nova Firma d.o.o.')).toBe('nova-firma-d-o-o')
    expect(slugify('A & B  Trade')).toBe('a-b-trade')
  })

  it('ne ostavlja crticu na krajevima', () => {
    expect(slugify('  -Firma-  ')).toBe('firma')
    expect(slugify('Firma!!!')).toBe('firma')
  })

  it('poštuje dužinu i ne završava crticom posle sečenja', () => {
    const long = slugify('a'.repeat(40) + ' ' + 'b'.repeat(40))
    expect(long.length).toBeLessThanOrEqual(50)
    expect(long.endsWith('-')).toBe(false)
  })

  it('prihvata samo oblike koje baza dozvoljava', () => {
    expect(isValidSlug('nova-firma')).toBe(true)
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('-firma')).toBe(false)
    expect(isValidSlug('firma-')).toBe(false)
    expect(isValidSlug('Firma')).toBe(false)
    expect(isValidSlug('firma_1')).toBe(false)
  })

  it('rezultat slugify prolazi proveru koju sprovodi baza', () => {
    for (const name of ['Čačak Trade', 'Demo Distribucija', 'Hotel Grupa Beograd']) {
      expect(isValidSlug(slugify(name)), name).toBe(true)
    }
  })
})
