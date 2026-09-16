import { describe, expect, it } from 'vitest'
import { splitMoney } from '@/core/shared/money'

describe('rastavljanje iznosa na brojku i valutu', () => {
  it('brojka ostaje bez oznake valute', () => {
    const { value, unit } = splitMoney('42980000', 'RSD', 'sr-RS')
    expect(unit).toBe('RSD')
    expect(value).not.toContain('RSD')
    expect(value.replace(/\D/g, '')).toBe('42980000')
  })

  /*
   * Razmak između broja i valute ostaje u „literal" delu. Da nije uklonjen,
   * brojka bi nosila nevidljiv rep i desno poravnanje u koloni bi promašilo za
   * širinu razmaka — taman toliko da izgleda kao nemar.
   */
  it('brojka nema rep od razmaka', () => {
    const { value } = splitMoney('1284500', 'RSD', 'sr-RS')
    expect(value).toBe(value.trim())
  })

  /*
   * U engleskom valuta stoji ISPRED broja. Sečenje niske sa kraja bi tu
   * odsekalo cifre umesto oznake — zato ide kroz formatToParts.
   */
  it('valuta ispred broja se isto nalazi', () => {
    const { value, unit } = splitMoney('1500', 'USD', 'en-US')
    expect(unit).toBe('$')
    expect(value).toBe('1,500')
  })

  it('brojka je ista kao u punom zapisu', () => {
    const full = new Intl.NumberFormat('sr-RS', {
      style: 'currency',
      currency: 'RSD',
      maximumFractionDigits: 0,
    }).format(42980000)
    const { value, unit } = splitMoney('42980000', 'RSD', 'sr-RS')
    expect(full).toContain(value)
    expect(full).toContain(unit)
  })
})
