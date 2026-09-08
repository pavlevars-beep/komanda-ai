import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { evaluateCadence, needsAttention } from './cadence'
import { toCadence, ARRIVAL_HISTORY_DAYS } from './expectations'
import { silenceDedupeKey, silenceMessage } from './silence-message'

/**
 * Prolaz kroz sve dogovorene ritmove i podizanje upozorenja na tišinu.
 *
 * Pokreće se ZAKAZANO, bez korisnika u kontekstu. Zato dobija klijent koji
 * zaobilazi RLS — i zato svaki red nosi svoj `organization_id`, koji se
 * prosleđuje u upozorenje umesto da se pretpostavlja.
 *
 * Provera mora da radi i kada niko ne gleda. Da se tišina računala tek pri
 * otvaranju table, kvar bi bio primećen tek kad ga neko potraži — a smisao je
 * da konsultant zna PRE nego što klijent primeti.
 */

const expectationRow = z.object({
  id: uuid(),
  organization_id: uuid(),
  integration_id: uuid(),
  kind: z.enum(['sales', 'receivables', 'payables', 'stock']),
  weekdays: z.array(z.number().int()),
  by_time: z.string(),
  time_zone: z.string(),
  grace_minutes: z.number().int(),
  active_from: z.string(),
  paused_until: z.string().nullable(),
  enabled: z.boolean(),
})

export interface SweepOutcome {
  readonly checked: number
  readonly raised: number
  readonly escalated: number
  readonly resolved: number
  readonly failed: number
}

const DAY = 86_400_000

export async function sweepSilence(db: Db, now = new Date()): Promise<SweepOutcome> {
  const { data, error } = await db
    .from('import_expectations')
    .select(
      'id, organization_id, integration_id, kind, weekdays, by_time, time_zone, grace_minutes, active_from, paused_until, enabled',
    )
    .eq('enabled', true)

  if (error) return { checked: 0, raised: 0, escalated: 0, resolved: 0, failed: 1 }

  const rows = z.array(expectationRow).safeParse(data)
  if (!rows.success) return { checked: 0, raised: 0, escalated: 0, resolved: 0, failed: 1 }

  const since = new Date(now.getTime() - ARRIVAL_HISTORY_DAYS * DAY)
  const arrivals = await arrivalsByStream(db, rows.data, since)

  // Nazivi izvora se dovlače odjednom: klijent sa dva izvora iste vrste bi bez
  // naziva dobio dva upozorenja koja se ne razlikuju ni po čemu.
  const names = await sourceNames(db, rows.data.map((r) => r.integration_id))

  let raised = 0
  let escalated = 0
  let resolved = 0
  let failed = 0

  for (const row of rows.data) {
    const key = streamKey(row.organization_id, row.integration_id, row.kind)
    const verdict = evaluateCadence(toCadence(row), arrivals.get(key) ?? [], now)
    const dedupe = silenceDedupeKey(row.integration_id, row.kind)

    if (!needsAttention(verdict.state)) {
      // Dotok se vratio: upozorenje se REŠAVA, ne briše. Trag o prekidu je ono
      // što se pri sledećem razgovoru sa klijentom prvo traži.
      const closed = await resolveOpen(db, row.organization_id, dedupe, now)
      if (closed) resolved += 1
      continue
    }

    const message = silenceMessage({
      kind: row.kind,
      state: verdict.state,
      verdict,
      weekdays: row.weekdays,
      byTime: row.by_time.slice(0, 5),
      timeZone: toCadence(row).timeZone,
      sourceName: names.get(row.integration_id) ?? null,
    })
    if (!message) continue

    const outcome = await raiseOrEscalate(db, {
      organizationId: row.organization_id,
      dedupe,
      severity: message.severity,
      title: message.title.sr,
      body: message.body,
      context: {
        integration_id: row.integration_id,
        kind: row.kind,
        state: verdict.state,
        missed_periods: verdict.missedPeriods,
        silent_since: verdict.silentSince,
        last_arrival_at: verdict.lastArrivalAt,
      },
    })

    if (outcome === 'raised') raised += 1
    else if (outcome === 'escalated') escalated += 1
    else if (outcome === 'failed') failed += 1
  }

  return { checked: rows.data.length, raised, escalated, resolved, failed }
}

type ExpectationRow = z.infer<typeof expectationRow>

function streamKey(organizationId: string, integrationId: string, kind: string): string {
  return `${organizationId}|${integrationId}|${kind}`
}

