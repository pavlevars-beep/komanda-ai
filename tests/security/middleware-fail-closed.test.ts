import { describe, expect, it } from 'vitest'
import { buildCsp, isPublicPath } from '@/middleware'

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

/**
 * Pravila CSP-a koja se lako izgube.
 *
 * Nijedno od njih ne obara build, typecheck ni ostale testove. Greška se
 * pojavljuje tek u pregledaču kod klijenta, i to kao nešto što liči na sasvim
 * drugi kvar — slika koja se ne učita izgleda kao da fajl nije otpremljen.
 */
describe('Content-Security-Policy', () => {
  const SUPABASE = 'https://primer.supabase.co'
  const csp = buildCsp('nonce123', SUPABASE, false)

  const directive = (name: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `))

  it('dozvoljava slike sa Supabase skladišta', () => {
    // Logotip klijenta stoji na drugom domenu. Bez ovoga pregledač ga odbije
    // ćutke — što je i bio stvarni kvar: prazan okvir umesto logotipa.
    expect(directive('img-src')).toContain(SUPABASE)
  })

  it('i dalje ne dozvoljava slike sa bilo kog domena', () => {
    // Poredi se po TOKENIMA, ne po podnizu: prva verzija ove tvrdnje je
    // padala jer `https://primer.supabase.co` sadrži `https:` kao podniz, pa
    // je test prijavljivao kvar tamo gde ga nema.
    const sources = directive('img-src')!.split(' ').slice(1)
    expect(sources).not.toContain('*')
    expect(sources).not.toContain('https:')
    expect(sources).toEqual(["'self'", 'data:', 'blob:', SUPABASE])
  })

  it('zadržava zaštite koje ne smeju da se olabave usput', () => {
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
    expect(directive('form-action')).toBe("form-action 'self'")
  })

  it('skripte traže nonce i ne dozvoljavaju unsafe-inline', () => {
    expect(directive('script-src')).toContain("'nonce-nonce123'")
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    // `unsafe-eval` postoji samo u razvoju.
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
    expect(buildCsp('n', SUPABASE, true)).toContain("'unsafe-eval'")
  })
})
