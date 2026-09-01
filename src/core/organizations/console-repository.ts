import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import { err, ok, domainError, notFound, type Result } from '../shared/result'

/** Redovi iz baze se proveravaju šemom, ne uzimaju zdravo za gotovo. */

const clientRow = z.object({
  organization_id: uuid(),
  slug: z.string(),
  display_name: z.string(),
  industry: z.string().nullable(),
  status: z.enum(['prospect', 'onboarding', 'active', 'suspended', 'archived']),
  plan: z.string(),
  is_demo: z.boolean(),
  active_users: z.number().int(),
  pending_invites: z.number().int(),
  active_integrations: z.number().int(),
  integrations_attention: z.number().int(),
  onboarding_done: z.number().int(),
  onboarding_total: z.number().int(),
  consultants: z.array(z.string()),
  has_open_access_session: z.boolean(),
  last_activity_at: z.string().nullable(),
})

export type ConsoleClient = z.infer<typeof clientRow>

const onboardingRow = z.object({
  key: z.string(),
  step_order: z.number().int(),
  status: z.enum(['pending', 'in_progress', 'done', 'skipped']),
  completed_at: z.string().nullable(),
  completed_by: z.string().nullable(),
})

export type OnboardingTask = z.infer<typeof onboardingRow>

const memberRow = z.object({
  membership_id: uuid(),
  user_id: uuid(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  role_key: z.string(),
  role_name: z.record(z.string(), z.string()),
  status: z.enum(['invited', 'active', 'suspended', 'revoked']),
  invited_at: z.string(),
  accepted_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  override_count: z.number().int(),
})

export type OrgMember = z.infer<typeof memberRow>

const openSessionRow = z.object({
  session_id: uuid(),
  organization_id: uuid(),
  organization_slug: z.string(),
  organization_name: z.string(),
  reason: z.string(),
  scope: z.enum(['read_only', 'full']),
  expires_at: z.string(),
})

export type OpenAccessSession = z.infer<typeof openSessionRow>

/** Zajednički oblik: pozovi, proveri grešku, provuci kroz šemu. */
async function fetchRows<T>(
  db: Db,
  fn: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
): Promise<Result<T[]>> {
  const { data, error } = await callRpc(db, fn, args)

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: `${fn}: ${error.message}` }))
  }

  const rows = z.array(schema).safeParse(data)
  if (!rows.success) {
    return err(
      domainError('internal', 'error.internal', {
        detail: `${fn} vratio neočekivan oblik: ${rows.error.message}`,
      }),
    )
  }

  return ok(rows.data)
}

export function listConsoleClients(db: Db): Promise<Result<ConsoleClient[]>> {
  return fetchRows(db, 'console_clients', clientRow)
}

export async function getConsoleClient(
  db: Db,
  organizationId: string,
): Promise<Result<ConsoleClient>> {
  const all = await listConsoleClients(db)
  if (!all.ok) return all

  const found = all.value.find((c) => c.organization_id === organizationId)
  // Nepostojeća i nedostupna organizacija vraćaju isto — razlika bi potvrdila
  // da organizacija postoji, što je informacija koju konsultant bez dodele
  // ne treba da dobije.
  return found ? ok(found) : err(notFound('organization'))
}

export function listOnboarding(db: Db, organizationId: string): Promise<Result<OnboardingTask[]>> {
  return fetchRows(db, 'console_onboarding', onboardingRow, {
    p_organization_id: organizationId,
  })
}

export function listOrgMembers(db: Db, organizationId: string): Promise<Result<OrgMember[]>> {
  return fetchRows(db, 'console_org_members', memberRow, {
    p_organization_id: organizationId,
  })
}

export function listMyOpenAccessSessions(db: Db): Promise<Result<OpenAccessSession[]>> {
  return fetchRows(db, 'my_open_access_sessions', openSessionRow)
}
