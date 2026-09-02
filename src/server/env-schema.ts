import { z } from 'zod'

/**
 * Šema okruženja.
 *
 * Namerno stoji odvojeno od `env.ts`, koji nosi `server-only` i zato ne može
 * da se uveze iz `next.config.ts`. Ovako ista šema važi i pri build-u i pri
 * izvršavanju; dve odvojene šeme bi se vremenom razišle, pa bi build prolazio
 * sa konfiguracijom koju aplikacija posle odbija — a to je upravo najgori
 * ishod, jer greška tada stiže kao 500 na svakom zahtevu umesto kao pao build.
 */

/** Promenljive koje smeju da se unesu kao goli domen. */
const BASE_URL_KEYS = ['APP_URL'] as const

/**
 * Goli domen postaje puna adresa.
 *
 * `https://` se dodaje jer je jedina shema pod kojom se ovo ionako servira, a
 * `komanda-ai.vercel.app` je ono što čovek prirodno prekopira iz Vercel-a.
 * Odbiti takav unos znači srušiti aplikaciju zbog dva znaka koja nedostaju.
 */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/**
 * Sređuje sirovo okruženje pre provere.
 *
 * Dve stvari koje su nas već koštale jedne pale isporuke:
 *
 * 1. Polja za unos na Vercel-u i GitHub-u lako povuku razmak ili novi red pri
 *    lepljenju. Nevidljivi su u UI-ju, a obaraju i `.url()` i `.min()`.
 * 2. Prazna vrednost nije isto što i nepostavljena. Ako je promenljiva
 *    napravljena pa ostavljena prazna, `.default()` ne bi odradio svoje i
 *    provera bi pala na nečemu što korisnik vidi kao „postavljeno".
 */
export function resolveEnvSource(
  raw: Readonly<Record<string, string | undefined>>,
): Record<string, unknown> {
  const source: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed !== '') source[key] = trimmed
  }

  // Vercel svoju adresu daje kroz VERCEL_URL, bez sheme.
  const fallback = typeof source['VERCEL_URL'] === 'string' ? source['VERCEL_URL'] : ''

  for (const key of BASE_URL_KEYS) {
    const current = typeof source[key] === 'string' ? source[key] : ''
    const chosen = current !== '' ? current : fallback
    if (chosen === '') delete source[key]
    else source[key] = normalizeBaseUrl(chosen)
  }

  return source
}

const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    /**
     * Zaobilazi RLS. Sme da se koristi isključivo u migracijama, seed-u
     * i pozadinskim poslovima — nikad u kodu koji opslužuje zahtev korisnika.
     */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

    // AI provajder
    AI_PROVIDER: z.enum(['openai', 'azure-openai', 'none']).default('none'),
    OPENAI_API_KEY: z.string().min(20).optional(),
    OPENAI_MODEL: z.string().default('gpt-4o'),

    // Aplikacija
    APP_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    /** Maksimalno trajanje sesije pristupa Delta Pro osoblja, u minutima. */
    IMPERSONATION_MAX_MINUTES: z.coerce.number().int().min(5).max(480).default(60),
  })
  .superRefine((env, ctx) => {
    // Provera preko više polja stoji u šemi, ne posle nje, da bi je uhvatila i
    // provera pri build-u — a ne tek prvi zahtev u produkciji.
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'obavezan kada je AI_PROVIDER=openai',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverSchema>

export type ParsedEnv =
  | { readonly ok: true; readonly env: ServerEnv }
  | { readonly ok: false; readonly keys: readonly string[]; readonly message: string }

/**
 * Proverava okruženje i vraća ishod umesto da baca.
 *
 * Poruka sadrži ISKLJUČIVO nazive promenljivih i razlog — nikad vrednosti.
 * Zbog toga sme da se ispiše u build log Vercel-a i da se prekopira u poruku,
 * a da pritom ne procuri nijedan ključ.
 */
/** Prefiksi promenljivih koje su za nas relevantne — za dijagnostiku u logu. */
const RELEVANT = /^(NEXT_PUBLIC_|SUPABASE|APP_URL|LOG_LEVEL|AI_PROVIDER|OPENAI_|NODE_ENV|IMPERSONATION_|VERCEL_ENV$|VERCEL_URL$)/

/**
 * Spisak NAZIVA promenljivih koje okruženje stvarno nudi.
 *
 * Postoji zbog kvara koji se drugačije ne vidi: promenljiva stoji u Vercel
 * listi, a do build-a ne stiže. Uzrok je obično greška u nazivu ili pogrešno
 * izabrano okruženje — a oboje se prepozna na prvi pogled čim se vidi šta
 * build STVARNO ima.
 *
 * Vraća isključivo nazive. Nijedna vrednost ne izlazi odavde, pa ovo sme da
 * stoji u build logu, koji nije tajna.
 */
export function describeEnvNames(raw: Readonly<Record<string, string | undefined>>): string {
  const names = Object.keys(raw).filter((k) => RELEVANT.test(k)).sort()

  if (names.length === 0) {
    return 'Okruženje ne sadrži nijednu očekivanu promenljivu.'
  }

  return [
    'Promenljive koje build vidi (samo nazivi, bez vrednosti):',
    ...names.map((n) => {
      const value = raw[n]
      // Prazna vrednost je čest uzrok, a u UI-ju izgleda isto kao popunjena.
      const state = value === undefined ? 'nije postavljena' : value.trim() === '' ? 'PRAZNA' : 'postavljena'
      return `  · ${n} — ${state}`
    }),
  ].join('\n')
}

export function parseEnv(raw: Readonly<Record<string, string | undefined>>): ParsedEnv {
  const parsed = serverSchema.safeParse(resolveEnvSource(raw))
  if (parsed.success) return { ok: true, env: parsed.data }

  const keys = parsed.error.issues.map((i) => i.path.join('.') || '(root)')
  const problems = parsed.error.issues
    .map((i, n) => `  - ${keys[n]}: ${i.message}`)
    .join('\n')

  return {
    ok: false,
    keys,
    message: `Konfiguracija okruženja nije ispravna:\n${problems}\n\nUporedi sa .env.example`,
  }
}
