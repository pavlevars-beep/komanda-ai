import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { adminDb } from '@/server/db/admin-client'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { receiveInboundEmail } from '@/core/mail/receive'

/**
 * Prijem podataka poštom.
 *
 * Dobavljač pošte prosleđuje poruku OVDE, u normalizovanom obliku. Oblik je
 * namerno naš, a ne nečiji: svaki dobavljač šalje svoj, a adapter koji ga
 * prevodi je nekoliko redova — dok bi vezivanje celog toka za jedan oblik
 * značilo da se promena dobavljača plaća prepisivanjem prijema.
 *
 * Provera SPF-a i DKIM-a se NE radi ovde nego kod dobavljača, i stiže kao
 * rezultat. Ponavljanje te provere bez pristupa originalnim zaglavljima nije
 * moguće, a pretvaranje da jeste bilo bi gore od oslanjanja na dobavljača.
 */

export const dynamic = 'force-dynamic'

/*
 * Gornja granica priloga.
 *
 * Nije izabrana po tome koliko tabela ume da bude velika nego po tome koliko
 * telo zahteva prolazi kroz platformu: base64 uveća sadržaj za trećinu, a
 * serverless funkcija odbija telo preko ~4,5 MB. Tri megabajta dekodiranog
 * sadržaja staje sa rezervom.
 *
 * `.xlsx` je sažet i praktično uvek staje; veliki `.csv` ne mora. Zato poruka o
 * odbijanju imenuje granicu i predlaže `.xlsx` umesto da kaže „prevelik fajl".
 */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024

const authResult = z.enum(['pass', 'fail', 'none', 'unknown']).catch('unknown')

const payload = z.object({
  to: z.string().min(3).max(320),
  from: z.string().min(3).max(320),
  subject: z.string().max(998).default(''),
  spf: authResult,
  dkim: authResult,
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(260),
        contentBase64: z.string().max(8_000_000),
      }),
    )
    .max(20)
    .default([]),
})

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function authorized(request: NextRequest): boolean {
  const expected = env().MAIL_WEBHOOK_SECRET
  if (!expected) return false

  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  return bearer.length > 0 && secretMatches(bearer, expected)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Nepodešen prijem daje 404: postojanje interne rute nije informacija koju
  // delimo sa onim ko tajnu nije pogodio.
  if (!authorized(request)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = payload.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const email = parsed.data

  /*
   * Bajtovi se dekodiraju TEK za prilog koji je prošao izbor, a izbor radi
   * čista funkcija nad nazivima i veličinama. Dekodiranje svih priloga unapred
   * bi značilo da potpis i logotip iz svake poruke prolaze kroz memoriju bez
   * ijednog razloga.
   */
  const described = email.attachments.map((a) => ({
    fileName: a.fileName,
    // Veličina dekodiranog sadržaja iz dužine base64 zapisa, bez dekodiranja.
    sizeBytes: Math.floor((a.contentBase64.length * 3) / 4),
  }))

  const outcome = await receiveInboundEmail(
    adminDb(),
    {
      to: email.to,
      from: email.from,
      subject: email.subject,
      spf: email.spf,
      dkim: email.dkim,
      attachments: described,
    },
    (fileName) => {
      const found = email.attachments.find((a) => a.fileName === fileName)
      if (!found) return null
      const bytes = Buffer.from(found.contentBase64, 'base64')
      return bytes.length > MAX_ATTACHMENT_BYTES ? 'too_large' : bytes
    },
  )

  logger.info('posta.prijem', {
    accepted: outcome.accepted,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  })

  // Uvek 200: odbijena poruka NIJE greška dobavljača, i ponovno slanje ne bi
  // promenilo ishod. Razlog stoji u dnevniku, gde ga konsultant i traži.
  return NextResponse.json(
    { accepted: outcome.accepted, ...(outcome.reason ? { reason: outcome.reason } : {}) },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
