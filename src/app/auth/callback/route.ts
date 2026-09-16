import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { safeInternalPath } from '@/core/shared/safe-path'

/**
 * Sletište linkova iz mejla — promena lozinke, poziv, magic link.
 *
 * Ova putanja je odavno stajala u `PUBLIC_PATHS` u middleware-u, a nije
 * postojala. Rezultat: Supabase šalje ispravan link, čovek ga otvori i dobije
 * 404 ili praznu stranicu za prijavu, bez ijedne poruke o tome šta je pošlo
 * naopako.
 *
 * Kod iz linka se ovde menja za sesiju u kolačiću. Tek posle toga korisnik sme
 * da postavi novu lozinku — bez sesije bi ta radnja bila način da bilo ko
 * promeni lozinku bilo kome.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code')

  // Stariji oblik linka nosi token u FRAGMENTU (#access_token=...), koji se do
  // servera nikad ne šalje. Tu se ne može uraditi ništa osim reći čoveku šta
  // se desilo, umesto da gleda praznu stranicu.
  if (!code) {
    const error = request.nextUrl.searchParams.get('error_description')
    logger.info('Povratni link bez koda', { reason: error ?? 'nedostaje code' })

    const back = request.nextUrl.clone()
    back.pathname = '/login'
    back.search = '?veza=istekla'
    return NextResponse.redirect(back)
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Link je jednokratan i ističe. Istrošen link je NAJČEŠĆI ishod ovde —
    // dovoljno je da ga pregledač otvori unapred radi pregleda.
    logger.info('Razmena koda nije uspela', { reason: error.name })

    const back = request.nextUrl.clone()
    back.pathname = '/login'
    back.search = '?veza=istekla'
    return NextResponse.redirect(back)
  }

  const next = request.nextUrl.clone()
  // Odredište se propušta kroz istu proveru kao posle prijave: bez nje bi
  // `?next=` u linku iz mejla vodio korisnika sa sesijom na tuđi sajt.
  next.pathname = safeInternalPath(request.nextUrl.searchParams.get('next'))
  next.search = ''
  return NextResponse.redirect(next)
}
