import type { NextConfig } from 'next'
import { describeEnvNames, parseEnv } from './src/server/env-schema'

/**
 * Okruženje se proverava PRI BUILD-U, ne tek pri prvom zahtevu.
 *
 * Ovo je odgovor na stvarni kvar: `APP_URL` je bio proveravan strogo a nigde
 * korišćen, pa je jedna pogrešno uneta vrednost prolazila build i obarala
 * SVAKI zahtev sa praznom 500 stranicom. Uzrok se video samo kopanjem po
 * runtime logovima — ako uopšte znate da tamo treba da gledate.
 *
 * Sada ista greška obara build, a razlog stoji u build logu, imenom
 * promenljive. Poruka nikad ne sadrži vrednosti, pa sme da stoji u logu.
 */
const environment = parseEnv(process.env)
if (!environment.ok) {
  // Uz razlog ide i spisak naziva koje build stvarno vidi. Bez toga se slučaj
  // „promenljiva stoji u UI-ju ali ne stiže do build-a" ne razlikuje od
  // „pogrešno je otkucana", a to su dve različite popravke.
  throw new Error(`${environment.message}\n\n${describeEnvNames(process.env)}`)
}

/**
 * Bezbednosna zaglavlja se postavljaju ovde i u middleware-u.
 * CSP je namerno strog: bez 'unsafe-inline' za skripte.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    // Sprečava da se serverski moduli slučajno uvuku u klijentski bundle.
    typedEnv: true,
  },
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
}

export default nextConfig
