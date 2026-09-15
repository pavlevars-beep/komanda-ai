import { extractAddress, domainOf } from './address'

/**
 * Pravila prihvatanja dolazne pošte.
 *
 * Čista funkcija: bez baze, bez mreže, bez sistemskog sata. Ovo je granica
 * kroz koju tuđi podaci ulaze u klijentovu tablu, pa se ponašanje proverava
 * testom, a ne posmatranjem u produkciji.
 *
 * FAIL CLOSED. Svaki nedostatak podatka vodi u odbijanje: nepoznata adresa,
 * nepoznat pošiljalac, neproverena autentičnost. Poruka koja ne zadovolji
 * nijedno pravilo ne ulazi, i razlog se zapisuje.
 */

export interface InboundAttachment {
  readonly fileName: string
  readonly sizeBytes: number
}

/**
 * Rezultati provere autentičnosti, onako kako ih prijavljuje dobavljač pošte.
 *
 * Adresa pošiljaoca se trivijalno lažira. Spisak dozvoljenih pošiljalaca bez
 * ove provere je zaključana brava na otvorenim vratima — zato SPF ili DKIM mora
 * da prođe, a `unknown` se broji kao neuspeh.
 */
export type AuthResult = 'pass' | 'fail' | 'none' | 'unknown'

export interface InboundEmail {
  readonly to: string
  readonly from: string
  readonly subject: string
  readonly spf: AuthResult
  readonly dkim: AuthResult
  readonly attachments: readonly InboundAttachment[]
}

export interface MailboxRule {
  /** Adrese (`erp@firma.rs`) ili domeni (`@firma.rs`). Prazno = ništa ne prolazi. */
  readonly allowedSenders: readonly string[]
  readonly maxBytes: number
  readonly enabled: boolean
}

export type RejectionReason =
  | 'disabled'
  | 'sender_not_allowed'
  | 'not_authenticated'
  | 'no_table'
  | 'many_tables'
  | 'legacy_xls'
  | 'too_large'

export type MailVerdict =
  | { readonly accepted: true; readonly attachment: InboundAttachment }
  | { readonly accepted: false; readonly reason: RejectionReason; readonly detail?: string }

/** Nastavci koji mogu da budu tabela. Sadržaj se ionako prepoznaje po potpisu. */
const TABLE_EXTENSIONS = ['.xlsx', '.csv', '.txt', '.tsv']

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * Prilozi koji mogu biti tabela.
 *
 * Izvučeno da bi postojalo JEDNO mesto koje odlučuje šta je kandidat. Adapter
 * mora da zna koji prilog da učita pre nego što pozove pravila (čitanje sadržaja
 * je asinhrono, pravila nisu), pa bi bez ovoga imao sopstveni spisak nastavaka —
 * i ta dva spiska bi se jednog dana razišla.
 */
export function tableCandidates(
  attachments: readonly InboundAttachment[],
): readonly InboundAttachment[] {
  return attachments.filter((a) => TABLE_EXTENSIONS.includes(extensionOf(a.fileName)))
}

/**
 * Prilog koji će pravila izabrati, ako ga ima tačno jedan.
 *
 * Ne donosi odluku o prihvatanju — samo kaže čiji sadržaj vredi pripremiti.
 */
export function soleTableCandidate(
  attachments: readonly InboundAttachment[],
): InboundAttachment | null {
  const candidates = tableCandidates(attachments)
  return candidates.length === 1 ? candidates[0]! : null
}

/**
 * Da li je pošiljalac na spisku.
 *
 * Domen se poredi CELO, ne kao završetak: `@firma.rs` ne sme da propusti
 * `nekoga@zla-firma.rs` ni `nekoga@poddomen.firma.rs`. Poddomen koji stvarno
 * treba da šalje upisuje se posebno — širina se traži, ne pretpostavlja.
 */
export function senderAllowed(from: string, allowed: readonly string[]): boolean {
  const address = extractAddress(from)
  if (!address) return false

  const domain = domainOf(address)

  for (const entry of allowed) {
    const rule = entry.trim().toLowerCase()
    if (rule === '') continue

    if (rule.startsWith('@')) {
      if (domain !== null && domain === rule.slice(1)) return true
      continue
    }

    if (rule === address) return true
  }

  return false
}

/** SPF ili DKIM mora da prođe; nepoznato se broji kao neuspeh. */
export function authenticated(email: InboundEmail): boolean {
  return email.spf === 'pass' || email.dkim === 'pass'
}

export function judgeInboundEmail(email: InboundEmail, rule: MailboxRule): MailVerdict {
  if (!rule.enabled) return { accepted: false, reason: 'disabled' }

  if (!authenticated(email)) {
    return {
      accepted: false,
      reason: 'not_authenticated',
      detail: `spf=${email.spf} dkim=${email.dkim}`,
    }
  }

  if (!senderAllowed(email.from, rule.allowedSenders)) {
    return {
      accepted: false,
      reason: 'sender_not_allowed',
      detail: extractAddress(email.from) ?? email.from,
    }
  }

  // Stari binarni `.xls` se ne čita, ali se prepoznaje — poruka „sačuvajte kao
  // .xlsx" je rešiva, „fajl se ne može pročitati" nije.
  const legacy = email.attachments.filter((a) => extensionOf(a.fileName) === '.xls')
  const candidates = tableCandidates(email.attachments)

  if (candidates.length === 0) {
    if (legacy.length > 0) {
      return { accepted: false, reason: 'legacy_xls', detail: legacy[0]!.fileName }
    }
    return { accepted: false, reason: 'no_table' }
  }

  /*
   * Više tabela u jednoj poruci se ODBIJA, ne pogađa.
   *
   * Jedna adresa puni jednu vrstu podatka. Kada stignu dve tabele, izbor „ona
   * veća" ili „ona prva" bio bi tiho pogađanje koje jednog dana promaši — i
   * tada bi prodaja bila upisana kao zalihe, bez ijedne poruke o grešci.
   */
  if (candidates.length > 1) {
    return {
      accepted: false,
      reason: 'many_tables',
      detail: candidates.map((a) => a.fileName).join(', '),
    }
  }

  const attachment = candidates[0]!
  if (attachment.sizeBytes > rule.maxBytes) {
    return { accepted: false, reason: 'too_large', detail: String(attachment.sizeBytes) }
  }

  return { accepted: true, attachment }
}
