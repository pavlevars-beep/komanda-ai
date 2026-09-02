import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'

/**
 * Podešavanje početne strane klijenta iz konzole.
 *
 * Ovo je karika koja je nedostajala: integracija može da radi, sposobnost može
 * biti uključena, a klijent i dalje vidi prazan ekran jer nema nijednu karticu.
 *
 * Kartica se NE dodaje sama od sebe kada se uključi sposobnost. Šta klijent
 * gleda na početnoj je odluka konsultanta, ne posledica tehničkog koraka.
 */

const cardRow = z.object({
  id: uuid(),
  ai_tool_key: z.string(),
  integration_id: uuid().nullable(),
  title: z.record(z.string(), z.string()),
  format: z.enum(['money', 'number', 'percent', 'count']),
  higher_is_better: z.boolean(),
  step_order: z.number().int(),
  enabled: z.boolean(),
})

export type ConfiguredCard = z.infer<typeof cardRow>

export async function listConfiguredCards(
  db: Db,
  organizationId: string,
): Promise<Result<ConfiguredCard[]>> {
  const { data, error } = await db
    .from('dashboard_cards')
    .select('id, ai_tool_key, integration_id, title, format, higher_is_better, step_order, enabled')
    .eq('organization_id', organizationId)
    .order('step_order')

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(cardRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

const availableToolRow = z.object({
  key: z.string(),
  name: z.record(z.string(), z.string()),
  capability_key: z.string().nullable(),
  required_permission: z.string(),
  classification: z.string(),
})

export type AvailableTool = z.infer<typeof availableToolRow> & {
  /** Integracija koja tu sposobnost stvarno nudi ovoj organizaciji. */
  readonly integrationId: string
  readonly integrationName: string
}

const enabledCapabilityRow = z.object({
  integration_id: uuid(),
  capability_key: z.string(),
})

const integrationNameRow = z.object({ id: uuid(), name: z.string() })

/**
 * Alati koje je moguće staviti na početnu — i ni jedan više.
 *
 * Alat je dostupan samo ako njegovu sposobnost STVARNO nudi neka uključena
 * integracija ove organizacije. Bez tog uslova bi konsultant mogao da doda
 * karticu koja nema odakle da povuče vrednost, pa bi klijent na početnoj
 * dobio „nedostupno" i pomislio da je sistem pokvaren.
 */
export async function listAvailableTools(
  db: Db,
  organizationId: string,
): Promise<Result<AvailableTool[]>> {
  const [caps, tools, integrations] = await Promise.all([
    db
      .from('integration_capabilities')
      .select('integration_id, capability_key')
      .eq('organization_id', organizationId)
      .eq('enabled', true),
    db.from('ai_tools').select('key, name, capability_key, required_permission, classification'),
    db.from('integrations').select('id, name').eq('organization_id', organizationId),
  ])

  for (const r of [caps, tools, integrations]) {
    if (r.error) return err(domainError('internal', 'error.internal', { detail: r.error.message }))
  }

  const parsedCaps = z.array(enabledCapabilityRow).safeParse(caps.data)
  const parsedTools = z.array(availableToolRow).safeParse(tools.data)
  const parsedIntegrations = z.array(integrationNameRow).safeParse(integrations.data)

  if (!parsedCaps.success || !parsedTools.success || !parsedIntegrations.success) {
    return err(domainError('internal', 'error.internal', { detail: 'neočekivan oblik reda' }))
  }

  const nameById = new Map(parsedIntegrations.data.map((i) => [i.id, i.name]))
  const out: AvailableTool[] = []

  for (const tool of parsedTools.data) {
    if (!tool.capability_key) continue
    const match = parsedCaps.data.find((c) => c.capability_key === tool.capability_key)
    if (!match) continue

    out.push({
      ...tool,
      integrationId: match.integration_id,
      integrationName: nameById.get(match.integration_id) ?? match.integration_id,
    })
  }

  return ok(out.sort((a, b) => a.key.localeCompare(b.key)))
}

export const addCardInput = z.object({
  organizationId: uuid(),
  aiToolKey: z.string().min(2).max(80),
  titleSr: z.string().trim().min(2, 'dashboard.error.titleRequired').max(60),
  titleEn: z.string().trim().min(2, 'dashboard.error.titleRequired').max(60),
  format: z.enum(['money', 'number', 'percent', 'count']),
  /** Da li je rast dobra vest. Za dospela potraživanja nije. */
  higherIsBetter: z.boolean(),
})

export type AddCardInput = z.infer<typeof addCardInput>

/**
 * Dodaje karticu i uz nju uključuje alat za organizaciju.
 *
 * Jedan potez, jer su to dve strane iste odluke. Da su dva koraka, ostajalo bi
 * stanje u kojem kartica postoji a alat nije uključen — `dashboard_cards_for_user`
 * je tada ne vraća, pa bi konsultant video karticu u konzoli a klijent prazan
 * ekran, bez ijedne poruke o tome zašto.
 */
export async function addCard(
  db: Db,
  input: AddCardInput,
  tool: AvailableTool,
  /** Ko je uključio alat. `dashboard_cards` nema to polje; `organization_ai_tools` ima. */
  addedBy: string,
): Promise<Result<string>> {
  const { error: toolError } = await db.from('organization_ai_tools').upsert(
    {
      organization_id: input.organizationId,
      ai_tool_key: input.aiToolKey,
      enabled: true,
      integration_id: tool.integrationId,
      enabled_by: addedBy,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,ai_tool_key' },
  )

  if (toolError) {
    return err(domainError('forbidden', 'error.forbidden', { detail: toolError.message }))
  }

  const existing = await listConfiguredCards(db, input.organizationId)
  const nextOrder = existing.ok
    ? existing.value.reduce((max, c) => Math.max(max, c.step_order), 0) + 1
    : 1

  const { data, error } = await db
    .from('dashboard_cards')
    .insert({
      organization_id: input.organizationId,
      ai_tool_key: input.aiToolKey,
      integration_id: tool.integrationId,
      title: { sr: input.titleSr, en: input.titleEn },
      format: input.format,
      higher_is_better: input.higherIsBetter,
      step_order: nextOrder,
      enabled: true,
    })
    .select('id')
    .single()

  if (error) {
    return err(domainError('forbidden', 'error.forbidden', { detail: error.message }))
  }

  const row = z.object({ id: uuid() }).safeParse(data)
  return row.success
    ? ok(row.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'neočekivan povratni tip' }))
}

/** Uklanja karticu sa početne. Alat ostaje uključen — kartica i pravo nisu isto. */
export async function removeCard(
  db: Db,
  organizationId: string,
  cardId: string,
): Promise<Result<true>> {
  const { error } = await db
    .from('dashboard_cards')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', cardId)

  return error
    ? err(domainError('forbidden', 'error.forbidden', { detail: error.message }))
    : ok(true)
}
