import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { err, ok, domainError, type Result } from '../shared/result'

const alertRow = z.object({
  id: uuid(),
  severity: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  body: z.record(z.string(), z.string()).nullable(),
  source: z.string(),
  status: z.enum(['new', 'acknowledged', 'resolved', 'dismissed']),
  created_at: z.string(),
})

export type Alert = z.infer<typeof alertRow>

/**
 * Otvorena upozorenja organizacije.
 *
 * Filter po organization_id je namerno napisan iako RLS već radi isti posao.
 * To je treći sloj izolacije: ako politika sutra bude pogrešno izmenjena,
 * upit i dalje ne prelazi granicu organizacije.
 */
export async function listOpenAlerts(
  db: Db,
  ctx: OrgContext,
  limit = 20,
): Promise<Result<Alert[]>> {
  const { data, error } = await db
    .from('alerts')
    .select('id, severity, title, body, source, status, created_at')
    .eq('organization_id', ctx.organizationId)
    .in('status', ['new', 'acknowledged'])
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }

  const rows = z.array(alertRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(rows.data)
}
