import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runCapability, runHealthCheck, type EnabledCapability } from '@/core/connectors/runner'
import type { Connector, ConnectorContext } from '@/core/connectors/types'
import { demoConnector } from '@/core/connectors/impl/demo'
import { ok } from '@/core/shared/result'

const BASE_CTX: Omit<ConnectorContext, 'signal'> = {
  organizationId: '00000000-0000-0000-0000-00000000d002',
  integrationId: '00000000-0000-0000-0000-00000000e001',
  userId: '00000000-0000-0000-0000-0000000000b1',
  permissions: ['view_sales', 'view_financial_data', 'view_inventory'],
  requestId: 'test-1',
  environment: 'sandbox',
  isDemo: true,
  config: { dataset: 'distribution' },
  secret: () => Promise.resolve(null),
}

const ENABLED: EnabledCapability[] = [
  { capabilityKey: 'get_daily_sales', mode: 'read', requiredPermission: 'view_sales' },
  {
    capabilityKey: 'get_outstanding_invoices',
    mode: 'read',
    requiredPermission: 'view_financial_data',
  },
]

describe('runner — šta se propušta', () => {
  it('izvršava uključenu sposobnost za koju korisnik ima permisiju', async () => {
    const r = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: BASE_CTX,
      enabled: ENABLED,
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.provenance.classification).toBe('fact')
      // Demo podatak MORA da bude označen, inače ga UI prikaže kao stvaran.
      expect(r.value.provenance.sources[0]?.isDemo).toBe(true)
      expect(r.value.provenance.freshness?.asOf).toBeTruthy()
    }
  })

  it('daje isti rezultat za isti ulaz', async () => {
    const run = () =>
      runCapability({
        connector: demoConnector,
        capabilityKey: 'get_daily_sales',
        input: { date: '2026-03-16' },
        ctx: BASE_CTX,
        enabled: ENABLED,
      })

    const [a, b] = await Promise.all([run(), run()])
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.value.data).toEqual(b.value.data)
  })

  it('različite organizacije dobijaju različite demo podatke', async () => {
    const other = { ...BASE_CTX, organizationId: '00000000-0000-0000-0000-00000000d003' }
    const a = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: BASE_CTX,
      enabled: ENABLED,
    })
    const b = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: other,
      enabled: ENABLED,
    })

    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(a.value.data).not.toEqual(b.value.data)
  })
})

