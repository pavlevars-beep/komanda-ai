import { z } from 'zod'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'

const clientRow = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  display_name: z.string(),
  industry: z.string().nullable(),
  status: z.enum(['prospect', 'onboarding', 'active', 'suspended', 'archived']),
  plan: z.string(),
  is_demo: z.boolean(),
})

export type ClientOrganization = z.infer<typeof clientRow>

/**
 * Klijentske organizacije koje pozivalac sme da administrira.
 *
 * Opseg određuje RLS kroz app.administrable_org_ids(): Super Admin vidi sve,
 * konsultant samo dodeljene. Platformska organizacija se izostavlja jer nije
 * klijent.
 */
export async function listClientOrganizations(db: Db): Promise<Result<ClientOrganization[]>> {
  const { data, error } = await db
    .from('organizations')
    .select('id, slug, display_name, industry, status, plan, is_demo')
    .eq('is_platform_org', false)
    .order('display_name')

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }

  const rows = z.array(clientRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(rows.data)
}
