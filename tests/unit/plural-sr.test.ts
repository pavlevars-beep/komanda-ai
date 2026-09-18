import { describe, expect, it } from 'vitest'
import { sr } from '@/i18n/messages/sr'
import { en } from '@/i18n/messages/en'

/*
 * Srpska množina ima TRI oblika, ne dva.
 *
 * Ovo je bila prava greška na ekranu: „1 objekata". Engleski jednina/množina je
 * ne hvata, a govornik je vidi odmah — i sa njom ode i poverenje u brojku pored
 * koje stoji.
 *
 * Pravilo se ne prepisuje u kod nego se pita `Intl.PluralRules`. Ovaj test
 * čuva dve stvari: da to pravilo daje ono što mislimo, i da za svaki oblik koji
 * ono ume da vrati postoji ključ u prevodu.
 */

const SR = 'sr-Latn-RS'

describe('srpska množina', () => {
  it('ima tri oblika, i dvadeset jedan se ponaša kao jedan', () => {
    const plural = new Intl.PluralRules(SR)
    expect(plural.select(1)).toBe('one')
    expect(plural.select(3)).toBe('few')
    expect(plural.select(5)).toBe('other')
    // 21 objekat, ne 21 objekata — zamka koju „n === 1" ne hvata.
    expect(plural.select(21)).toBe('one')
    expect(plural.select(22)).toBe('few')
  })

  it('za svaki oblik postoji ključ u oba jezika', () => {
    const forms = new Set<string>()
    const plural = new Intl.PluralRules(SR)
    // Dovoljno da se pokriju sve tri kategorije koje srpski koristi.
    for (let n = 0; n <= 120; n++) forms.add(plural.select(n))

    for (const form of forms) {
      const key = `retail.locationCount.${form}`
      expect(Object.keys(sr), `nedostaje ${key} u sr`).toContain(key)
      expect(Object.keys(en), `nedostaje ${key} u en`).toContain(key)
    }
  })

  it('oblici nisu isti tekst — inače ključevi postoje a ne rade ništa', () => {
    expect(sr['retail.locationCount.one']).not.toBe(sr['retail.locationCount.few'])
    expect(sr['retail.locationCount.few']).not.toBe(sr['retail.locationCount.other'])
  })
})
