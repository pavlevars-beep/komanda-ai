import { describe, expect, it } from 'vitest'
import {
  describeEnvNames,
  normalizeBaseUrl,
  parseEnv,
  resolveEnvSource,
} from '@/server/env-schema'

/** Minimum bez kojeg šema ne prolazi — da svaki test menja samo ono što ispituje. */
const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
}

describe('normalizacija adrese', () => {
  it('goli domen dobija shemu', () => {
    // Ovo je vrednost koju čovek prirodno prekopira iz Vercel-a. Odbiti je
    // znači srušiti aplikaciju zbog dva znaka koja nedostaju.
    expect(normalizeBaseUrl('komanda-ai.vercel.app')).toBe('https://komanda-ai.vercel.app')
  })

  it('postojeća shema se ne dira', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeBaseUrl('https://komanda.rs')).toBe('https://komanda.rs')
  })

  it('kosa crta na kraju se uklanja', () => {
    expect(normalizeBaseUrl('https://komanda.rs/')).toBe('https://komanda.rs')
  })
})

describe('sređivanje okruženja', () => {
  it('uklanja nevidljivi novi red iz zalepljene vrednosti', () => {
    // Tačno ovo je oborilo isporuku migracija: novi red na kraju vrednosti,
    // nevidljiv u UI-ju i maskiran u logu.
    const source = resolveEnvSource({ NEXT_PUBLIC_SUPABASE_ANON_KEY: `${'a'.repeat(40)}\n` })
    expect(source['NEXT_PUBLIC_SUPABASE_ANON_KEY']).toBe('a'.repeat(40))
  })

  it('prazna vrednost se tretira kao nepostavljena', () => {
    // Promenljiva napravljena pa ostavljena prazna izgleda „postavljeno",
    // a bez ovoga bi oborila podrazumevanu vrednost iz šeme.
    const parsed = parseEnv({ ...BASE, LOG_LEVEL: '   ' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.env.LOG_LEVEL).toBe('info')
  })
})

describe('APP_URL', () => {
  it('prihvata goli domen umesto da obori aplikaciju', () => {
    const parsed = parseEnv({ ...BASE, APP_URL: 'komanda-ai.vercel.app' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.env.APP_URL).toBe('https://komanda-ai.vercel.app')
  })

  it('kada nije postavljen, izvodi se iz VERCEL_URL', () => {
    const parsed = parseEnv({ ...BASE, VERCEL_URL: 'komanda-ai-xyz.vercel.app' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.env.APP_URL).toBe('https://komanda-ai-xyz.vercel.app')
  })

  it('eksplicitna vrednost ima prednost nad VERCEL_URL', () => {
    const parsed = parseEnv({ ...BASE, APP_URL: 'https://komanda.rs', VERCEL_URL: 'x.vercel.app' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.env.APP_URL).toBe('https://komanda.rs')
  })
})

describe('poruka o grešci', () => {
  it('imenuje promenljivu koja nedostaje', () => {
    const parsed = parseEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40) })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.keys).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('NIKAD ne ispisuje vrednost — poruka sme u build log', () => {
    // Ovo je uslov pod kojim smemo da ispišemo grešku u build log i da je
    // korisnik prekopira u poruku. Da poruka nosi vrednost, procurio bi ključ.
    const tajna = 'sbp_ovo_je_tajna_vrednost_koja_ne_sme_da_procuri'
    const parsed = parseEnv({
      ...BASE,
      NEXT_PUBLIC_SUPABASE_URL: tajna,
      SUPABASE_SERVICE_ROLE_KEY: 'kratko',
      OPENAI_API_KEY: tajna,
      AI_PROVIDER: 'openai',
    })

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).not.toContain(tajna)
    expect(parsed.message).not.toContain('kratko')
    expect(parsed.message).toContain('NEXT_PUBLIC_SUPABASE_URL')
  })

  it('AI_PROVIDER=openai bez ključa pada u istoj proveri', () => {
    // Ranije je ova provera stajala POSLE šeme, pa je build nije mogao videti.
    const parsed = parseEnv({ ...BASE, AI_PROVIDER: 'openai' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.keys).toContain('OPENAI_API_KEY')
  })
})

describe('dijagnostika naziva u build logu', () => {
  it('razlikuje nepostavljenu, praznu i postavljenu promenljivu', () => {
    const opis = describeEnvNames({
      NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ',
      LOG_LEVEL: undefined,
    })

    expect(opis).toContain('NEXT_PUBLIC_SUPABASE_URL — postavljena')
    // Prazna vrednost u Vercel UI-ju izgleda isto kao popunjena; ovde ne.
    expect(opis).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY — PRAZNA')
  })

  it('pogrešno otkucan naziv se vidi na prvi pogled', () => {
    // Ovo je slučaj zbog kojeg dijagnostika postoji: u listi stoji nešto što
    // liči na traženu promenljivu, ali build je ne dobija pod tim imenom.
    const opis = describeEnvNames({ NEXT_PUBLIC_SUPBASE_URL: 'https://x.supabase.co' })
    expect(opis).toContain('NEXT_PUBLIC_SUPBASE_URL')
    expect(opis).not.toContain('NEXT_PUBLIC_SUPABASE_URL —')
  })

  it('NIKAD ne ispisuje vrednost — ide u build log', () => {
    const tajna = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tajna'
    expect(describeEnvNames({ NEXT_PUBLIC_SUPABASE_ANON_KEY: tajna })).not.toContain(tajna)
  })
})
