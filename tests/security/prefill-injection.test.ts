import { describe, expect, it } from 'vitest'
import { isMessageKey } from '@/i18n/translator'
import { actionFor, suggestedAction } from '@/core/ai/actions'
import { isMessageRole } from '@/core/messages/repository'
import type { Permission } from '@/core/auth/permissions'

/**
 * Predlog radnje prosleđuje unapred popunjen obrazac kroz ADRESU, a adresu
 * piše ko god hoće.
 *
 * Bez provere bi se kroz upitni parametar mogao podmetnuti proizvoljan tekst
 * i poslati celoj upravi pod izgledom poruke koju je sistem predložio. Zato
 * putanja nosi KLJUČEVE prevoda, ne tekst, i prihvata se samo ono što stvarno
 * postoji u katalogu.
 */
describe('unapred popunjen obrazac ne prima proizvoljan tekst', () => {
  it('prihvata samo postojeći ključ iz kataloga', () => {
    expect(isMessageKey('action.prefill.collection.title')).toBe(true)
    expect(isMessageKey('action.prefill.izmisljeno')).toBe(false)
    expect(isMessageKey('Molimo uplatite na račun 123-456')).toBe(false)
  })

  it('ne propušta nasleđena svojstva objekta', () => {
    // `key in obj` bi ovde vratio true i pustio vrednost iz prototipa.
    expect(isMessageKey('toString')).toBe(false)
    expect(isMessageKey('constructor')).toBe(false)
    expect(isMessageKey('__proto__')).toBe(false)
  })

  it('rola primaoca se prihvata samo iz zatvorenog spiska', () => {
    expect(isMessageRole('finance')).toBe(true)
    expect(isMessageRole('super_admin')).toBe(false)
    expect(isMessageRole('svi')).toBe(false)
  })

  /*
   * Svaki ključ koji predlog šalje mora da postoji. Ako neko doda radnju a
   * zaboravi prevod, obrazac bi se tiho otvorio prazan — a korisnik bi mislio
   * da je predlog neispravan.
   */
  it('svi ključevi koje predlozi šalju postoje u katalogu', () => {
    const intents = [
      'get_top_debtors',
      'get_outstanding_invoices',
      'get_payables',
      'get_inventory_alerts',
      'get_stock_status',
    ] as const

    for (const intent of intents) {
      const action = suggestedAction(intent)
      expect(action, intent).not.toBeNull()
      expect(isMessageKey(action!.labelKey), action!.labelKey).toBe(true)
      expect(isMessageKey(action!.prefill!.title), action!.prefill!.title).toBe(true)
      expect(isMessageKey(action!.prefill!.body), action!.prefill!.body).toBe(true)
      expect(isMessageRole(action!.prefill!.roles)).toBe(true)
    }
  })
})

describe('predlog se ne nudi bez prava', () => {
  it('bez manage_alerts nema predloga', () => {
    const readOnly: Permission[] = ['view_financial_data', 'view_sales', 'view_inventory']
    expect(actionFor('get_top_debtors', readOnly)).toBeNull()
    expect(actionFor('get_top_debtors', [...readOnly, 'manage_alerts'])).not.toBeNull()
  })

  it('namera bez smislene radnje ne dobija predlog samo da bi ga imala', () => {
    expect(actionFor('get_headcount', ['manage_alerts'])).toBeNull()
    expect(actionFor('get_daily_sales', ['manage_alerts'])).toBeNull()
  })
})
