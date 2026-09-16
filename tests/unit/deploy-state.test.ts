import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Prikaz stanja deploy-a NE SME da oda tajnu.
 *
 * Prikaz koji bi odao ključ bio bi gori od nepostojanja prikaza — zato ova
 * provera stoji uz samu funkciju, a ne uz ekran koji je koristi. Ekrana može
 * biti više; funkcija je jedna.
 */

const BASE = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '0'.repeat(40),
}

async function load(extra: Record<string, string>) {
  vi.resetModules()
  vi.stubGlobal('process', { ...process, env: { ...BASE, ...extra } })
  const { deployFeatures } = await import('@/server/deploy-state')
  return deployFeatures()
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('stanje deploy-a', () => {
  const KLJUC = 'sk-test-0123456789abcdefghijklmnopqrstuvwxyz'

  it('sagovornik je uključen kada su obe promenljive tu', async () => {
    const ai = (await load({ AI_PROVIDER: 'openai', OPENAI_API_KEY: KLJUC })).find(
      (c) => c.key === 'ai',
    )
    expect(ai?.on).toBe(true)
    expect(ai?.missing).toEqual([])
  })

  it('bez AI_PROVIDER sagovornik je isključen i kaže šta nedostaje', async () => {
    const ai = (await load({})).find((c) => c.key === 'ai')
    expect(ai?.on).toBe(false)
    expect(ai?.missing).toEqual(['AI_PROVIDER'])
  })

  it('ključ se NIKAD ne nalazi u odgovoru', async () => {
    const state = await load({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: KLJUC,
      // Shema traži servisni ključ uz zakazane poslove i poštu: oni rade bez
      // korisnika, pa im treba pristup koji zaobilazi RLS.
      SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
      CRON_SECRET: 'c'.repeat(32),
      MAIL_DOMAIN: 'posta.komanda.rs',
      MAIL_WEBHOOK_SECRET: 'w'.repeat(32),
      MAILGUN_SIGNING_KEY: 'm'.repeat(20),
    })

    const ceo = JSON.stringify(state)
    expect(ceo).not.toContain(KLJUC)
    expect(ceo).not.toContain('c'.repeat(32))
    expect(ceo).not.toContain('w'.repeat(32))
    expect(ceo).not.toContain('m'.repeat(20))
    expect(ceo).not.toContain('s'.repeat(40))
    // Naziv modela i domen pošte tajne nisu — i korisni su pri proveri.
    expect(ceo).toContain('posta.komanda.rs')
  })

  /*
   * Pola podešeno je stanje koje najviše zbunjuje: uneta je jedna promenljiva,
   * ništa ne radi, a greška se traži u kodu.
   */
  it('pola podešena pošta se prijavljuje kao nepotpuna', async () => {
    const mail = (await load({ MAIL_DOMAIN: 'posta.komanda.rs' })).find((c) => c.key === 'mail')
    expect(mail?.on).toBe(false)
    expect(mail?.partial).toBe(true)
    expect(mail?.missing).toEqual(['MAIL_WEBHOOK_SECRET'])
  })
})
