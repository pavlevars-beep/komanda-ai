import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AuthResult, InboundAttachment } from './inbound'

/**
 * Adapter za Mailgun.
 *
 * Čist modul: potpis i zaglavlja se proveravaju bez HTTP-a, pa se ponašanje
 * granice kroz koju ulaze tuđi podaci vidi u testu umesto u produkciji.
 *
 * Sve što je specifično za Mailgun stoji OVDE. Ostatak prijema radi nad našim
 * oblikom poruke, pa promena dobavljača menja samo ovaj fajl.
 */

/**
 * Provera potpisa.
 *
 * Mailgun potpisuje spoj `timestamp + token` ključem za webhook. Ovo je PRAVA
 * provera identiteta pošiljaoca zahteva — jača od deljene tajne u zaglavlju,
 * jer se potpis menja sa svakim pozivom.
 */
export function verifyMailgunSignature(
  input: { timestamp: string; token: string; signature: string },
  signingKey: string,
  now = new Date(),
): boolean {
  if (!/^\d{1,12}$/.test(input.timestamp)) return false
  if (!/^[0-9a-f]{20,80}$/i.test(input.token)) return false
  if (!/^[0-9a-f]{64}$/i.test(input.signature)) return false

  /*
   * Starost poziva se ograničava na pet minuta.
   *
   * Bez toga bi jednom uhvaćen potpis važio zauvek: napadač koji ga snimi može
   * da ponovi isti zahtev godinu dana kasnije. Potpis dokazuje KO je poslao, ne
   * i KADA — a bez „kada" ponavljanje je besplatno.
   */
  const sentAt = Number(input.timestamp) * 1000
  const ageMs = Math.abs(now.getTime() - sentAt)
  if (!Number.isFinite(sentAt) || ageMs > 5 * 60_000) return false

  const expected = createHmac('sha256', signingKey)
    .update(input.timestamp + input.token)
    .digest('hex')

  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(input.signature.toLowerCase(), 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** `message-headers` stiže kao JSON niz parova [naziv, vrednost]. */
export function parseMessageHeaders(raw: string | null): Map<string, string> {
  const out = new Map<string, string>()
  if (!raw) return out

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (!Array.isArray(parsed)) return out

  for (const entry of parsed as unknown[]) {
    if (!Array.isArray(entry)) continue
    // Indeksiranje uz izričit `unknown` umesto raspakivanja: `Array.isArray`
    // sužava na `any[]`, pa bi raspakivanje pustilo `any` dalje kroz modul.
    const pair = entry as unknown[]
    const name: unknown = pair[0]
    const value: unknown = pair[1]
    if (typeof name !== 'string' || typeof value !== 'string') continue
    // Prvo pojavljivanje pobeđuje: `Received` i slična zaglavlja se ponavljaju,
    // a za našu upotrebu je merodavno ono koje je dobavljač dodao poslednje —
    // a to je u nizu prvo.
    const key = name.toLowerCase()
    if (!out.has(key)) out.set(key, value)
  }

  return out
}

function normalizeResult(value: string | undefined): AuthResult | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (v.startsWith('pass')) return 'pass'
  if (v.startsWith('fail') || v.startsWith('softfail')) return 'fail'
  if (v.startsWith('none') || v.startsWith('neutral')) return 'none'
  return null
}

/** `spf=pass`, `dkim=fail` … iz standardnog `Authentication-Results`. */
function fromAuthenticationResults(header: string | undefined, method: string): AuthResult | null {
  if (!header) return null
  const match = new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, 'i').exec(header)
  return match ? normalizeResult(match[1]) : null
}

/**
 * Rezultati SPF-a i DKIM-a iz zaglavlja.
 *
 * Traže se DVA izvora: Mailgun-ova sopstvena zaglavlja i standardni
 * `Authentication-Results`. Razlog je pošten — nazivi dobavljačevih zaglavlja se
 * s vremena na vreme menjaju, a nisam u prilici da ih sada proverim na živom
 * nalogu. Čitanje oba izvora znači da promena naziva ne obara prijem.
 *
 * Kada se ne nađe NIJEDAN, vraća se `unknown` — a pravila prihvatanja to
 * računaju kao neuspeh. Fail closed: provera koja propušta kada ne zna nije
 * provera.
 */
export function authResultsFrom(headers: Map<string, string>): {
  spf: AuthResult
  dkim: AuthResult
} {
  const authResults = headers.get('authentication-results')

  const spf =
    normalizeResult(headers.get('x-mailgun-spf')) ??
    fromAuthenticationResults(authResults, 'spf') ??
    'unknown'

  const dkim =
    normalizeResult(headers.get('x-mailgun-dkim-check-result')) ??
    fromAuthenticationResults(authResults, 'dkim') ??
    'unknown'

  return { spf, dkim }
}

export interface MailgunFields {
  readonly recipient: string | null
  readonly sender: string | null
  readonly from: string | null
  readonly subject: string | null
  readonly messageHeaders: string | null
}

export interface NormalizedMailgun {
  readonly to: string
  readonly from: string
  readonly subject: string
  readonly spf: AuthResult
  readonly dkim: AuthResult
}

/**
 * Mailgun-ova polja → naš oblik poruke.
 *
 * `recipient` je adresa na koju je poruka STVARNO isporučena i po njoj se traži
 * sanduče. Zaglavlje `To:` se ne koristi: ono sme da sadrži bilo šta, pa i tuđu
 * adresu, dok `recipient` dolazi iz same isporuke.
 *
 * Za pošiljaoca je obrnuto — uzima se zaglavlje `From:` kada postoji, jer je to
 * ono što čovek vidi i što konsultant upisuje u spisak dozvoljenih. `sender`
 * (koverta) služi kao rezerva.
 */
export function normalizeMailgun(fields: MailgunFields): NormalizedMailgun | null {
  const to = fields.recipient?.trim()
  if (!to) return null

  const from = (fields.from ?? fields.sender ?? '').trim()
  if (from === '') return null

  const headers = parseMessageHeaders(fields.messageHeaders)
  const { spf, dkim } = authResultsFrom(headers)

  return { to, from, subject: (fields.subject ?? '').trim(), spf, dkim }
}

/** Prilozi stižu kao `attachment-1`, `attachment-2`… */
export function attachmentFieldNames(count: number): string[] {
  const safe = Number.isFinite(count) ? Math.max(0, Math.min(20, Math.trunc(count))) : 0
  return Array.from({ length: safe }, (_, i) => `attachment-${i + 1}`)
}

export function describeAttachment(fileName: string, sizeBytes: number): InboundAttachment {
  return { fileName, sizeBytes }
}
