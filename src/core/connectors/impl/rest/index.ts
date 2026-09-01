import { z } from 'zod'
import type {
  CapabilityDescriptor,
  CapabilityResult,
  Connector,
  ConnectorContext,
  HealthResult,
} from '../../types'
import { err, ok, domainError, type Result } from '../../../shared/result'
import { guardUrl } from '../../ssrf'
import {
  inputSchemaFor,
  outputSchemaFor,
  readPath,
  restConfig,
  type RestCapability,
  type RestConfig,
} from './config'

/**
 * REST konektor.
 *
 * Poziva samo unapred deklarisane krajnje tačke, samo metodom GET, samo prema
 * hostovima sa allowlist-a. Putanja je deo definicije sposobnosti, ne argument
 * poziva — model bira KOJU sposobnost, nikad KOJU adresu.
 *
 * Odlazna adresa se proverava pri SVAKOM pozivu, ne samo pri snimanju
 * konfiguracije: DNS zapis se između ta dva trenutka može promeniti.
 */

function parseConfig(ctx: Omit<ConnectorContext, 'signal'>): RestConfig | null {
  const parsed = restConfig.safeParse(ctx.config)
  return parsed.success ? parsed.data : null
}

function descriptorFor(capability: RestCapability): CapabilityDescriptor {
  return {
    key: capability.key,
    mode: 'read',
    requiredPermission: capability.requiredPermission,
    classification: capability.classification,
    inputSchema: inputSchemaFor(capability),
    outputSchema: outputSchemaFor(capability),
    ...(capability.freshnessSlaSeconds !== undefined
      ? { freshnessSlaSeconds: capability.freshnessSlaSeconds }
      : {}),
  }
}

/**
 * Pretvaranje vrednosti iz odgovora u deklarisani tip.
 *
 * Objekat ili niz na mestu gde je deklarisan tekst NE postaje `[object Object]`
 * nego `null`. Razlika je važna: prazna vrednost pukne na šemi izlaza i vidi
 * se kao greška, dok bi `[object Object]` prošao i završio u izveštaju kao da
 * je podatak.
 */
function coerceField(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null

  if (type === 'number') {
    const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
    return Number.isFinite(n) ? n : null
  }

  if (type === 'boolean') {
    return typeof value === 'boolean' ? value : null
  }

  // Tekst i datum: prihvata se samo prosta vrednost.
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  return null
}

function mapRow(source: unknown, capability: RestCapability): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const field of capability.fields) {
    row[field.name] = coerceField(readPath(source, field.path), field.type)
  }
  return row
}

