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

/**
 * Potvrđivanje upozorenja.
 *
 * Upozorenje se NE briše. Prelazi u stanje `acknowledged`, uz vreme i ime
 * onoga ko ga je potvrdio — brisanjem bi nestao i podatak o tome da je neko
 * problem uopšte video, a to je često jedino što se kasnije traži.
 *
 * Politika propušta samo organizacije kojima pozivalac ima pristup, pa pokušaj
 * nad tuđim ne obara grešku nego ne pogodi nijedan red. Zato se broj izmenjenih
 * redova proverava: bez toga bi UI javio uspeh a ništa se ne bi promenilo.
 */
export async function acknowledgeAlert(
  db: Db,
  organizationId: string,
  alertId: string,
  userId: string,
): Promise<Result<void>> {
  const { data, error } = await db
    .from('alerts')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: userId,
    })
    .eq('organization_id', organizationId)
    .eq('id', alertId)
    .eq('status', 'new')
    .select('id')

  if (error) {
    return err(domainError('forbidden', 'alerts.error.failed', { detail: error.message }))
  }

  const rows = z.array(z.object({ id: z.string() })).safeParse(data)
  if (!rows.success || rows.data.length === 0) {
    return err(domainError('forbidden', 'alerts.error.failed'))
  }

  return ok(undefined)
}
