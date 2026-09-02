import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, resolveLocale } from '@/i18n/config'

/**
 * Redosled izbora jezika je proizvod, ne detalj.
 *
 * Stvarni kvar koji je ovo otkrio: korisnik sa pregledačem na engleskom dobio
 * je ceo proizvod na engleskom i nije imao čime da ga prebaci — prekidač nije
 * postojao, a kolačić koji su javne stranice čitale niko nije ni upisivao.
 */
describe('izbor jezika', () => {
  it('izričit izbor pobeđuje sve ostalo', () => {
    // Da profil ima prednost, prekidač na ekranu ne bi radio za prijavljenog
    // korisnika — dugme koje izgleda da radi a ne radi.
    expect(
      resolveLocale({
        chosenLocale: 'sr',
        userLocale: 'en',
        organizationLocale: 'en',
        acceptLanguage: 'en-GB,en;q=0.9',
      }),
    ).toBe('sr')
  })

  it('profil pobeđuje organizaciju i pregledač', () => {
    expect(
      resolveLocale({ userLocale: 'en', organizationLocale: 'sr', acceptLanguage: 'sr' }),
    ).toBe('en')
  })

  it('bez ičega drugog odlučuje Accept-Language', () => {
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en')
    expect(resolveLocale({ acceptLanguage: 'sr-RS,sr;q=0.9' })).toBe('sr')
  })

  it('podrazumevani jezik je srpski', () => {
    expect(DEFAULT_LOCALE).toBe('sr')
    expect(resolveLocale({})).toBe('sr')
    // Nepoznat jezik pregledača ne sme da nas odvede u engleski.
    expect(resolveLocale({ acceptLanguage: 'de-DE,de;q=0.9' })).toBe('sr')
  })

  it('podmetnuta vrednost u kolačiću se ignoriše', () => {
    // Kolačić dolazi od klijenta; nepoznata vrednost ne sme da prođe do
    // prevodioca, koji bi na njoj pukao.
    expect(resolveLocale({ chosenLocale: 'klingon' })).toBe('sr')
    expect(resolveLocale({ chosenLocale: '../../etc/passwd', acceptLanguage: 'en' })).toBe('en')
  })
})