async function callEndpoint(
  config: RestConfig,
  capability: RestCapability,
  params: Record<string, unknown>,
  ctx: ConnectorContext,
): Promise<Result<unknown>> {
  // Bazna adresa i putanja se spajaju ovde; putanja nikad ne dolazi iz poziva.
  let target: URL
  try {
    target = new URL(capability.path.replace(/^\//, ''), `${config.baseUrl.replace(/\/$/, '')}/`)
  } catch {
    return err(domainError('invalid_input', 'connector.error.invalidUrl'))
  }

  // Parametri su već prošli kroz šemu sposobnosti, pa su prosti tipovi.
  // Sve što to nije se izostavlja umesto da se pretvori u besmislen tekst.
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') target.searchParams.set(key, value)
    else if (typeof value === 'number' || typeof value === 'boolean') {
      target.searchParams.set(key, String(value))
    }
  }

  // U produkciji se traži https; u sandbox-u se dozvoljava http radi razvoja.
  const guarded = guardUrl(target.toString(), {
    allowedHosts: config.allowedHosts,
    allowInsecure: ctx.environment === 'sandbox',
  })
  if (!guarded.ok) return guarded

  const headers: Record<string, string> = { Accept: 'application/json' }

  if (config.authType !== 'none') {
    const credential = await ctx.secret()
    if (!credential) {
      return err(domainError('integration_unavailable', 'connector.error.missingCredential'))
    }

    // Tajna se otkriva na jednom mestu, neposredno pre slanja, i ne upisuje se
    // ni u jednu promenljivu koja bi mogla da završi u logu.
    if (config.authType === 'bearer') headers.Authorization = `Bearer ${credential.reveal()}`
    else if (config.authType === 'basic') headers.Authorization = `Basic ${credential.reveal()}`
    else headers[config.apiKeyHeader] = credential.reveal()
  }

  const response = await fetch(guarded.value, {
    method: 'GET',
    headers,
    signal: ctx.signal,
    // Preusmeravanje bi zaobišlo proveru odredišta — odgovor sa 3xx se odbija.
    redirect: 'manual',
  })

  if (response.status >= 300 && response.status < 400) {
    return err(domainError('forbidden', 'connector.error.redirectBlocked'))
  }
  if (response.status === 401 || response.status === 403) {
    return err(domainError('integration_unavailable', 'connector.error.authFailed'))
  }
  if (!response.ok) {
    return err(
      domainError('integration_unavailable', 'connector.error.upstream', {
        detail: `HTTP ${response.status}`,
      }),
    )
  }

  try {
    return ok(await response.json())
  } catch {
    return err(domainError('integration_unavailable', 'connector.error.invalidOutput'))
  }
}

export const restConnector: Connector = {
  type: 'rest',

  // Bez konfiguracije REST konektor ne ume ništa — sposobnosti dolaze iz
  // definicija koje Delta Pro unese za konkretnu integraciju.
  getCapabilities: () => [],

  getConfiguredCapabilities(ctx) {
    const config = parseConfig(ctx)
    return config ? config.capabilities.map(descriptorFor) : []
  },

  async testConnection(ctx: ConnectorContext): Promise<HealthResult> {
    const started = Date.now()
    const config = parseConfig(ctx)

    if (!config) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: 'invalid_config',
        errorMessage: 'Konfiguracija integracije nije ispravna.',
      }
    }

    const guarded = guardUrl(config.baseUrl, {
      allowedHosts: config.allowedHosts,
      allowInsecure: ctx.environment === 'sandbox',
    })
    if (!guarded.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: 'blocked_destination',
        errorMessage: 'Adresa nije dozvoljena za ovu integraciju.',
      }
    }

    // Prva deklarisana sposobnost služi kao provera; ako ih nema, proverava se
    // samo da je adresa ispravna i dozvoljena.
    const probe = config.capabilities[0]
    if (!probe) {
      return {
        ok: true,
        latencyMs: Date.now() - started,
        errorMessage: 'Adresa je ispravna. Nijedna sposobnost još nije definisana.',
      }
    }

    const result = await callEndpoint(config, probe, {}, ctx)

    return result.ok
      ? { ok: true, latencyMs: Date.now() - started }
      : {
          ok: false,
          latencyMs: Date.now() - started,
          errorCode: result.error.code,
          // Ključ poruke, ne sadržaj greške — detalj ostaje u logu.
          errorMessage: result.error.key,
        }
  },

  async invoke(
    capabilityKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<CapabilityResult>> {
    const config = parseConfig(ctx)
    if (!config) return err(domainError('internal', 'connector.error.invalidConfig'))

    const capability = config.capabilities.find((c) => c.key === capabilityKey)
    if (!capability) return err(domainError('not_found', 'connector.error.unknownCapability'))

    const params = z.record(z.string(), z.unknown()).catch({}).parse(input)
    const response = await callEndpoint(config, capability, params, ctx)
    if (!response.ok) return response

    const rows = capability.rowsPath ? readPath(response.value, capability.rowsPath) : null

    const data = capability.rowsPath
      ? { items: (Array.isArray(rows) ? rows : []).map((r) => mapRow(r, capability)) }
      : mapRow(response.value, capability)

    return ok({
      data,
      provenance: {
        classification: capability.classification,
        sources: [
          {
            label: typeof ctx.config.label === 'string' ? ctx.config.label : 'REST API',
            integrationId: ctx.integrationId,
            capabilityKey,
            isDemo: ctx.isDemo,
          },
        ],
        freshness: {
          asOf: new Date().toISOString(),
          ...(capability.freshnessSlaSeconds !== undefined
            ? { slaSeconds: capability.freshnessSlaSeconds }
            : {}),
        },
      },
      ...(capability.rowsPath && Array.isArray(rows) ? { rowCount: rows.length } : {}),
    })
  },
}
