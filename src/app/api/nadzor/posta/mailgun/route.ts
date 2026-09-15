import { NextResponse, type NextRequest } from 'next/server'
import { adminDb } from '@/server/db/admin-client'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { receiveInboundEmail } from '@/core/mail/receive'
import { soleTableCandidate } from '@/core/mail/inbound'
import {
  attachmentFieldNames,
  normalizeMailgun,
  verifyMailgunSignature,
} from '@/core/mail/mailgun'

/**
 * Prijem poruka od Mailgun-a.
 *
 * Mailgun šalje `multipart/form-data`, sa prilozima kao pravim fajlovima i sa
 * sopstvenim potpisom u telu. Sve što je specifično za njega stoji u
 * `core/mail/mailgun.ts`; ovde je samo čitanje obrasca i predaja istom prijemu
 * koji koristi i opšta ruta.
 *
 * Ruta ODGOVARA 200 i na odbijenu poruku. Mailgun ponavlja isporuku na svaki
 * odgovor koji nije uspeh, a ponavljanje ne bi promenilo ishod — poruka od
 * nedozvoljenog pošiljaoca ostaje nedozvoljena i iz petog pokušaja. Razlog stoji
 * u dnevniku, gde ga konsultant i traži.
 */

export const dynamic = 'force-dynamic'

/*
 * Ista granica kao na opštoj ruti, i iz istog razloga: telo zahteva kroz
 * serverless funkciju. Kod Mailgun-a prilog stiže kao binarni deo obrasca, bez
 * base64 uvećanja, pa granica ide na sam prilog.
 */
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

function field(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === 'string' ? value : null
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signingKey = env().MAILGUN_SIGNING_KEY
  // Nepodešen prijem daje 404: postojanje interne rute nije informacija koju
  // delimo sa onim ko nije pozvan da je koristi.
  if (!signingKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 })
  }

  const signature = {
    timestamp: field(form, 'timestamp') ?? '',
    token: field(form, 'token') ?? '',
    signature: field(form, 'signature') ?? '',
  }

  /*
   * Potpis se proverava PRE svega ostalog — pre čitanja adrese, priloga i bilo
   * kakvog upita. Neispravno potpisan zahtev ne sme ni da dodirne bazu, jer bi
   * inače svako ko pogodi rutu mogao da je natera na rad.
   */
  if (!verifyMailgunSignature(signature, signingKey)) {
    logger.warn('posta.mailgun.potpis', { component: 'mail' })
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const normalized = normalizeMailgun({
    recipient: field(form, 'recipient'),
    sender: field(form, 'sender'),
    from: field(form, 'from'),
    subject: field(form, 'subject'),
    messageHeaders: field(form, 'message-headers'),
  })

  if (!normalized) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  // Prilozi se ne čitaju u memoriju ovde: uzimaju se naziv i veličina, a sadržaj
  // tek za onaj koji pravila izaberu.
  const files = new Map<string, File>()
  for (const name of attachmentFieldNames(Number(field(form, 'attachment-count') ?? '0'))) {
    const value = form.get(name)
    if (value instanceof File && value.name !== '') files.set(value.name, value)
  }

  const described = [...files.values()].map((file) => ({
    fileName: file.name,
    sizeBytes: file.size,
  }))

  /*
   * Sadržaj se učitava unapred SAMO za prilog koji pravila mogu da izaberu.
   *
   * `File.arrayBuffer` je asinhron, a pravila prihvatanja su sinhrona, pa se
   * izbor mora znati ranije. Zato isto pravilo — „tačno jedan kandidat" — stoji
   * u jezgru i poziva se odavde, umesto da adapter ima svoj spisak nastavaka.
   */
  const sole = soleTableCandidate(described)
  const chosen = sole && sole.sizeBytes <= MAX_ATTACHMENT_BYTES ? files.get(sole.fileName) : null
  const bytes = chosen ? Buffer.from(await chosen.arrayBuffer()) : null

  const outcome = await receiveInboundEmail(
    adminDb(),
    { ...normalized, attachments: described },
    (fileName) => {
      const file = files.get(fileName)
      if (!file) return null
      if (file.size > MAX_ATTACHMENT_BYTES) return 'too_large'
      return bytes
    },
  )

  logger.info('posta.mailgun', {
    accepted: outcome.accepted,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  })

  return NextResponse.json(
    { accepted: outcome.accepted, ...(outcome.reason ? { reason: outcome.reason } : {}) },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
