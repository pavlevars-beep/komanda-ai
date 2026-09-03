import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { ContextEvent } from './events'

/**
 * Kontekstni događaji organizacije.
 *
 * Vidljivost i pravo upisa sprovodi RLS. Ovde se samo prevodi oblik iz baze u
 * oblik koji analiza koristi — provera na dva mesta znači da se jednog dana
 * raziđu, a ona koja stvarno štiti je ona u bazi.
 */

export const CONTEXT_EVENT_KINDS = [
  'one_off_project',
  'major_order',
  'supplier_disruption',
  'warehouse_closure',
  'price_change',
  'holiday_period',
  'strike',
  'market_shock',
  'new_location',
  'lost_customer',
  'campaign',
  'clearance',
  'other',
] as const

export type ContextEventKind = (typeof CONTEXT_EVENT_KINDS)[number]

export function isContextEventKind(value: unknown): value is ContextEventKind {
  return typeof value === 'string' && (CONTEXT_EVENT_KINDS as readonly string[]).includes(value)
}

const row = z.object({
  id: uuid(),
  kind: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  // PostgREST vraća numeric kao string, da ne izgubi preciznost.
  revenue_impact: z.union([z.string(), z.number()]).nullable(),
  exclude_from_baseline: z.boolean(),
  keep_in_totals: z.boolean(),
  exclude_from_forecast: z.boolean(),
  annotate_comparison: z.boolean(),
})

export interface StoredContextEvent extends ContextEvent {
  readonly note: string | null
}

function toEvent(r: z.infer<typeof row>): StoredContextEvent {
  const impact = r.revenue_impact === null ? null : Number(r.revenue_impact)
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    // Neispravan broj se tretira kao „nije uneto", ne kao nula: nula bi tiho
    // pomerila osnovicu, a izostanak je vidljiv i ne menja ništa.
    revenueImpact: impact !== null && Number.isFinite(impact) ? impact : null,
    excludeFromBaseline: r.exclude_from_baseline,
    keepInTotals: r.keep_in_totals,
    excludeFromForecast: r.exclude_from_forecast,
    annotateComparison: r.annotate_comparison,
  }
}

export async function listContextEvents(
  db: Db,
  organizationId: string,
): Promise<Result<StoredContextEvent[]>> {
  const { data, error } = await db
    .from('business_context_events')
    .select(
      'id, kind, title, note, starts_on, ends_on, revenue_impact, exclude_from_baseline, keep_in_totals, exclude_from_forecast, annotate_comparison',
    )
    .eq('organization_id', organizationId)
    .order('starts_on', { ascending: false })
    .limit(200)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(row).safeParse(data)
  return rows.success
    ? ok(rows.data.map(toEvent))
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export const contextEventInput = z
  .object({
    organizationId: uuid(),
    kind: z.enum(CONTEXT_EVENT_KINDS),
    title: z.string().trim().min(1, 'context.error.titleRequired').max(120),
    note: z.string().trim().max(500).nullable(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'context.error.dateInvalid'),
    endsOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'context.error.dateInvalid')
      .nullable(),
    revenueImpact: z.number().nullable(),
    excludeFromBaseline: z.boolean(),
    keepInTotals: z.boolean(),
    excludeFromForecast: z.boolean(),
    annotateComparison: z.boolean(),
  })
  // Isto ograničenje stoji i u bazi. Ovde je da bi korisnik dobio razumljivu
  // poruku umesto poruke o prekršenom ograničenju.
  .refine((v) => v.endsOn === null || v.endsOn >= v.startsOn, {
    message: 'context.error.periodReversed',
    path: ['endsOn'],
  })

export type ContextEventInput = z.infer<typeof contextEventInput>

export async function addContextEvent(
  db: Db,
  input: ContextEventInput,
  createdBy: string,
): Promise<Result<string>> {
  const { data, error } = await db
    .from('business_context_events')
    .insert({
      organization_id: input.organizationId,
      kind: input.kind,
      title: input.title,
      note: input.note,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      revenue_impact: input.revenueImpact,
      exclude_from_baseline: input.excludeFromBaseline,
      keep_in_totals: input.keepInTotals,
      exclude_from_forecast: input.excludeFromForecast,
      annotate_comparison: input.annotateComparison,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    return err(domainError('forbidden', 'context.error.saveFailed', { detail: error.message }))
  }

  const parsed = z.object({ id: uuid() }).safeParse(data)
  return parsed.success
    ? ok(parsed.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'business_context_events.id' }))
}

/**
 * Brisanje događaja.
 *
 * Politika propušta samo organizacije nad kojima pozivalac ima pravo, pa
 * pokušaj nad tuđim ne obara grešku — jednostavno ne obriše nijedan red. Zato
 * se broj obrisanih redova proverava.
 */
export async function deleteContextEvent(
  db: Db,
  organizationId: string,
  eventId: string,
): Promise<Result<void>> {
  const { data, error } = await db
    .from('business_context_events')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', eventId)
    .select('id')

  if (error) {
    return err(domainError('forbidden', 'context.error.deleteFailed', { detail: error.message }))
  }

  const rows = z.array(z.object({ id: uuid() })).safeParse(data)
  if (!rows.success || rows.data.length === 0) {
    return err(domainError('forbidden', 'context.error.deleteFailed'))
  }

  return ok(undefined)
}
