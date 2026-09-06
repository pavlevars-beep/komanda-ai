import { z } from 'zod'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'

/**
 * Čitanje revizionog traga.
 *
 * Ko šta vidi odlučuje RLS: član organizacije uz pravo `view_audit_log`,
 * osoblje nad klijentima koje administrira, a platformske događaje bez
 * organizacije samo Super Admin. Ovde se ne dodaje nijedan filter po pristupu —
 * druga definicija istog pravila bi se vremenom razišla sa politikom.
 *
 * Zapis se nikad ne menja i ne briše. To je jedina osobina zbog koje trag ima
 * vrednost, i zato ovaj modul nema nijednu funkciju za pisanje.
 */

const entryRow = z.object({
  id: z.union([z.number(), z.string()]),
  organization_id: z.string().nullable(),
  actor_type: z.enum(['staff', 'user', 'system']),
  action: z.string(),
  status: z.enum(['success', 'denied', 'failure']),
  occurred_at: z.string(),
  request_id: z.string(),
  actor_user_id: z.string().nullable(),
})

export interface AuditEntry {
  readonly id: string
  readonly organizationName: string | null
  readonly actorType: 'staff' | 'user' | 'system'
  readonly actorName: string | null
  readonly action: string
  readonly status: 'success' | 'denied' | 'failure'
  readonly occurredAt: string
  readonly requestId: string
}

export const AUDIT_PAGE_SIZE = 100

export async function listAuditEntries(
  db: Db,
  options: { organizationId?: string; limit?: number } = {},
): Promise<Result<AuditEntry[]>> {
  let query = db
    .from('audit_logs')
    .select('id, organization_id, actor_type, action, status, occurred_at, request_id, actor_user_id')
    .order('occurred_at', { ascending: false })
    .limit(options.limit ?? AUDIT_PAGE_SIZE)

  if (options.organizationId) query = query.eq('organization_id', options.organizationId)

  const { data, error } = await query
  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(entryRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  /*
   * Imena se dovlače zasebnim upitom, ne spajanjem.
   *
   * `audit_logs` je particionirana, a `actor_user_id` i `organization_id` su
   * gole `uuid` kolone bez stranog ključa — namerno, da upis revizije nikad ne
   * padne zato što je red na koji pokazuje u međuvremenu obrisan. PostgREST
   * bez stranog ključa ne ume da spoji, pa se imena traže odvojeno.
   *
   * Imena koja se ne nađu ostaju prazna. Ni jedno ni drugo nije greška: nalog
   * i organizacija se mogu obrisati, a trag ih preživljava — to mu je i svrha.
   */
  const [names, orgNames] = await Promise.all([
    lookupNames(db, rows.data.map((r) => r.actor_user_id)),
    lookupOrganizations(db, rows.data.map((r) => r.organization_id)),
  ])

  return ok(
    rows.data.map((r) => ({
      id: String(r.id),
      organizationName: r.organization_id ? (orgNames.get(r.organization_id) ?? null) : null,
      actorType: r.actor_type,
      actorName: r.actor_user_id ? (names.get(r.actor_user_id) ?? null) : null,
      action: r.action,
      status: r.status,
      occurredAt: r.occurred_at,
      requestId: r.request_id,
    })),
  )
}

/** Imena aktera. Neuspeh vraća prazno — trag se prikazuje i bez imena. */
async function lookupNames(db: Db, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return new Map()

  const { data } = await db.from('user_profiles').select('id, full_name').in('id', unique)
  const rows = z.array(z.object({ id: z.string(), full_name: z.string().nullable() })).safeParse(data)
  if (!rows.success) return new Map()

  return new Map(
    rows.data.filter((r) => r.full_name !== null).map((r) => [r.id, r.full_name as string]),
  )
}

async function lookupOrganizations(
  db: Db,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  if (unique.length === 0) return new Map()

  const { data } = await db.from('organizations').select('id, display_name').in('id', unique)
  const rows = z.array(z.object({ id: z.string(), display_name: z.string() })).safeParse(data)
  return rows.success ? new Map(rows.data.map((r) => [r.id, r.display_name])) : new Map()
}
