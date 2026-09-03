import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { Locale } from '@/i18n/config'

/**
 * Trajni zapis razgovora.
 *
 * Odgovor se ČUVA onakav kakav je bio u trenutku pitanja, zajedno sa vremenom
 * na koje se podatak odnosio. Ne računa se ponovo pri svakom otvaranju
 * stranice: istorija bi se tada menjala pod nogama, a rečenica koju je
 * korisnik pročitao i po njoj odlučio više ne bi postojala.
 *
 * Zato uz svaku poruku stoji i `data_as_of` u tragu poziva alata — čitalac
 * vidi da li gleda odgovor od maločas ili od prošle nedelje.
 */

const messageRow = z.object({
  id: uuid(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().nullable(),
  provenance: z.record(z.string(), z.unknown()),
  created_at: z.string(),
})

export type StoredMessage = z.infer<typeof messageRow>

const conversationRow = z.object({
  id: uuid(),
  title: z.string().nullable(),
  locale: z.string(),
  last_message_at: z.string().nullable(),
})

export type StoredConversation = z.infer<typeof conversationRow>

/** Poslednji razgovor korisnika u ovoj organizaciji, ako ga ima. */
export async function latestConversation(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<Result<StoredConversation | null>> {
  const { data, error } = await db
    .from('ai_conversations')
    .select('id, title, locale, last_message_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(conversationRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(rows.data[0] ?? null)
}

export async function createConversation(
  db: Db,
  organizationId: string,
  userId: string,
  locale: Locale,
): Promise<Result<string>> {
  const { data, error } = await db
    .from('ai_conversations')
    .insert({ organization_id: organizationId, user_id: userId, locale })
    .select('id')
    .single()

  // RLS traži permisiju `ask_ai` na upisu. Odbijanje ovde je uskraćen pristup,
  // ne interna greška — poruka korisniku mora da bude različita.
  if (error) {
    return err(domainError('forbidden', 'ask.error.notAllowed', { detail: error.message }))
  }

  const parsed = z.object({ id: uuid() }).safeParse(data)
  return parsed.success
    ? ok(parsed.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'ai_conversations.id' }))
}

export async function listMessages(
  db: Db,
  conversationId: string,
  limit = 40,
): Promise<Result<StoredMessage[]>> {
  const { data, error } = await db
    .from('ai_messages')
    .select('id, role, content, provenance, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(messageRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export interface AppendInput {
  readonly organizationId: string
  readonly conversationId: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly provenance?: Readonly<Record<string, unknown>>
}

export async function appendMessage(db: Db, input: AppendInput): Promise<Result<string>> {
  const { data, error } = await db
    .from('ai_messages')
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      provenance: input.provenance ?? {},
    })
    .select('id')
    .single()

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const parsed = z.object({ id: uuid() }).safeParse(data)
  return parsed.success
    ? ok(parsed.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'ai_messages.id' }))
}

export interface ToolCallInput {
  readonly organizationId: string
  readonly messageId: string
  readonly aiToolKey: string
  readonly integrationId: string | null
  readonly input: Readonly<Record<string, unknown>>
  readonly rowCount: number | null
  readonly status: 'ok' | 'denied' | 'error' | 'timeout'
  readonly deniedReason?: string
  readonly permissionChecked: string
  readonly dataAsOf: string | null
  readonly latencyMs: number
}

/**
 * Trag poziva alata.
 *
 * Upisuje se i kada je poziv ODBIJEN — odbijeni pokušaji su ono što se
 * najčešće traži pri proveri, a trag koji beleži samo uspehe ne odgovara na
 * pitanje „da li je iko pokušao da vidi ovo".
 *
 * `output_summary` namerno ne nosi pun skup podataka; broj redova i status su
 * dovoljni za proveru, a poslovni podaci ne treba da se umnožavaju po
 * tabelama.
 */
export async function recordToolCall(db: Db, input: ToolCallInput): Promise<void> {
  await db.from('ai_tool_calls').insert({
    organization_id: input.organizationId,
    message_id: input.messageId,
    ai_tool_key: input.aiToolKey,
    integration_id: input.integrationId,
    input: input.input,
    row_count: input.rowCount,
    status: input.status,
    denied_reason: input.deniedReason ?? null,
    permission_checked: input.permissionChecked,
    data_as_of: input.dataAsOf,
    latency_ms: input.latencyMs,
  })
}

export async function touchConversation(
  db: Db,
  conversationId: string,
  title: string | null,
): Promise<void> {
  await db
    .from('ai_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      // Naslov se postavlja samo ako ga još nema — prvo pitanje imenuje
      // razgovor, kasnija ga ne preimenuju pod nogama korisniku.
      ...(title !== null ? { title } : {}),
    })
    .eq('id', conversationId)
}
