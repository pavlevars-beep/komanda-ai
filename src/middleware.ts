import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeInternalPath } from '@/core/shared/safe-path'

/**
 * Middleware radi dve stvari:
 *
 *  1. Osvežava Supabase sesiju. Server komponente ne smeju da postavljaju
 *     kolačiće, pa je ovo jedino mesto gde osvežen token može da se upiše.
 *
 *  2. Postavlja Content-Security-Policy sa nonce-om. Zbog toga u aplikaciji
 *     nema nijedne inline skripte bez potpisa, pa ni klase napada koja se na
 *     njih oslanja. Next sam dodaje nonce svojim skriptama kada vidi ovo
 *     zaglavlje.
 */

const PUBLIC_PATHS = ['/login', '/invite', '/reset-password', '/auth/callback']

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * Izvezena zbog testa.
 *
 * CSP se ne vidi ni u jednom pregledu koda i ne obara ni build ni testove —
 * greška u njoj se pojavi tek kao slika koja se ne učita, u pregledaču, kod
 * klijenta. Zato je pravilo koje se lako izgubi zapisano kao tvrdnja.
 */
export function buildCsp(nonce: string, supabaseUrl: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    // 'strict-dynamic' znači da skripte koje učita potpisana skripta nasleđuju
    // poverenje — bez toga bi Next-ov loader morao da se izuzme ručno.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`,
    // Next ubacuje stilove inline; rizik je neuporedivo manji nego kod skripti.
    `style-src 'self' 'unsafe-inline'`,
    /*
     * Supabase domen je OVDE neophodan, ne samo u `connect-src`.
     *
     * Logotip klijenta stoji u Supabase skladištu, na drugom domenu.
     * `connect-src` pokriva pozive iz koda; `<img src>` ide kroz `img-src`, i
     * bez ovoga pregledač odbije sliku bez ijedne poruke na stranici — vidi
     * se samo prazan okvir, što izgleda kao da logotip nije ni otpremljen.
     */
    `img-src 'self' data: blob: ${supabaseUrl}`,
    `font-src 'self'`,
    `connect-src 'self' ${supabaseUrl} ${isDev ? 'ws: wss:' : ''}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ]
    .join('; ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  // Bez Supabase konfiguracije se NE MOŽE utvrditi ko je korisnik.
  //
  // Ranije je ovaj slučaj tiho preskakao ceo blok za autentikaciju: zahtev bi
  // prošao pored provere i stigao do stranice. To je otkazivanje na otvorenu
  // stranu — nedostajuća promenljiva okruženja gasila je zaštitu ruta. Ovde je
  // spasla okolnost što stranica ionako pukne na `env()`, ali oslanjati se na
  // to znači da zaštita zavisi od greške u sloju ispod.
  //
  // Sada se odbija sve. Aplikacija bez konfiguracije ne radi ni na jednoj
  // putanji, pa ni `/login` ne sme da izgleda ispravno — prijava sa te
  // stranice ne bi mogla da uspe.
  if (!supabaseUrl || !anonKey) {
    return new NextResponse('Aplikacija nije konfigurisana.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Naziv promenljive, nikad vrednost — ovo zaglavlje vidi svako.
        'X-Configuration-Error': supabaseUrl
          ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
          : 'NEXT_PUBLIC_SUPABASE_URL',
      },
    })
  }

  {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    })

    // getUser, ne getSession: token se proverava kod auth servera, a ne
    // uzima zdravo za gotovo iz kolačića koji dolazi od klijenta.
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname

    if (!user && !isPublicPath(path)) {
      const redirect = request.nextUrl.clone()
      redirect.pathname = '/login'
      // Pamti se samo putanja unutar aplikacije, da se preusmeravanje ne bi
      // moglo iskoristiti za slanje korisnika na tuđi sajt posle prijave.
      const safe = safeInternalPath(path, '')
      redirect.search = safe ? `?next=${safe}` : ''
      return NextResponse.redirect(redirect)
    }
  }

  response.headers.set('Content-Security-Policy', buildCsp(nonce, supabaseUrl, isDev))
  response.headers.set('x-nonce', nonce)
  return response
}

export const config = {
  matcher: [
    // Sve osim statičkih fajlova i slika.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