/**
 * Trenuci uvoza za sve praćene tokove odjednom.
 *
 * Jedan upit umesto upita po očekivanju. Redovi se vraćaju u memoriji na svoj
 * tok po SVA TRI ključa, uključujući organizaciju — da upit koji zaobilazi RLS
 * ni slučajno ne bi spojio tuđi uvoz sa našim očekivanjem.
 */
async function arrivalsByStream(
  db: Db,
  expectations: readonly ExpectationRow[],
  since: Date,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (expectations.length === 0) return out

  const integrationIds = [...new Set(expectations.map((e) => e.integration_id))]

  const { data, error } = await db
    .from('imported_datasets')
    .select('organization_id, integration_id, kind, imported_at')
    .in('integration_id', integrationIds)
    .in('status', ['ready', 'superseded'])
    .gte('imported_at', since.toISOString())
    .order('imported_at', { ascending: false })
    .limit(5_000)

  if (error) return out

  const rows = z
    .array(
      z.object({
        organization_id: uuid(),
        integration_id: uuid(),
        kind: z.string(),
        imported_at: z.string(),
      }),
    )
    .safeParse(data)

  if (!rows.success) return out

  const wanted = new Set(
    expectations.map((e) => streamKey(e.organization_id, e.integration_id, e.kind)),
  )

  for (const row of rows.data) {
    const key = streamKey(row.organization_id, row.integration_id, row.kind)
    if (!wanted.has(key)) continue
    const list = out.get(key)
    if (list) list.push(row.imported_at)
    else out.set(key, [row.imported_at])
  }

  return out
}

async function sourceNames(db: Db, integrationIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (integrationIds.length === 0) return out

  const { data, error } = await db
    .from('integrations')
    .select('id, name')
    .in('id', [...new Set(integrationIds)])

  if (error) return out

  const rows = z.array(z.object({ id: uuid(), name: z.string() })).safeParse(data)
  if (!rows.success) return out

  for (const row of rows.data) out.set(row.id, row.name)
  return out
}

interface RaiseInput {
  readonly organizationId: string
  readonly dedupe: string
  readonly severity: 'warning' | 'critical'
  readonly title: string
  readonly body: { sr: string; en: string }
  readonly context: Record<string, unknown>
}

/**
 * Podizanje ili pooštravanje.
 *
 * Jedan prekid je JEDNO upozorenje. Kada tišina potraje, ne otvara se novo nego
 * se postojeće pooštrava — inače bi nedelja tišine napravila pet upozorenja o
 * istoj stvari i zatrpala ono što je stvarno novo.
 *
 * Jedinstveni indeks nad otvorenim upozorenjima to i garantuje na nivou baze,
 * pa dva prolaza koja se preklope ne mogu da naprave duplikat.
 */
async function raiseOrEscalate(
  db: Db,
  input: RaiseInput,
): Promise<'raised' | 'escalated' | 'unchanged' | 'failed'> {
  const { data: existing } = await db
    .from('alerts')
    .select('id, severity, title')
    .eq('organization_id', input.organizationId)
    .eq('dedupe_key', input.dedupe)
    .in('status', ['new', 'acknowledged'])
    .limit(1)

  const open = z
    .array(z.object({ id: uuid(), severity: z.string(), title: z.string() }))
    .safeParse(existing)

  const current = open.success ? open.data[0] : undefined

  if (current) {
    if (current.severity === input.severity && current.title === input.title) return 'unchanged'

    const { error } = await db
      .from('alerts')
      .update({ severity: input.severity, title: input.title, body: input.body, context: input.context })
      .eq('organization_id', input.organizationId)
      .eq('id', current.id)

    return error ? 'failed' : 'escalated'
  }

  const { error } = await db.from('alerts').insert({
    organization_id: input.organizationId,
    severity: input.severity,
    title: input.title,
    body: input.body,
    source: 'integration',
    dedupe_key: input.dedupe,
    context: input.context,
  })

  // Utrka sa drugim prolazom: indeks je odbio duplikat, što je ispravan ishod.
  if (error) return error.code === '23505' ? 'unchanged' : 'failed'
  return 'raised'
}

async function resolveOpen(
  db: Db,
  organizationId: string,
  dedupe: string,
  now: Date,
): Promise<boolean> {
  const { data, error } = await db
    .from('alerts')
    .update({ status: 'resolved', resolved_at: now.toISOString() })
    .eq('organization_id', organizationId)
    .eq('dedupe_key', dedupe)
    .in('status', ['new', 'acknowledged'])
    .select('id')

  return !error && Array.isArray(data) && data.length > 0
}
