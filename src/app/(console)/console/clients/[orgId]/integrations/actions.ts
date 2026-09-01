'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { uuid } from '@/core/shared/uuid'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { vaultSecretsProvider } from '@/server/secrets/vault-provider'
import { getConnector, initialiseConnectors } from '@/core/connectors'
import { runHealthCheck } from '@/core/connectors/runner'
import {
  createIntegration,
  createIntegrationInput,
  getIntegration,
  recordHealthCheck,
} from '@/core/integrations/repository'

export interface IntegrationState extends ActionResultBase {
  readonly tested?: {
    readonly ok: boolean
    readonly latencyMs: number
    readonly message?: string
  }
  readonly credentialSaved?: boolean
  readonly fieldErrors?: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Kreiranje integracije
// ---------------------------------------------------------------------------

export const createIntegrationAction = consoleAction<IntegrationState>(
  { rateLimit: 'write', audit: 'integration.created' },
  async ({ db, user }, _prev, formData) => {
    initialiseConnectors()

    const connectorTypeKey = formString(formData, 'connectorTypeKey') ?? ''

    // Konektor koji nije registrovan u kodu ne može da se izabere, ma šta
    // pisalo u katalogu. Katalog je spisak namera; registar je spisak onoga
    // što stvarno radi.
    if (!getConnector(connectorTypeKey)) {
      return { error: 'integrations.error.notImplemented' }
    }

    const parsed = createIntegrationInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      connectorTypeKey,
      name: formString(formData, 'name'),
      environment: formString(formData, 'environment') ?? 'sandbox',
      authType: formString(formData, 'authType') ?? 'none',
      config: parseConfig(formString(formData, 'config')),
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    const created = await createIntegration(db, parsed.data, user.id)
    if (!created.ok) return { error: created.error.key }

    revalidatePath(`/console/clients/${parsed.data.organizationId}/integrations`)
    redirect(
      `/console/clients/${parsed.data.organizationId}/integrations/${created.value}` as Route,
    )
  },
)

/** Konfiguracija stiže kao JSON iz forme; neispravan unos ne ruši akciju. */
function parseConfig(raw: string | undefined): Record<string, unknown> {
  if (!raw || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Provera veze
// ---------------------------------------------------------------------------

const targetInput = z.object({
  organizationId: uuid(),
  integrationId: uuid(),
})

/**
 * Test veze.
 *
 * Status integracije se izvodi iz ISHODA provere, ne iz namere korisnika —
 * zato u UI-ju i ne postoji dugme „označi kao povezano". Svaki pokušaj se
 * beleži u istoriju zdravlja, i uspešan i neuspešan.
 */
export const testConnectionAction = consoleAction<IntegrationState>(
  { rateLimit: 'connector_test', audit: 'integration.tested' },
  async ({ db, user, requestId }, _prev, formData) => {
    initialiseConnectors()

    const parsed = targetInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      integrationId: formString(formData, 'integrationId'),
    })
    if (!parsed.success) return { error: 'error.invalid_input' }

    // Učitavanje ide korisničkim klijentom, pa RLS potvrđuje da konsultant
    // sme da dira baš ovu integraciju.
    const integration = await getIntegration(
      db,
      parsed.data.organizationId,
      parsed.data.integrationId,
    )
    if (!integration.ok) return { error: integration.error.key }

    const connector = getConnector(integration.value.connector_type_key)
    if (!connector) return { error: 'integrations.error.notImplemented' }

    const secrets = vaultSecretsProvider()

    const health = await runHealthCheck(connector, {
      organizationId: integration.value.organization_id,
      integrationId: integration.value.id,
      userId: user.id,
      // Provera veze je konfiguraciona radnja i ne čita poslovne podatke,
      // pa se ne dodeljuje nijedna permisija nad podacima.
      permissions: [],
      requestId,
      environment: integration.value.environment,
      isDemo: integration.value.is_demo,
      config: integration.value.config,
      // Tajna se dohvata tek ako je konektor zatraži.
      secret: () =>
        secrets.read(integration.value.id, integration.value.organization_id),
    })

    const recorded = await recordHealthCheck(db, {
      organizationId: parsed.data.organizationId,
      integrationId: parsed.data.integrationId,
      ok: health.ok,
      latencyMs: health.latencyMs,
      errorCode: health.errorCode,
      errorMessage: health.errorMessage,
      checkedBy: user.id,
    })
    if (!recorded.ok) return { error: recorded.error.key }

    revalidatePath(
      `/console/clients/${parsed.data.organizationId}/integrations/${parsed.data.integrationId}`,
    )

    return {
      tested: {
        ok: health.ok,
        latencyMs: health.latencyMs,
        ...(health.errorMessage ? { message: health.errorMessage } : {}),
      },
    }
  },
)

// ---------------------------------------------------------------------------
// Kredencijal
// ---------------------------------------------------------------------------

const credentialInput = targetInput.extend({
  value: z.string().min(1, 'integrations.error.credentialRequired').max(4096),
  authType: z.string().min(2).max(40),
})

/**
 * Upis kredencijala.
 *
 * Autorizacija ide korisničkim klijentom kroz RLS; sam upis u Vault ide
 * servisnom rolom, jer je ona jedina koja sme do skladišta tajni. Vrednost
 * postoji samo u ovom pozivu i ne vraća se ni u jednom obliku — jedina
 * operacija nad postojećim kredencijalom je zamena.
 */
export const saveCredentialAction = consoleAction<IntegrationState>(
  { rateLimit: 'write', audit: 'integration.credentials_rotated' },
  async ({ db }, _prev, formData) => {
    const parsed = credentialInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      integrationId: formString(formData, 'integrationId'),
      value: formString(formData, 'value'),
      authType: formString(formData, 'authType') ?? 'api_key',
    })

    if (!parsed.success) {
      return {
        error: 'error.invalid_input',
        fieldErrors: { value: 'integrations.error.credentialRequired' },
      }
    }

    const integration = await getIntegration(
      db,
      parsed.data.organizationId,
      parsed.data.integrationId,
    )
    if (!integration.ok) return { error: integration.error.key }

    try {
      await vaultSecretsProvider().store({
        integrationId: parsed.data.integrationId,
        organizationId: parsed.data.organizationId,
        value: parsed.data.value,
        authType: parsed.data.authType,
      })
    } catch {
      // Poruka iz Vault sloja je već zabeležena; korisnik dobija opšti ishod.
      return { error: 'integrations.error.credentialNotSaved' }
    }

    revalidatePath(
      `/console/clients/${parsed.data.organizationId}/integrations/${parsed.data.integrationId}`,
    )
    return { credentialSaved: true }
  },
)
