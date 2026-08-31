import { beforeEach, describe, expect, it } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'x'.repeat(40)

const { checkRateLimit, resetRateLimits } = await import('@/server/http/rate-limit')

describe('ograničavanje broja zahteva', () => {
  beforeEach(() => resetRateLimits())

  it('propušta do granice, pa odbija', () => {
    // Granica za prijavu je 10 pokušaja.
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('auth', 'email:test@primer.rs').allowed, `pokušaj ${i + 1}`).toBe(true)
    }
    expect(checkRateLimit('auth', 'email:test@primer.rs').allowed).toBe(false)
  })

  it('broji odvojeno po identitetu', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('auth', 'email:prvi@primer.rs')
    expect(checkRateLimit('auth', 'email:prvi@primer.rs').allowed).toBe(false)
    expect(checkRateLimit('auth', 'email:drugi@primer.rs').allowed).toBe(true)
  })

  it('broji odvojeno po vrsti operacije', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('auth', 'korisnik-1')
    expect(checkRateLimit('auth', 'korisnik-1').allowed).toBe(false)
    // Prijava je iscrpljena, ali čitanje ne sme da bude blokirano zbog toga.
    expect(checkRateLimit('read', 'korisnik-1').allowed).toBe(true)
  })

  it('AI pozivi imaju strožu granicu od običnog čitanja', () => {
    for (let i = 0; i < 20; i++) checkRateLimit('ai', 'korisnik-2')
    expect(checkRateLimit('ai', 'korisnik-2').allowed).toBe(false)
    expect(checkRateLimit('read', 'korisnik-2').allowed).toBe(true)
  })

  it('prijavljuje koliko je pokušaja ostalo', () => {
    const first = checkRateLimit('connector_test', 'integracija-1')
    expect(first.remaining).toBe(9)
    const second = checkRateLimit('connector_test', 'integracija-1')
    expect(second.remaining).toBe(8)
  })
})
