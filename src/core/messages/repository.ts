import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import { err, ok, domainError, type Result } from '../shared/result'
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX } from './limits'

/**
 * Poruke iz sistema ka rolama.
 *
 * Aplikacija šalje ROLE, nikad spisak korisnika. Primaoce razrešava baza iz
 * aktivnog članstva — da lista stiže iz zahteva, izmenjen zahtev bi mogao da
 * pošalje poruku bilo kome.
 */

/**
 * Role kojima se poruka može poslati.
 *
 * Namerno bez `viewer`: to je nalog za uvid, ne neko ko odgovara na poruku.
 * Redosled je onaj kojim se biraju u obrascu — od uprave ka izvršiocima.
 */
export const MESSAGE_ROLES = [
  'client_owner',
  'client_admin',
  'manager',
  'finance',
  'sales',
  'employee',
] as const

export type MessageRole = (typeof MESSAGE_ROLES)[number]

export function isMessageRole(value: unknown): value is MessageRole {
  return typeof value === 'string' && (MESSAGE_ROLES as readonly string[]).includes(value)
}

export { MESSAGE_TITLE_MAX, MESSAGE_BODY_MAX } from './limits'

export interface SendMessageInput {
  readonly organizationId: string
  readonly roles: readonly MessageRole[]
  readonly title: string
  readonly body: string
}

export function validateMessage(input: {
  roles: readonly string[]
  title: string
  body: string
}): Result<{ roles: MessageRole[]; title: string; body: string }> {
  const roles = input.roles.filter(isMessageRole)
  if (roles.length === 0) return err(domainError('invalid_input', 'messages.error.noRoles'))

  const title = input.title.trim()
  if (title.length === 0) return err(domainError('invalid_input', 'messages.error.noTitle'))
  if (title.length > MESSAGE_TITLE_MAX) {
    return err(domainError('invalid_input', 'messages.error.titleTooLong'))
  }

  const body = input.body.trim()
  if (body.length > MESSAGE_BODY_MAX) {
    return err(domainError('invalid_input', 'messages.error.bodyTooLong'))
  }

  return ok({ roles, title, body })
}

/**
 * Slanje poruke.
 *
 * Vraća BROJ primalaca, ne samo uspeh. Nula primalaca nije greška — rola
 * postoji ali u njoj nema nikoga — a pošiljalac to mora da vidi, jer bi inače
 * mislio da je poruka stigla.
 */
export async function sendMessage(db: Db, input: SendMessageInput): Promise<Result<number>> {
  const { data, error } = await callRpc(db, 'send_org_message', {
    p_organization_id: input.organizationId,
    p_role_keys: input.roles,
    p_title: input.title,
    p_body: input.body === '' ? null : input.body,
    p_link: null,
  })

  if (error) {
    // 42501 je odbijeno pravo; sve ostalo je stvarno neočekivano.
    const denied = error.code === '42501' || /nema prava/i.test(error.message)
    return err(
      domainError(denied ? 'forbidden' : 'internal', denied ? 'messages.error.notAllowed' : 'error.internal', {
        detail: error.message,
      }),
    )
  }

  const count = z.number().int().safeParse(data)
  return count.success
    ? ok(count.data)
    : err(domainError('internal', 'error.internal', { detail: 'send_org_message' }))
}

const inboxRow = z.object({
  id: uuid(),
  title: z.string(),
  body: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
})

export type InboxMessage = z.infer<typeof inboxRow>

export async function listInbox(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<Result<InboxMessage[]>> {
  const { data, error } = await db
    .from('notifications')
    .select('id, title, body, created_at, read_at')
    .eq('organization_id', organizationId)
    // Politika pošiljaoca propušta i poruke poslate drugima, pa se prijemno
    // sanduče izričito sužava na sopstvene — inače bi direktor u svom sandučetu
    // video po jednu kopiju za svakog primaoca.
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(inboxRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export async function markRead(db: Db, userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .in('id', ids)
}

/**
 * Broj nepročitanih poruka, za oznaku u navigaciji.
 *
 * Broji se u bazi (`head: true`), ne dovlačenjem redova pa brojanjem u
 * aplikaciji — ova vrednost se traži pri SVAKOM otvaranju bilo koje stranice
 * radnog prostora, jer stoji u okviru.
 */
export async function countUnread(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<number> {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('read_at', null)

  // Oznaka je pogodnost; njen kvar ne sme da obori ceo okvir radnog prostora.
  return error ? 0 : (count ?? 0)
}
