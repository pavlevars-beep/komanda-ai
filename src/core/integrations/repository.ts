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


// ---------------------------------------------------------------------------
// Uključivanje sposobnosti
// ---------------------------------------------------------------------------

/**
 * Stanje jedne sposobnosti za konkretnu integraciju.
 *
 * `declared` razlikuje dva različita slučaja koja u bazi izgledaju isto:
 * sposobnost koju konektor u kodu i dalje nudi, i red koji je ostao za
 * sposobnošću koje više nema. Drugi slučaj se NE skriva — red postoji, može
 * biti uključen, i konsultant mora da ga vidi da bi mogao da ga ugasi.
 */
export interface CapabilityState {
  readonly capabilityKey: string
  readonly mode: 'read' | 'prepare' | 'execute'
  readonly requiredPermission: string
  readonly classification: string | null
  readonly enabled: boolean
  readonly declared: boolean
}

const capabilityRow = z.object({
  capability_key: z.string(),
  mode: z.enum(['read', 'prepare', 'execute']),
  required_permission: z.string(),
  enabled: z.boolean(),
})

/**
 * Spaja ono što konektor UME (iz koda) sa onim što je UKLJUČENO (iz baze).
 *
 * Spisak sposobnosti dolazi iz koda i samo iz koda. Baza kaže koje su od njih
 * uključene — ne može da doda sposobnost koja ne postoji, niti da promeni
 * njen režim ili traženu permisiju.
 */
export async function listCapabilityState(
  db: Db,
  organizationId: string,
  integrationId: string,
  declared: readonly {
    key: string
    mode: 'read' | 'prepare' | 'execute'
    requiredPermission: string
    classification: string
  }[],
): Promise<Result<CapabilityState[]>> {
  const { data, error } = await db
    .from('integration_capabilities')
    .select('capability_key, mode, required_permission, enabled')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(capabilityRow).safeParse(data)
  if (!rows.success) {
    return err(domainError('internal', 'error.internal', { detail: rows.error.message }))
  }

  const stored = new Map(rows.data.map((r) => [r.capability_key, r]))

  const fromCode: CapabilityState[] = declared.map((d) => ({
    capabilityKey: d.key,
    // Režim i permisija se čitaju iz deklaracije, ne iz reda u bazi. Red koji
    // se razišao sa kodom ne sme da prikaže blaži uslov nego što runner
    // stvarno primenjuje.
    mode: d.mode,
    requiredPermission: d.requiredPermission,
    classification: d.classification,
    enabled: stored.get(d.key)?.enabled ?? false,
    declared: true,
  }))

  const declaredKeys = new Set(declared.map((d) => d.key))
  const orphans: CapabilityState[] = rows.data
    .filter((r) => !declaredKeys.has(r.capability_key))
    .map((r) => ({
      capabilityKey: r.capability_key,
      mode: r.mode,
      requiredPermission: r.required_permission,
      classification: null,
      enabled: r.enabled,
      declared: false,
    }))

  return ok([...fromCode, ...orphans])
}

/**
 * Uključuje ili isključuje jednu sposobnost.
 *
 * Poziv prima samo ključ i željeno stanje. Režim i tražena permisija se uzimaju
 * iz deklaracije sposobnosti u kodu, koju pozivalac prosleđuje pošto ju je
 * pronašao u registru konektora — nikad iz forme. Bez toga bi izmenjen zahtev
 * mogao da upiše `required_permission: 'view_dashboard'` za EXECUTE sposobnost
 * i time spusti prag za pozivanje.
 *
 * Isključivanje je dozvoljeno i za sposobnost koje više nema u kodu, jer je to
 * jedini način da se takav red ugasi.
 */
export async function setCapabilityEnabled(
  db: Db,
  input: {
    organizationId: string
    integrationId: string
    capabilityKey: string
    enabled: boolean
    /** Iz deklaracije u kodu. Izostaje samo kada se gasi sposobnost koje nema. */
    descriptor?: { mode: 'read' | 'prepare' | 'execute'; requiredPermission: string }
    changedBy: string
  },
): Promise<Result<true>> {
  if (input.enabled && !input.descriptor) {
    // Uključivanje sposobnosti koju kod ne poznaje bi napravilo red koji
    // runner ionako odbija — a u konzoli bi izgledao kao da radi.
    return err(domainError('invalid_input', 'integrations.error.capabilityUnknown'))
  }

  if (!input.enabled) {
    const { error } = await db
      .from('integration_capabilities')
      .update({ enabled: false, enabled_by: null, enabled_at: null })
      .eq('organization_id', input.organizationId)
      .eq('integration_id', input.integrationId)
      .eq('capability_key', input.capabilityKey)

    return error
      ? err(domainError('internal', 'error.internal', { detail: error.message }))
      : ok(true)
  }

  const descriptor = input.descriptor
  if (!descriptor) return err(domainError('invalid_input', 'integrations.error.capabilityUnknown'))

  const { error } = await db.from('integration_capabilities').upsert(
    {
      organization_id: input.organizationId,
      integration_id: input.integrationId,
      capability_key: input.capabilityKey,
      enabled: true,
      mode: descriptor.mode,
      required_permission: descriptor.requiredPermission,
      enabled_by: input.changedBy,
      enabled_at: new Date().toISOString(),
    },
    { onConflict: 'integration_id,capability_key' },
  )

  return error
    ? err(domainError('internal', 'error.internal', { detail: error.message }))
    : ok(true)
}

// ---------------------------------------------------------------------------
// Istorija provera veze
// ---------------------------------------------------------------------------

const healthCheckRow = z.object({
  id: uuid(),
  checked_at: z.string(),
  ok: z.boolean(),
  latency_ms: z.number().int().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
})

export type HealthCheck = z.infer<typeof healthCheckRow>

/**
 * Poslednje provere veze, najnovija prva.
 *
 * Postoji zato što jedan trenutni status ne razlikuje integraciju koja je
 * pala prvi put od one koja pada svaki drugi put. Prva se čeka, druga se
 * popravlja — a bez istorije oba slučaja izgledaju isto.
 *
 * `error_message` je već redaktovana pri upisu; ovde se ne dodaje ništa.
 */
export async function listHealthChecks(
  db: Db,
  organizationId: string,
  integrationId: string,
  limit = 10,
): Promise<Result<HealthCheck[]>> {
  const { data, error } = await db
    .from('integration_health_checks')
    .select('id, checked_at, ok, latency_ms, error_code, error_message')
    .eq('organization_id', organizationId)
    .eq('integration_id', integrationId)
    .order('checked_at', { ascending: false })
    .limit(limit)

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(healthCheckRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}
