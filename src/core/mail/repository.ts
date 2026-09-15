import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { DatasetKind } from '../import/mapping'
import { extractAddress, newMailToken } from './address'

/** Namenska sandučad i dnevnik dolazaka. */

const inboxRow = z.object({
  id: uuid(),
  kind: z.enum(['sales', 'receivables', 'payables', 'stock']),
  token: z.string(),
  allowed_senders: z.array(z.string()),
  enabled: z.boolean(),
})

export type StoredInbox = z.infer<typeof inboxRow>

export async function listInboxes(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Result<StoredInbox[]>> {
  const { data, error } = await db
    .from('mail_inboxes')
    .select('id, kind, token, allowed_senders, enabled')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(inboxRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export interface SaveInboxInput {
  readonly organizationId: string
  readonly integrationId: string
  readonly kind: DatasetKind
  /** Jedna adresa ili domen po redu; prazni redovi se preskaču. */
  readonly senders: readonly string[]
  readonly enabled: boolean
  readonly userId: string
}

/**
 * Upis sandučeta.
 *
 * Token se pravi SAMO pri prvom upisu i posle se ne menja. Nov token pri svakoj
 * izmeni značio bi da se adresa u klijentovom ERP-u tiho pokvari čim konsultant
 * doda još jednog pošiljaoca.
 */
export async function saveInbox(db: Db, input: SaveInboxInput): Promise<Result<void>> {
  const senders = normalizeSenders(input.senders)
  if (senders.invalid.length > 0) {
    return err(
      domainError('invalid_input', 'mail.error.badSender', {
        detail: senders.invalid.join(', '),
      }),
    )
  }

  /*
   * Uključen prijem BEZ ijednog dozvoljenog pošiljaoca se odbija.
   *
   * Takvo sanduče ne bi primilo ništa, ali bi u konzoli stajalo kao uključeno —
   * pa bi konsultant čekao podatke koji ne mogu da stignu, i tražio kvar u ERP-u
   * klijenta umesto ovde.
   */
  if (input.enabled && senders.valid.length === 0) {
    return err(domainError('invalid_input', 'mail.error.noSenders'))
  }

  const existing = await db
    .from('mail_inboxes')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('integration_id', input.integrationId)
    .eq('kind', input.kind)
    .maybeSingle()

  const found = z.object({ id: uuid() }).safeParse(existing.data)

  if (found.success) {
    const { error } = await db
      .from('mail_inboxes')
      .update({ allowed_senders: senders.valid, enabled: input.enabled })
      .eq('organization_id', input.organizationId)
      .eq('id', found.data.id)

    return error
      ? err(domainError('forbidden', 'mail.error.saveFailed', { detail: error.message }))
      : ok(undefined)
  }

  const { error } = await db.from('mail_inboxes').insert({
    organization_id: input.organizationId,
    integration_id: input.integrationId,
    kind: input.kind,
    token: newMailToken(),
    allowed_senders: senders.valid,
    enabled: input.enabled,
    created_by: input.userId,
  })

  return error
    ? err(domainError('forbidden', 'mail.error.saveFailed', { detail: error.message }))
    : ok(undefined)
}

export async function deleteInbox(
  db: Db,
  organizationId: string,
  integrationId: string,
  kind: DatasetKind,
): Promise<Result<void>> {
  const { error } = await db
    .from('mail_inboxes')
    .delete()
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('kind', kind)

  return error
    ? err(domainError('forbidden', 'mail.error.saveFailed', { detail: error.message }))
    : ok(undefined)
}

/**
 * Provera unetih pošiljalaca.
 *
 * Neispravan unos se PRIJAVLJUJE, ne izbacuje ćutke. Tiho izbacivanje bi
 * značilo da konsultant unese `erp@firma` bez domena, vidi da je sačuvano, i
 * mesec dana čeka poruke koje pravilo nikad neće propustiti.
 */
export function normalizeSenders(lines: readonly string[]): {
  valid: string[]
  invalid: string[]
} {
  const valid: string[] = []
  const invalid: string[] = []

  for (const line of lines) {
    const entry = line.trim().toLowerCase()
    if (entry === '') continue

    if (entry.startsWith('@')) {
      // Domen mora da ima bar jednu tačku i nešto sa obe njene strane.
      if (/^@[^\s@]+\.[^\s@]+$/.test(entry)) valid.push(entry)
      else invalid.push(line.trim())
      continue
    }

    const address = extractAddress(entry)
    if (address) valid.push(address)
    else invalid.push(line.trim())
  }

  return { valid: [...new Set(valid)], invalid }
}

const deliveryRow = z.object({
  id: uuid(),
  kind: z.string().nullable(),
  sender: z.string().nullable(),
  subject: z.string().nullable(),
  attachments: z.array(z.string()),
  accepted: z.boolean(),
  reason: z.string().nullable(),
  detail: z.string().nullable(),
  received_at: z.string(),
})

export type Delivery = z.infer<typeof deliveryRow>

export async function listDeliveries(
  db: Db,
  organizationId: string,
  integrationId: string,
  limit = 30,
): Promise<Result<Delivery[]>> {
  const { data, error } = await db
    .from('mail_deliveries')
    .select('id, kind, sender, subject, attachments, accepted, reason, detail, received_at')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .order('received_at', { ascending: false })
    .limit(limit)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(deliveryRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}
