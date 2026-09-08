import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { DatasetKind } from './mapping'
import { evaluateCadence, needsAttention, type Cadence, type CadenceVerdict } from './cadence'
import { isKnownTimeZone } from './zone'

/**
 * Dogovoreni ritam dolaska podataka.
 *
 * Očekivanje mora da postoji PRE nego što se tišina desi — posle je kasno, jer
 * se ne zna da li je izostanak kvar ili je tako i dogovoreno.
 */

const DEFAULT_TIME_ZONE = 'Europe/Belgrade'

const expectationRow = z.object({
  id: uuid(),
  integration_id: uuid(),
  kind: z.enum(['sales', 'receivables', 'payables', 'stock']),
  weekdays: z.array(z.number().int().min(1).max(7)),
  by_time: z.string(),
  time_zone: z.string(),
  grace_minutes: z.number().int(),
  active_from: z.string(),
  paused_until: z.string().nullable(),
  enabled: z.boolean(),
})

export type StoredExpectation = z.infer<typeof expectationRow>

/** `time` iz Postgresa stiže kao „08:00:00"; ritam traži „08:00". */
function trimSeconds(byTime: string): string {
  return byTime.slice(0, 5)
}

export function toCadence(row: StoredExpectation): Cadence {
  // Nepoznata zona bi oborila svaki proračun. Vraćanje na podrazumevanu je
  // bolje od praznog ekrana: rok promašuje za sat, ali alarm i dalje radi.
  const timeZone = isKnownTimeZone(row.time_zone) ? row.time_zone : DEFAULT_TIME_ZONE

  return {
    weekdays: row.weekdays,
    byTime: trimSeconds(row.by_time),
    timeZone,
    graceMinutes: row.grace_minutes,
    activeFrom: row.active_from,
    pausedUntil: row.paused_until,
  }
}

