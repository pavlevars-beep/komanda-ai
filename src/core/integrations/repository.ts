import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, notFound, type Result } from '../shared/result'

const connectorTypeRow = z.object({
  key: z.string(),
  name: z.record(z.string(), z.string()),
  category: z.string(),
  availability: z.enum(['ga', 'beta', 'planned']),
  supported_auth: z.array(z.string()),
  supports_agent: z.boolean(),
})

export type ConnectorType = z.infer<typeof connectorTypeRow>

const integrationRow = z.object({
  id: uuid(),
  organization_id: uuid(),
  connector_type_key: z.string(),
  name: z.string(),
  environment: z.enum(['sandbox', 'production']),
  status: z.enum([
    'draft',
    'testing',
    'connected',
    'needs_attention',
    'disconnected',
    'disabled',
  ]),
  auth_type: z.string(),
  config: z.record(z.string(), z.unknown()),
  is_read_only: z.boolean(),
  is_demo: z.boolean(),
  last_success_at: z.string().nullable(),
  last_sync_at: z.string().nullable(),
  last_error_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
  last_error_message: z.string().nullable(),
  created_at: z.string(),
})

export type Integration = z.infer<typeof integrationRow>

const SELECT_COLUMNS =
  'id, organization_id, connector_type_key, name, environment, status, auth_type, config, ' +
  'is_read_only, is_demo, last_success_at, last_sync_at, last_error_at, last_error_code, ' +
  'last_error_message, created_at'

/**
 * Katalog konektora.
 *
 * Vraća i one označene kao `planned`. UI ih prikazuje kao nedostupne, a ne
 * skriva — konsultant treba da vidi šta dolazi, ali ne sme da može da ih
 * izabere. Registar konektora u kodu je taj koji stvarno odlučuje šta radi.
 */
export async function listConnectorTypes(db: Db): Promise<Result<ConnectorType[]>> {
  const { data, error } = await db
    .from('connector_types')
    .select('key, name, category, availability, supported_auth, supports_agent')
    .order('availability')
    .order('key')

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(connectorTypeRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export async function listIntegrations(
  db: Db,
  organizationId: string,
): Promise<Result<Integration[]>> {
  // Filter po organizaciji stoji iako ga RLS već sprovodi. Treći sloj: ako
  // politika sutra bude pogrešno izmenjena, upit i dalje ne prelazi granicu.
  const { data, error } = await db
    .from('integrations')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(integrationRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

export async function getIntegration(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Result<Integration>> {
  const { data, error } = await db
    .from('integrations')
    .select(SELECT_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', integrationId)
    .maybeSingle()

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))
  if (!data) return err(notFound('integration'))

  const row = integrationRow.safeParse(data)
  return row.success
    ? ok(row.data)
    : err(domainError('internal', 'error.internal', { detail: row.error.message }))
}

export const createIntegrationInput = z.object({
  organizationId: uuid(),
  connectorTypeKey: z.string().min(2).max(40),
  name: z.string().trim().min(2, 'integrations.error.nameRequired').max(80),
  environment: z.enum(['sandbox', 'production']),
  authType: z.string().min(2).max(40),
  config: z.record(z.string(), z.unknown()).default({}),
})

export type CreateIntegrationInput = z.infer<typeof createIntegrationInput>

export async function createIntegration(
  db: Db,
  input: CreateIntegrationInput,
  createdBy: string,
): Promise<Result<string>> {
  const { data, error } = await db
    .from('integrations')
    .insert({
      organization_id: input.organizationId,
      connector_type_key: input.connectorTypeKey,
      name: input.name,
      environment: input.environment,
      auth_type: input.authType,
      config: input.config,
      // Nova integracija kreće kao nacrt. Status „povezano" se ne dodeljuje
      // na osnovu unetih podataka nego tek kada test veze prođe.
      status: 'draft',
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    const duplicate = /duplicate key/i.test(error.message)
    return err(
      domainError(
        duplicate ? 'conflict' : 'forbidden',
        duplicate ? 'integrations.error.nameTaken' : 'error.forbidden',
        { detail: error.message },
      ),
    )
  }

  const id = z.object({ id: uuid() }).safeParse(data)
  return id.success
    ? ok(id.data.id)
    : err(domainError('internal', 'error.internal', { detail: 'neočekivan povratni tip' }))
}

/**
 * Beleži ishod provere veze.
 *
 * Status integracije se izvodi iz stvarnog ishoda, nikad iz namere korisnika.
 * Zbog toga u UI-ju ne postoji dugme „označi kao povezano".
 */
export async function recordHealthCheck(
  db: Db,
  input: {
    organizationId: string
    integrationId: string
    ok: boolean
    latencyMs: number
    errorCode?: string | undefined
    errorMessage?: string | undefined
    checkedBy: string
  },
): Promise<Result<true>> {
  const now = new Date().toISOString()

  const { error: checkError } = await db.from('integration_health_checks').insert({
    organization_id: input.organizationId,
    integration_id: input.integrationId,
    ok: input.ok,
    latency_ms: input.latencyMs,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    checked_by: input.checkedBy,
  })

  if (checkError) {
    return err(domainError('internal', 'error.internal', { detail: checkError.message }))
  }

  const { error } = await db
    .from('integrations')
    .update(
      input.ok
        ? {
            status: 'connected',
            last_success_at: now,
            last_error_at: null,
            last_error_code: null,
            last_error_message: null,
          }
        : {
            status: 'needs_attention',
            last_error_at: now,
            last_error_code: input.errorCode ?? 'unknown',
            last_error_message: input.errorMessage ?? null,
          },
    )
    .eq('organization_id', input.organizationId)
    .eq('id', input.integrationId)

  return error
    ? err(domainError('internal', 'error.internal', { detail: error.message }))
    : ok(true)
}

const enabledCapabilityRow = z.object({
  capability_key: z.string(),
  mode: z.enum(['read', 'prepare', 'execute']),
  required_permission: z.string(),
  enabled: z.boolean(),
})

export async function listEnabledCapabilities(
  db: Db,
  organizationId: string,
  integrationId: string,
): Promise<Result<{ capabilityKey: string; mode: 'read' | 'prepare' | 'execute'; requiredPermission: string }[]>> {
  const { data, error } = await db
    .from('integration_capabilities')
    .select('capability_key, mode, required_permission, enabled')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .eq('enabled', true)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(enabledCapabilityRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  return ok(
    rows.data.map((r) => ({
      capabilityKey: r.capability_key,
      mode: r.mode,
      requiredPermission: r.required_permission,
    })),
  )
}

/** Sposobnosti koje aplikacija zna da izvrši — dolaze iz koda, ne iz baze. */
export async function connectorCatalogEntry(
  db: Db,
  key: string,
): Promise<Result<ConnectorType>> {
  const all = await listConnectorTypes(db)
  if (!all.ok) return all

  const found = all.value.find((t) => t.key === key)
  return found ? ok(found) : err(notFound('integration'))
}

