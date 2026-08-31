import { z } from 'zod'
import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import type { OrgContext } from './org-context'
import type { Membership } from '../auth/session'
import { PERMISSIONS, STAFF_ROLES, type Permission } from '../auth/permissions'
import { isLocale, DEFAULT_LOCALE } from '@/i18n/config'
import { err, ok, notFound, domainError, type Result } from '../shared/result'

/**
 * Redovi iz baze se proveravaju Zod šemom na granici repozitorijuma.
 *
 * Generisani tipovi važe u vreme kompajliranja i ćute kada se šema promeni
 * pod nogama — kolona se preimenuje, migracija se ne primeni, a aplikacija
 * tiho radi sa `undefined`. Provera u izvršavanju pukne odmah i glasno.
 */

const permissionArray = z
  .array(z.string())
  // Nepoznata permisija iz baze se odbacuje umesto da uđe u kontekst.
  .transform((keys) => keys.filter((k): k is Permission => (PERMISSIONS as readonly string[]).includes(k)))

const workspaceContextRow = z.object({
  organization_id: z.string().uuid(),
  organization_slug: z.string(),
  organization_name: z.string(),
  default_locale: z.string(),
  default_currency: z.string(),
  timezone: z.string(),
  is_demo: z.boolean(),
  permissions: permissionArray,
  staff_role: z.enum(STAFF_ROLES).nullable(),
  impersonation_session_id: z.string().uuid().nullable(),
  impersonation_expires_at: z.string().nullable(),
})

const membershipRow = z.object({
  organization_id: z.string().uuid(),
  organization_slug: z.string(),
  organization_name: z.string(),
  role_key: z.string(),
  is_demo: z.boolean(),
})

export const accessSessionRow = z.object({
  session_id: z.string().uuid(),
  staff_name: z.string().nullable(),
  reason: z.string(),
  scope: z.enum(['read_only', 'full']),
  expires_at: z.string(),
})

export type AccessSession = z.infer<typeof accessSessionRow>

export interface ResolveContextInput {
  readonly slug: string
  readonly userId: string
  readonly userName: string | null
  readonly requestId: string
}

/**
 * Razrešava kontekst organizacije.
 *
 * Organizacija se traži po slug-u iz PUTANJE, ali pripadnost proverava baza:
 * funkcija `workspace_context` vraća red samo ako korisnik ima članstvo ili
 * aktivnu sesiju pristupa. Slug u URL-u je zato samo pokazivač, nikad dokaz.
 */
export async function resolveOrgContext(
  db: Db,
  input: ResolveContextInput,
): Promise<Result<OrgContext>> {
  const { data, error } = await callRpc(db, 'workspace_context', { p_slug: input.slug })

  if (error) {
    return err(
      domainError('internal', 'error.internal', { detail: `workspace_context: ${error.message}` }),
    )
  }

  const rows = z.array(workspaceContextRow).safeParse(data)
  if (!rows.success) {
    return err(
      domainError('internal', 'error.internal', {
        detail: `workspace_context vratio neočekivan oblik: ${rows.error.message}`,
      }),
    )
  }

  const row = rows.data[0]
  // Nema pristupa i ne postoji vraćaju isto. Razlikovanje bi potvrdilo
  // postojanje tuđe organizacije.
  if (!row) return err(notFound('organization'))

  const context: OrgContext = {
    organizationId: row.organization_id,
    organizationSlug: row.organization_slug,
    organizationName: row.organization_name,
    locale: isLocale(row.default_locale) ? row.default_locale : DEFAULT_LOCALE,
    currency: row.default_currency,
    timezone: row.timezone,
    isDemo: row.is_demo,
    userId: input.userId,
    userName: input.userName,
    permissions: row.permissions,
    requestId: input.requestId,
    ...(row.staff_role
      ? {
          staff: {
            role: row.staff_role,
            impersonationSessionId: row.impersonation_session_id,
            impersonationExpiresAt: row.impersonation_expires_at,
          },
        }
      : {}),
  }

  return ok(context)
}

export async function listMemberships(db: Db): Promise<Result<Membership[]>> {
  const { data, error } = await callRpc(db, 'my_memberships')

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }

  const rows = z.array(membershipRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(
    rows.data.map((r) => ({
      organizationId: r.organization_id,
      organizationSlug: r.organization_slug,
      organizationName: r.organization_name,
      roleKey: r.role_key,
      isDemo: r.is_demo,
    })),
  )
}

/**
 * Otvorene sesije Delta Pro pristupa nad organizacijom.
 * Klijentu se prikazuju u traci na vrhu radnog prostora.
 */
export async function listActiveAccessSessions(
  db: Db,
  organizationId: string,
): Promise<Result<AccessSession[]>> {
  const { data, error } = await callRpc(db, 'active_access_sessions', {
    p_organization_id: organizationId,
  })

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }

  const rows = z.array(accessSessionRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(rows.data)
}
