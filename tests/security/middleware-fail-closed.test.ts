import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/middleware'

/**
 * Zaštita ruta ne sme da zavisi od toga da li je okruženje podešeno.
 *
 * Pravi kvar koji je ovo otkrio: sa praznim NEXT_PUBLIC_SUPABASE_URL middleware
 * je preskakao ceo blok za autentikaciju, pa je zahtev za `/console` prolazio
 * pored provere. Stranica je posle pukla na `env()` — ali to je slučajnost, ne
 * zaštita. Nedostajuća promenljiva ne sme da gasi bravu.
 */
describe('javne putanje', () => {
  it('prijava i pozivnica su javne', () => {
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/auth/callback')).toBe(true)
    expect(isPublicPath('/invite/abc123')).toBe(true)
  })

  it('konzola i radni prostor NISU javni', () => {
    expect(isPublicPath('/console')).toBe(false)
    expect(isPublicPath('/console/clients')).toBe(false)
    expect(isPublicPath('/w/demo-distribucija')).toBe(false)
    expect(isPublicPath('/')).toBe(false)
  })

  it('putanja koja samo POČINJE kao javna nije javna', () => {
    // `/loginizvestaj` ne sme da prođe zato što počinje sa `/login`.
    expect(isPublicPath('/loginizvestaj')).toBe(false)
    expect(isPublicPath('/login-admin')).toBe(false)
  })
})
