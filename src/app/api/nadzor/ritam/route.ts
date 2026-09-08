import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { adminDb } from '@/server/db/admin-client'
import { env } from '@/server/env'
import { sweepSilence } from '@/core/import/silence'
import { logger } from '@/server/logger'

/**
 * Zakazana provera ritma uvoza.
 *
 * Poziva se spolja, po rasporedu, bez korisnika u kontekstu. Postoji zato što
 * tišina mora da bude primećena i kada niko ne gleda: da se izostanak računao
 * tek pri otvaranju table, konsultant bi za prekid saznao od klijenta.
 *
 * Ovo je JEDINO mesto u `src/app/**` kojem je dozvoljen admin klijent, i ne radi
 * ništa osim prolaza — bez parametara iz zahteva nema šta da se zloupotrebi ni
 * kada bi tajna procurela.
 */

export const dynamic = 'force-dynamic'

/**
 * Poređenje otporno na merenje vremena.
 *
 * Obično `===` prekida na prvom različitom bajtu, pa se tajna može pogađati
 * znak po znak merenjem trajanja odgovora. Dužina se poredi zasebno jer
 * `timingSafeEqual` baca na različitim dužinama.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function authorized(request: NextRequest): boolean {
  const expected = env().CRON_SECRET
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  return bearer.length > 0 && secretMatches(bearer, expected)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Nepodešena tajna daje 404, ne 401: postojanje interne rute nije informacija
  // koju delimo sa onim ko je nije pogodio.
  if (!authorized(request)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const startedAt = Date.now()

  try {
    const outcome = await sweepSilence(adminDb())

    logger.info('nadzor.ritam', {
      ...outcome,
      duration_ms: Date.now() - startedAt,
    })

    return NextResponse.json(
      { ...outcome, trajanje_ms: Date.now() - startedAt },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (cause) {
    logger.error('nadzor.ritam.pao', { cause })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
