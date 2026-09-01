import { z } from 'zod'
import type {
  ActionResult,
  CapabilityDescriptor,
  CapabilityResult,
  Connector,
  ConnectorContext,
  HealthResult,
} from '../../types'
import { err, ok, domainError, type Result } from '../../../shared/result'
import { guardUrl } from '../../ssrf'

/**
 * Webhook konektor — jedini koji izvršava akcije.
 *
 * Šalje potpisan POST na unapred podešenu adresu (najčešće n8n, koji dalje
 * priča sa e-poštom, CRM-om ili ERP-om). Klijent za n8n ne zna i ne treba da
 * zna — on vidi samo predlog akcije i dugme „Odobri".
 *
 * Sve sposobnosti su u režimu `execute`, pa ih runner odbija bez odobrenja.
 * Ta provera je u runneru, a ne ovde: da bi važila i kada se sutra doda novi
 * konektor koji izvršava akcije.
 */

export const webhookConfig = z.object({
  url: z.string().url(),
  allowedHosts: z.array(z.string().min(1).max(253)).max(5).default([]),
  /** Nazivi akcija koje ova integracija prima. */
  actions: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/),
        label: z.string().max(80),
      }),
    )
    .max(20)
    .default([]),
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),
})

export type WebhookConfig = z.infer<typeof webhookConfig>

const actionPayload = z.object({
  /** Sadržaj akcije; oblik zavisi od vrste i validira ga tok odobrenja. */
  payload: z.record(z.string(), z.unknown()),
  approvalId: z.string().uuid(),
})

function parseConfig(ctx: Omit<ConnectorContext, 'signal'>): WebhookConfig | null {
  const parsed = webhookConfig.safeParse(ctx.config)
  return parsed.success ? parsed.data : null
}

/**
 * HMAC potpis tela zahteva.
 *
 * Bez potpisa bi svako ko sazna adresu mogao da pokrene akciju u sistemu
 * klijenta. Vremenska oznaka ulazi u potpis da se snimljen zahtev ne bi mogao
 * ponoviti kasnije.
 */
async function sign(body: string, timestamp: string, key: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${timestamp}.${body}`))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const webhookConnector: Connector = {
  type: 'webhook',

  getCapabilities: () => [],

  getConfiguredCapabilities(ctx): readonly CapabilityDescriptor[] {
    const config = parseConfig(ctx)
    if (!config) return []

    return config.actions.map((action) => ({
      key: action.key,
      mode: 'execute' as const,
      requiredPermission: 'execute_actions' as const,
      classification: 'fact' as const,
      inputSchema: actionPayload,
      outputSchema: z.object({ accepted: z.boolean(), reference: z.string().nullable() }),
    }))
  },

  testConnection(ctx: ConnectorContext): Promise<HealthResult> {
    const started = Date.now()
    const config = parseConfig(ctx)

    if (!config) {
      return Promise.resolve({
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: 'invalid_config',
        errorMessage: 'Konfiguracija integracije nije ispravna.',
      })
    }

    // Webhook se NE poziva radi provere: poziv bi mogao da pokrene stvarnu
    // akciju u sistemu klijenta. Proverava se samo da je adresa dozvoljena.
    const guarded = guardUrl(config.url, {
      allowedHosts: config.allowedHosts,
      allowInsecure: ctx.environment === 'sandbox',
    })

    return Promise.resolve(
      guarded.ok
        ? {
            ok: true,
            latencyMs: Date.now() - started,
            errorMessage: 'Adresa je dozvoljena. Webhook se ne poziva radi provere.',
          }
        : {
            ok: false,
            latencyMs: Date.now() - started,
            errorCode: 'blocked_destination',
            errorMessage: 'Adresa nije dozvoljena za ovu integraciju.',
          },
    )
  },

  /**
   * READ nad webhook konektorom ne postoji. Metod je deo interfejsa, pa vraća
   * jasnu grešku umesto da ćuti ili da se pretvara da je nešto pročitao.
   */
  invoke(): Promise<Result<CapabilityResult>> {
    return Promise.resolve(err(domainError('not_found', 'connector.error.readNotSupported')))
  },

  async execute(
    actionKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<ActionResult>> {
    const config = parseConfig(ctx)
    if (!config) return err(domainError('internal', 'connector.error.invalidConfig'))

    if (!config.actions.some((a) => a.key === actionKey)) {
      return err(domainError('not_found', 'connector.error.unknownCapability'))
    }

    const parsed = actionPayload.safeParse(input)
    if (!parsed.success) return err(domainError('invalid_input', 'connector.error.invalidInput'))

    const guarded = guardUrl(config.url, {
      allowedHosts: config.allowedHosts,
      allowInsecure: ctx.environment === 'sandbox',
    })
    if (!guarded.ok) return guarded

    const credential = await ctx.secret()
    if (!credential) {
      return err(domainError('integration_unavailable', 'connector.error.missingCredential'))
    }

    const timestamp = String(Date.now())
    const body = JSON.stringify({
      action: actionKey,
      organizationId: ctx.organizationId,
      // Ključ idempotencije: primalac po njemu prepoznaje ponovljen zahtev i
      // ne izvršava akciju dvaput.
      approvalId: parsed.data.approvalId,
      requestId: ctx.requestId,
      payload: parsed.data.payload,
    })

    const response = await fetch(guarded.value, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-komanda-timestamp': timestamp,
        'x-komanda-signature': await sign(body, timestamp, credential.reveal()),
        'x-komanda-idempotency-key': parsed.data.approvalId,
      },
      body,
      signal: ctx.signal,
      redirect: 'manual',
    })

    if (response.status >= 300 && response.status < 400) {
      return err(domainError('forbidden', 'connector.error.redirectBlocked'))
    }
    if (!response.ok) {
      return err(
        domainError('integration_unavailable', 'connector.error.upstream', {
          detail: `HTTP ${response.status}`,
        }),
      )
    }

    const reference = response.headers.get('x-execution-id')

    return ok({
      summary: `Akcija "${actionKey}" je prosleđena.`,
      ...(reference ? { externalId: reference } : {}),
    })
  },
}