describe('runner — šta zaustavlja', () => {
  it('odbija sposobnost koja ne postoji', async () => {
    const r = await runCapability({
      connector: demoConnector,
      capabilityKey: 'drop_all_tables',
      input: {},
      ctx: BASE_CTX,
      enabled: ENABLED,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.unknownCapability')
  })

  it('odbija sposobnost koja postoji ali nije uključena za organizaciju', async () => {
    // get_inventory_alerts postoji u konektoru, ali Delta Pro je nije uključila.
    const r = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_inventory_alerts',
      input: {},
      ctx: BASE_CTX,
      enabled: ENABLED,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('capability_disabled')
  })

  it('odbija kada korisnik nema traženu permisiju', async () => {
    const r = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_outstanding_invoices',
      input: { overdueDays: 30 },
      ctx: { ...BASE_CTX, permissions: ['view_sales'] },
      enabled: ENABLED,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('forbidden')
  })

  it('permisiju uzima iz definicije sposobnosti, ne iz konfiguracije', async () => {
    // Pogrešan unos u bazi spušta prag na view_sales; runner ga ignoriše
    // i i dalje traži view_financial_data iz definicije.
    const tampered: EnabledCapability[] = [
      {
        capabilityKey: 'get_outstanding_invoices',
        mode: 'read',
        requiredPermission: 'view_sales',
      },
    ]

    const r = await runCapability({
      connector: demoConnector,
      capabilityKey: 'get_outstanding_invoices',
      input: { overdueDays: 30 },
      ctx: { ...BASE_CTX, permissions: ['view_sales'] },
      enabled: tampered,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('forbidden')
  })

  it('odbija ulaz koji ne odgovara šemi', async () => {
    for (const bad of [{ date: 'juče' }, { date: '16.03.2026' }, {}, { date: '2026-13-45' }]) {
      const r = await runCapability({
        connector: demoConnector,
        capabilityKey: 'get_daily_sales',
        input: bad,
        ctx: BASE_CTX,
        enabled: ENABLED,
      })
      expect(r.ok, JSON.stringify(bad)).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('invalid_input')
    }
  })

  it('odbija EXECUTE sposobnost bez odobrenja', async () => {
    const executeConnector: Connector = {
      type: 'webhook',
      getCapabilities: () => [
        {
          key: 'send_email',
          mode: 'execute',
          requiredPermission: 'execute_actions',
          classification: 'fact',
          inputSchema: z.object({ to: z.string() }),
          outputSchema: z.object({ sent: z.boolean() }),
        },
      ],
      testConnection: () => Promise.resolve({ ok: true, latencyMs: 1 }),
      invoke: () =>
        Promise.resolve(
          ok({
            data: { sent: true },
            provenance: { classification: 'fact' as const, sources: [] },
          }),
        ),
    }

    const r = await runCapability({
      connector: executeConnector,
      capabilityKey: 'send_email',
      input: { to: 'kupac@primer.rs' },
      ctx: { ...BASE_CTX, permissions: ['execute_actions'] },
      enabled: [
        { capabilityKey: 'send_email', mode: 'execute', requiredPermission: 'execute_actions' },
      ],
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('approval_required')
  })

  it('odbija izlaz koji ne odgovara šemi', async () => {
    // Spoljni sistem promeni oblik odgovora bez najave.
    const brokenConnector: Connector = {
      type: 'rest',
      getCapabilities: () => [
        {
          key: 'get_total',
          mode: 'read',
          requiredPermission: 'view_sales',
          classification: 'fact',
          inputSchema: z.object({}),
          outputSchema: z.object({ total: z.string() }),
        },
      ],
      testConnection: () => Promise.resolve({ ok: true, latencyMs: 1 }),
      invoke: () =>
        Promise.resolve(
          ok({
            data: { totalAmount: 123 },
            provenance: { classification: 'fact' as const, sources: [] },
          }),
        ),
    }

    const r = await runCapability({
      connector: brokenConnector,
      capabilityKey: 'get_total',
      input: {},
      ctx: BASE_CTX,
      enabled: [{ capabilityKey: 'get_total', mode: 'read', requiredPermission: 'view_sales' }],
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.invalidOutput')
  })

  it('ne propušta detalj greške u ključu poruke', async () => {
    const leakyConnector: Connector = {
      type: 'rest',
      getCapabilities: () => [
        {
          key: 'get_total',
          mode: 'read',
          requiredPermission: 'view_sales',
          classification: 'fact',
          inputSchema: z.object({}),
          outputSchema: z.object({ total: z.string() }),
        },
      ],
      testConnection: () => Promise.resolve({ ok: true, latencyMs: 1 }),
      invoke: () => {
        throw new Error('connect ECONNREFUSED postgres://admin:tajna@10.0.0.5:5432/erp')
      },
    }

    const r = await runCapability({
      connector: leakyConnector,
      capabilityKey: 'get_total',
      input: {},
      ctx: BASE_CTX,
      enabled: [{ capabilityKey: 'get_total', mode: 'read', requiredPermission: 'view_sales' }],
    })

    expect(r.ok).toBe(false)
    if (!r.ok) {
      // Ključ poruke ide korisniku i ne sme da nosi ništa iz izuzetka.
      expect(r.error.key).toBe('connector.error.upstream')
      expect(r.error.key).not.toContain('tajna')
      expect(r.error.key).not.toContain('10.0.0.5')
    }
  })

  it('prekida konektor koji visi', async () => {
    const hangingConnector: Connector = {
      type: 'rest',
      getCapabilities: () => [
        {
          key: 'slow',
          mode: 'read',
          requiredPermission: 'view_sales',
          classification: 'fact',
          inputSchema: z.object({}),
          outputSchema: z.object({}),
        },
      ],
      testConnection: () => Promise.resolve({ ok: true, latencyMs: 1 }),
      invoke: (_k, _i, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            const error = new Error('prekinuto')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    }

    const r = await runCapability({
      connector: hangingConnector,
      capabilityKey: 'slow',
      input: {},
      ctx: BASE_CTX,
      enabled: [{ capabilityKey: 'slow', mode: 'read', requiredPermission: 'view_sales' }],
      timeoutMs: 50,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.timeout')
  })
})

describe('runner — provera veze', () => {
  it('vraća zdravlje umesto da baci izuzetak', async () => {
    const throwing: Connector = {
      type: 'rest',
      getCapabilities: () => [],
      testConnection: () => {
        throw new Error('getaddrinfo ENOTFOUND https://tajni-erp.klijent.rs?token=abc123')
      },
      invoke: () => Promise.reject(new Error('nedostupno')),
    }

    const health = await runHealthCheck(throwing, BASE_CTX)

    expect(health.ok).toBe(false)
    expect(health.errorCode).toBe('unreachable')
    // Poruka ide u UI i u zapis zdravlja — ne sme da nosi adresu ni token.
    expect(health.errorMessage).not.toContain('token')
    expect(health.errorMessage).not.toContain('klijent.rs')
  })

  it('demo konektor prijavljuje ispravnu konfiguraciju', async () => {
    const health = await runHealthCheck(demoConnector, BASE_CTX)
    expect(health.ok).toBe(true)
  })

  it('demo konektor prijavljuje nepoznat skup podataka', async () => {
    const health = await runHealthCheck(demoConnector, {
      ...BASE_CTX,
      config: { dataset: 'nepostojeci' },
    })
    expect(health.ok).toBe(false)
    expect(health.errorCode).toBe('invalid_config')
  })
})
