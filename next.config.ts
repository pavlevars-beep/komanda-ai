import type { NextConfig } from 'next'
import { describeEnvNames, parseEnv } from './src/server/env-schema'

/**
 * Okruženje se proverava PRI BUILD-U, ali se build zbog toga NE obara.
 *
 * Prva verzija je obarala build. Zvučalo je ispravno — bolje pasti rano nego
 * tiho raditi pogrešno — ali u praksi je ispalo lošije: pao build ne daje
 * nikakav trag onome ko gleda sajt, a poruka ostaje zakopana u build logu,
 * koji ne vidi svako i ne vidi se uvek ceo. Provera je tako blokirala i sam
 * deploy i odgovor na pitanje zašto.
 *
 * Zaštita zato stoji tamo gde je vidljiva: middleware odbija SVAKI zahtev bez
 * konfiguracije, sa 503 i nazivom promenljive u zaglavlju. To ne može da se
 * previdi — sajt ne radi — i može se pročitati spolja, bez pristupa logovima.
 * Aplikacija tako sama kaže šta joj fali.
 *
 * Ovde ostaje glasno upozorenje. `console.error` a ne `throw`: ispisuje se kao
 * običan red u logu i ne gubi se u stack trace-u.
 */
const environment = parseEnv(process.env)
if (!environment.ok) {
  // Uz razlog ide i spisak naziva koje build stvarno vidi. Bez toga se slučaj
  // „promenljiva stoji u UI-ju ali ne stiže do build-a" ne razlikuje od
  // „pogrešno je otkucana", a to su dve različite popravke.
  console.error(
    [
      '',
      '='.repeat(72),
      'UPOZORENJE: build se pravi sa nepotpunom konfiguracijom.',
      '='.repeat(72),
      environment.message,
      '',
      describeEnvNames(process.env),
      '',
      'Aplikacija će odgovarati sa 503 na svakoj putanji dok se ovo ne ispravi.',
      '='.repeat(72),
      '',
    ].join('\n'),
  )
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