export async function listExpectations(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Result<StoredExpectation[]>> {
  const { data, error } = await db
    .from('import_expectations')
    .select(
      'id, integration_id, kind, weekdays, by_time, time_zone, grace_minutes, active_from, paused_until, enabled',
    )
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(expectationRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export interface SaveExpectationInput {
  readonly organizationId: string
  readonly integrationId: string
  readonly kind: DatasetKind
  readonly weekdays: readonly number[]
  readonly byTime: string
  readonly timeZone: string
  readonly graceMinutes: number
  readonly pausedUntil: string | null
  readonly enabled: boolean
  readonly userId: string
}

export async function saveExpectation(
  db: Db,
  input: SaveExpectationInput,
): Promise<Result<void>> {
  if (input.weekdays.length === 0) {
    return err(domainError('invalid_input', 'import.cadence.error.noDays'))
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(input.byTime)) {
    return err(domainError('invalid_input', 'import.cadence.error.badTime'))
  }
  if (!isKnownTimeZone(input.timeZone)) {
    return err(domainError('invalid_input', 'import.cadence.error.badZone'))
  }

  /*
   * `active_from` se postavlja SAMO pri prvom upisu. Da se osvežavao na svaku
   * izmenu, ispravka tolerancije bi obrisala zapamćenu tišinu i alarm koji je
   * već trajao bi tiho nestao.
   */
  const { error } = await db.from('import_expectations').upsert(
    {
      organization_id: input.organizationId,
      integration_id: input.integrationId,
      kind: input.kind,
      weekdays: [...input.weekdays].sort((a, b) => a - b),
      by_time: input.byTime,
      time_zone: input.timeZone,
      grace_minutes: input.graceMinutes,
      paused_until: input.pausedUntil,
      enabled: input.enabled,
      created_by: input.userId,
    },
    { onConflict: 'integration_id,kind' },
  )

  if (error) {
    return err(domainError('forbidden', 'import.cadence.error.saveFailed', { detail: error.message }))
  }
  return ok(undefined)
}

export async function deleteExpectation(
  db: Db,
  organizationId: string,
  integrationId: string,
  kind: DatasetKind,
): Promise<Result<void>> {
  const { error } = await db
    .from('import_expectations')
    .delete()
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('kind', kind)

  if (error) {
    return err(domainError('forbidden', 'import.cadence.error.saveFailed', { detail: error.message }))
  }
  return ok(undefined)
}

/**
 * Trenuci stvarnih uvoza, za ocenu ritma.
 *
 * Traži se ISTORIJA, ne samo poslednji uvoz: sa jednim podatkom se ne razlikuje
 * „stiglo juče pa danas izostalo" od „ništa nije stiglo cele nedelje".
 *
 * `superseded` skupovi se broje — zamenjen uvoz je i dalje stigao. Broje se
 * samo oni koji su se uspešno pročitali: neuspeo uvoz nije tišina, ali nije ni
 * podatak, i vidi se na svom spisku.
 */
export async function arrivalsSince(
  db: Db,
  organizationId: string,
  integrationId: string,
  kind: DatasetKind,
  since: Date,
): Promise<string[]> {
  const { data, error } = await db
    .from('imported_datasets')
    .select('imported_at')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('kind', kind)
    .in('status', ['ready', 'superseded'])
    .gte('imported_at', since.toISOString())
    .order('imported_at', { ascending: false })
    .limit(200)

  if (error) return []

  const rows = z.array(z.object({ imported_at: z.string() })).safeParse(data)
  return rows.success ? rows.data.map((r) => r.imported_at) : []
}

/** Koliko se istorije čita — mora da pokrije prozor koji ritam gleda unazad. */
export const ARRIVAL_HISTORY_DAYS = 50

export interface CadenceReport {
  readonly kind: DatasetKind
  readonly expectation: StoredExpectation
  readonly verdict: CadenceVerdict
}

/** Ocena svih dogovorenih ritmova jedne integracije. */
export async function reportCadence(
  db: Db,
  organizationId: string,
  integrationId: string,
  now = new Date(),
): Promise<Result<CadenceReport[]>> {
  const expectations = await listExpectations(db, organizationId, integrationId)
  if (!expectations.ok) return expectations

  const since = new Date(now.getTime() - ARRIVAL_HISTORY_DAYS * 86_400_000)

  const reports = await Promise.all(
    expectations.value
      .filter((row) => row.enabled)
      .map(async (row) => {
        const arrivals = await arrivalsSince(db, organizationId, integrationId, row.kind, since)
        return { kind: row.kind, expectation: row, verdict: evaluateCadence(toCadence(row), arrivals, now) }
      }),
  )

  return ok(reports)
}

export interface StalenessItem {
  readonly kind: DatasetKind
  readonly integrationId: string
  readonly verdict: CadenceVerdict
  readonly timeZone: string
}

/**
 * Tokovi cele organizacije koji ne stižu.
 *
 * Ovo čita KLIJENT, sa svojim nalogom, pod RLS-om — nezavisno od zakazanog
 * prolaza koji podiže upozorenja. Namerno dva puta: prolaz javlja konsultantu i
 * kada niko ne gleda, a ovo garantuje da onaj ko GLEDA nikad ne vidi zastareo
 * broj bez oznake, čak i kada je zakazani posao stao.
 *
 * Vraća samo ono što traži reakciju. Uredni tokovi se ne nabrajaju: traka koja
 * svakog dana piše „sve je stiglo" nauči korisnika da je preskače, pa je ne
 * pročita ni onog dana kada piše suprotno.
 */
export async function organizationStaleness(
  db: Db,
  organizationId: string,
  now = new Date(),
): Promise<StalenessItem[]> {
  const { data, error } = await db
    .from('import_expectations')
    .select(
      'id, integration_id, kind, weekdays, by_time, time_zone, grace_minutes, active_from, paused_until, enabled',
    )
    .eq('organization_id', organizationId)
    .eq('enabled', true)

  if (error) return []

  const rows = z.array(expectationRow).safeParse(data)
  if (!rows.success) return []

  const since = new Date(now.getTime() - ARRIVAL_HISTORY_DAYS * 86_400_000)

  const evaluated = await Promise.all(
    rows.data.map(async (row) => {
      const arrivals = await arrivalsSince(
        db,
        organizationId,
        row.integration_id,
        row.kind,
        since,
      )
      const cadence = toCadence(row)
      return {
        kind: row.kind,
        integrationId: row.integration_id,
        verdict: evaluateCadence(cadence, arrivals, now),
        timeZone: cadence.timeZone,
      }
    }),
  )

  return evaluated.filter((item) => needsAttention(item.verdict.state))
}
