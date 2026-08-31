import 'server-only'
import { z } from 'zod'

/**
 * Validacija okruženja. Aplikacija namerno ne startuje ako nešto nedostaje —
 * bolje da padne pri podizanju nego da tiho radi sa pogrešnom konfiguracijom.
 *
 * Ovaj modul je `server-only`. Pokušaj uvoza iz klijentske komponente
 * ruši build, što je i poenta: ovde su tajne.
 */

const serverSchema = z.object({
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

export type ServerEnv = z.infer<typeof serverSchema>

function load(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env)

  if (!parsed.success) {
    // Ispisuju se samo NAZIVI varijabli i razlog — nikad vrednosti.
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Konfiguracija okruženja nije ispravna:\n${problems}\n\nUporedi sa .env.example`,
    )
  }

  const env = parsed.data

  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error('AI_PROVIDER=openai zahteva OPENAI_API_KEY.')
  }

  return env
}

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  cached ??= load()
  return cached
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production'
}

/**
 * Demo podaci smeju da postoje samo van produkcije, i uvek su vidljivo označeni.
 */
export function demoDataAllowed(): boolean {
  return !isProduction()
}
