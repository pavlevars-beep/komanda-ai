import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import { err, ok, domainError, type Result } from '../shared/result'

const cardRow = z.object({
  card_id: uuid(),
  ai_tool_key: z.string(),
  integration_id: uuid().nullable(),
  title: z.record(z.string(), z.string()),
  format: z.enum(['money', 'number', 'percent', 'count']),
  value_field: z.string(),
  compare_field: z.string().nullable(),
  higher_is_better: z.boolean(),
  input: z.record(z.string(), z.unknown()),
  step_order: z.number().int(),
  classification: z.enum(['fact', 'calculation', 'interpretation', 'forecast']),
  connector_type: z.string().nullable(),
  capability_key: z.string().nullable(),
})

export type DashboardCardConfig = z.infer<typeof cardRow>

/**
 * Kartice koje ovaj korisnik sme da vidi.
 *
 * Filtriranje po permisiji radi baza, koristeći permisiju iz definicije alata
 * a ne iz konfiguracije kartice. Aplikacija ne odlučuje šta se prikazuje —
 * ona samo iscrtava ono što je prošlo.
 */
export async function listDashboardCards(
  db: Db,
  organizationId: string,
): Promise<Result<DashboardCardConfig[]>> {
  const { data, error } = await callRpc(db, 'dashboard_cards_for_user', {
    p_organization_id: organizationId,
  })

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }

  const rows = z.array(cardRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}
