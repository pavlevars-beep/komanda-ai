import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import type { AuditAction } from './actions'

export type AuditStatus = 'success' | 'failure' | 'denied'
export type AuditActorType = 'user' | 'staff' | 'system' | 'ai'

export interface AuditEntry {
  readonly action: AuditAction
  readonly status: AuditStatus
  readonly actorType: AuditActorType
  readonly requestId: string
  readonly organizationId?: string | null
  readonly resourceType?: string
  readonly resourceId?: string
  readonly integrationId?: string
  readonly reason?: string
  readonly metadata?: Record<string, unknown>
  readonly ip?: string
  readonly userAgent?: string
}

/**
 * Ključevi čija vrednost nikad ne ulazi u revizioni zapis.
 * Revizija se čuva godinama i čita je više ljudi nego logove.
 */
const FORBIDDEN_METADATA_KEYS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'client_secret',
  'refresh_token',
  'connection_string',
  'vault_secret_id',
]

function sanitizeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase()
    if (FORBIDDEN_METADATA_KEYS.some((f) => lower.includes(f))) {
      out[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      // Ugnežene strukture se ne prepisuju u reviziju; upisuje se samo oblik.
      out[key] = Array.isArray(value) ? `[niz: ${value.length}]` : '[objekat]'
    } else {
      out[key] = value
    }
  }
  return out
}

/**
 * Upisuje revizioni zapis.
 *
 * Aktera i aktivnu sesiju pristupa popunjava sama baza (app.write_audit),
 * pa se ne mogu podmetnuti kroz argumente.
 *
 * Neuspeh upisa se NE prosleđuje pozivaocu kao izuzetak — korisnička radnja
 * koja je već izvršena ne sme da se prikaže kao neuspela zato što je log pao.
 * Vraća se boolean da pozivalac može da prijavi problem gde je prikladno.
 */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<boolean> {
  const { error } = await callRpc(db, 'write_audit', {
    p_action: entry.action,
    p_actor_type: entry.actorType,
    p_status: entry.status,
    p_request_id: entry.requestId,
    p_organization_id: entry.organizationId ?? null,
    p_resource_type: entry.resourceType ?? null,
    p_resource_id: entry.resourceId ?? null,
    p_integration_id: entry.integrationId ?? null,
    p_reason: entry.reason ?? null,
    p_metadata: sanitizeMetadata(entry.metadata),
    p_ip: entry.ip ?? null,
    p_user_agent: entry.userAgent ?? null,
  })

  return !error
}
