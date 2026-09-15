import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { judgeInboundEmail, type InboundEmail, type RejectionReason } from './inbound'
import { tokenFromAddress } from './address'
import { readTable, ImportError } from '../import/table'
import { applyRememberedMapping, validateMapping } from '../import/mapping'
import { normalizeRows } from '../import/normalize'
import {
  contentHash,
  findActiveByHash,
  getStoredMapping,
  recordResubmission,
  saveDataset,
} from '../import/repository'

/**
 * Prijem tabele iz poruke e-pošte.
 *
 * Pokreće se bez korisnika u kontekstu, pa dobija klijent koji zaobilazi RLS.
 * Svaki upit zato nosi `organization_id` pročitan IZ SANDUČETA, nikad iz
 * poruke — pošiljalac ne sme da bira u čiju organizaciju upisuje.
 *
 * Ceo tok posle prihvatanja je ISTI kao ručni uvoz: isti čitač tabele, isto
 * mapiranje, isti otisak sadržaja, isti upis. Drugi put do istog cilja značio
 * bi drugi skup pravila, i jedno od ta dva bi vremenom zaostalo.
 */

/** Razlozi koji se vide tek posle čitanja baze i same tabele. */
export type PipelineReason =
  | 'unknown_address'
  | 'no_mapping'
  | 'header_changed'
  | 'unreadable'
  | 'duplicate'
  | 'no_rows'
  | 'save_failed'

export type DeliveryReason = RejectionReason | PipelineReason

export interface ReceiveOutcome {
  readonly accepted: boolean
  readonly reason?: DeliveryReason
  readonly detail?: string
  readonly datasetId?: string
  readonly rows?: number
}

const inboxRow = z.object({
  id: uuid(),
  organization_id: uuid(),
  integration_id: uuid(),
  kind: z.enum(['sales', 'receivables', 'payables', 'stock']),
  allowed_senders: z.array(z.string()),
  enabled: z.boolean(),
  max_bytes: z.number().int(),
})

/**
 * Dobavljanje bajtova priloga, tek kada se zna KOJI prilog treba.
 *
 * Prosleđuje se kao funkcija, a ne kao gotov bajt-niz: izbor priloga radi čisto
 * pravilo nad nazivima i veličinama, pa nema razloga da potpis i logotip iz
 * svake poruke prođu kroz memoriju. Vraća `'too_large'` kada prilog premašuje
 * granicu prenosa, i `null` kada ga uopšte nema.
 */
export type AttachmentReader = (fileName: string) => Buffer | 'too_large' | null

export async function receiveInboundEmail(
  db: Db,
  email: InboundEmail,
  readAttachment: AttachmentReader,
): Promise<ReceiveOutcome> {
  const token = tokenFromAddress(email.to)
  if (!token) return { accepted: false, reason: 'unknown_address', detail: email.to }

  const { data } = await db
    .from('mail_inboxes')
    .select('id, organization_id, integration_id, kind, allowed_senders, enabled, max_bytes')
    .eq('token', token)
    .maybeSingle()

  const parsed = inboxRow.safeParse(data)
  /*
   * Nepoznat token se ne razlikuje od poznatog koji ništa ne prima: oba daju
   * isti odgovor i ništa se ne zapisuje. Zapis po nepoznatom tokenu bi značio
   * da svako ko šalje na nasumične adrese puni našu bazu.
   */
  if (!parsed.success) return { accepted: false, reason: 'unknown_address' }

  const inbox = parsed.data
  const verdict = judgeInboundEmail(email, {
    allowedSenders: inbox.allowed_senders,
    maxBytes: inbox.max_bytes,
    enabled: inbox.enabled,
  })

  if (!verdict.accepted) {
    await logDelivery(db, inbox, email, {
      accepted: false,
      reason: verdict.reason,
      ...(verdict.detail ? { detail: verdict.detail } : {}),
    })
    return { accepted: false, reason: verdict.reason, ...(verdict.detail ? { detail: verdict.detail } : {}) }
  }

  const bytes = readAttachment(verdict.attachment.fileName)
  if (bytes === 'too_large' || bytes === null) {
    const failed: ReceiveOutcome =
      bytes === 'too_large'
        ? { accepted: false, reason: 'too_large', detail: verdict.attachment.fileName }
        : { accepted: false, reason: 'unreadable', detail: verdict.attachment.fileName }
    await logDelivery(db, inbox, email, failed)
    return failed
  }

  const outcome = await importAttachment(db, inbox, bytes)
  await logDelivery(db, inbox, email, outcome)
  return outcome
}

type Inbox = z.infer<typeof inboxRow>

