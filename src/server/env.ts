import 'server-only'
import { parseEnv, type ServerEnv } from './env-schema'

/**
 * Pristup okruženju na serveru.
 *
 * Sama šema živi u `env-schema.ts`, koji NE nosi `server-only` — da bi ista
 * provera mogla da se pokrene i iz `next.config.ts`, pri build-u. Ovaj modul
 * ostaje `server-only`: pokušaj uvoza iz klijentske komponente ruši build,
 * što je i poenta, jer ovde su tajne.
 */

export type { ServerEnv }

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  if (cached) return cached

  const parsed = parseEnv(process.env)
  if (!parsed.ok) {
    // Do ovoga u praksi ne bi trebalo da dođe: ista provera je već oborila
    // build. Ostaje kao poslednja brana za slučaj da se promenljiva izmeni
    // posle build-a, bez novog deploy-a.
    throw new Error(parsed.message)
  }

  cached = parsed.env
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