async function importAttachment(
  db: Db,
  inbox: Inbox,
  bytes: Buffer,
): Promise<ReceiveOutcome> {
  /*
   * ISTI FAJL NIJE NOV PODATAK — provera stoji pre svega ostalog, kao i kod
   * ručnog uvoza. ERP koji dvaput pošalje isti izveštaj ne sme da pomeri vreme
   * podatka, jer bi tada tabla izgledala sveže a alarm na tišinu bi ćutao.
   */
  const hash = contentHash(bytes)
  const active = await findActiveByHash(
    db,
    inbox.organization_id,
    inbox.integration_id,
    inbox.kind,
    hash,
  )
  if (active) {
    await recordResubmission(db, inbox.organization_id, active.id, active.seenCount)
    return { accepted: false, reason: 'duplicate', detail: active.fileName }
  }

  /*
   * BEZ ČOVEKA NEMA POGAĐANJA KOLONA.
   *
   * Pri ručnom uvozu konsultant vidi predlog i potvrdi ga. Ovde nema nikoga, pa
   * pogođeno mapiranje niko ne bi proverio — a pogrešno pogođena kolona se ne
   * vidi kao greška nego kao pogrešan broj, mesecima.
   *
   * Zato pošta puni tek pošto je jedan uvoz urađen ručno. Prvi put odlučuje
   * čovek; posle toga se ta odluka ponavlja.
   */
  const stored = await getStoredMapping(
    db,
    inbox.organization_id,
    inbox.integration_id,
    inbox.kind,
  )
  if (!stored) return { accepted: false, reason: 'no_mapping' }

  let table
  try {
    table = readTable(bytes)
  } catch (cause) {
    return {
      accepted: false,
      reason: 'unreadable',
      detail: cause instanceof ImportError ? cause.key : 'unknown',
    }
  }

  const remembered = applyRememberedMapping(stored.mapping, stored.headers, table.headers)

  // Nestala kolona traži odluku čoveka. Tiho čitanje bez nje bi upisalo skup
  // kojem nedostaje polje, a niko ne bi saznao da je zaglavlje promenjeno.
  if (remembered.missing.length > 0) {
    return {
      accepted: false,
      reason: 'header_changed',
      detail: remembered.missing.join(', '),
    }
  }

  const problems = validateMapping(remembered.mapping, inbox.kind, table.headers.length)
  if (problems.length > 0) {
    return {
      accepted: false,
      reason: 'header_changed',
      detail: problems.map((p) => p.field).join(', '),
    }
  }

  const normalized = normalizeRows(table.rows, remembered.mapping, inbox.kind)
  if (normalized.rows.length === 0) return { accepted: false, reason: 'no_rows' }

  const currency = await organizationCurrency(db, inbox.organization_id)

  const saved = await saveDataset(db, {
    organizationId: inbox.organization_id,
    integrationId: inbox.integration_id,
    kind: inbox.kind,
    filePath: '',
    fileName: 'e-pošta',
    fileSize: bytes.length,
    mapping: remembered.mapping,
    currency,
    rows: normalized.rows,
    problems: normalized.problems,
    importedBy: null,
    contentHash: hash,
  })

  if (!saved.ok) {
    return { accepted: false, reason: 'save_failed', detail: saved.error.key }
  }

  return { accepted: true, datasetId: saved.value, rows: normalized.rows.length }
}

async function organizationCurrency(db: Db, organizationId: string): Promise<string> {
  const { data } = await db
    .from('organizations')
    .select('default_currency')
    .eq('id', organizationId)
    .maybeSingle()

  const parsed = z.object({ default_currency: z.string().length(3) }).safeParse(data)
  return parsed.success ? parsed.data.default_currency : 'RSD'
}

/**
 * Dnevnik dolazaka.
 *
 * Zapisuje se i primljena i odbijena poruka. Bez toga odbijena poruka nestaje
 * bez traga: klijent tvrdi da je poslao, sistem tvrdi da nije stiglo, i niko ne
 * može da proveri ko je u pravu.
 */
async function logDelivery(
  db: Db,
  inbox: Inbox,
  email: InboundEmail,
  outcome: ReceiveOutcome,
): Promise<void> {
  await db.from('mail_deliveries').insert({
    organization_id: inbox.organization_id,
    integration_id: inbox.integration_id,
    mail_inbox_id: inbox.id,
    kind: inbox.kind,
    sender: email.from.slice(0, 320),
    subject: email.subject.slice(0, 500),
    attachments: email.attachments.map((a) => a.fileName).slice(0, 20),
    accepted: outcome.accepted,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.detail ? { detail: outcome.detail.slice(0, 500) } : {}),
    ...(outcome.datasetId ? { dataset_id: outcome.datasetId } : {}),
  })
}
