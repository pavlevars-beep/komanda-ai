import { describe, expect, it, vi, afterEach } from 'vitest'
import { restConnector } from '@/core/connectors/impl/rest'
import { runCapability } from '@/core/connectors/runner'
import type { ConnectorContext } from '@/core/connectors/types'
import { secret } from '@/core/secrets/secret'

const CAPABILITY = {
  key: 'get_daily_sales',
  method: 'GET' as const,
  path: '/v1/sales/daily',
  requiredPermission: 'view_sales' as const,
  classification: 'fact' as const,
  params: [{ name: 'date', type: 'date' as const, required: true }],
  fields: [
    { name: 'total', path: 'data.total_amount', type: 'string' as const, optional: false },
    { name: 'currency', path: 'data.currency', type: 'string' as const, optional: false },
  ],
}

function ctx(overrides: Partial<Omit<ConnectorContext, 'signal'>> = {}) {
  return {
    organizationId: '00000000-0000-0000-0000-00000000d002',
    integrationId: '00000000-0000-0000-0000-00000000e002',
    userId: '00000000-0000-0000-0000-0000000000b1',
    permissions: ['view_sales' as const],
    requestId: 'test-rest',
    environment: 'production' as const,
    isDemo: false,
    config: {
      baseUrl: 'https://api.klijent.rs',
      allowedHosts: ['api.klijent.rs'],
      authType: 'api_key',
      apiKeyHeader: 'X-API-Key',
      capabilities: [CAPABILITY],
    },
    secret: () => Promise.resolve(secret('tajni-kljuc-1234')),
    ...overrides,
  }
}

const ENABLED = [
  { capabilityKey: 'get_daily_sales', mode: 'read' as const, requiredPermission: 'view_sales' as const },
]

afterEach(() => vi.unstubAllGlobals())

describe('REST konektor — sposobnosti dolaze iz konfiguracije', () => {
  it('prijavljuje sposobnosti deklarisane za integraciju', () => {
    const caps = restConnector.getConfiguredCapabilities?.(ctx()) ?? []
    expect(caps.map((c) => c.key)).toEqual(['get_daily_sales'])
    expect(caps[0]?.requiredPermission).toBe('view_sales')
  })

  it('bez konfiguracije ne ume ništa', () => {
    expect(restConnector.getCapabilities()).toEqual([])
    expect(restConnector.getConfiguredCapabilities?.(ctx({ config: {} }))).toEqual([])
  })
})

describe('REST konektor — odlazni poziv', () => {
  it('poziva deklarisanu putanju i mapira odgovor', async () => {
    const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { total_amount: '24560.00', currency: 'RSD' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.data).toEqual({ total: '24560.00', currency: 'RSD' })

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe('https://api.klijent.rs/v1/sales/daily')
    expect(url.searchParams.get('date')).toBe('2026-03-16')
  })

  it('šalje kredencijal u zaglavlju, a ne u adresi', async () => {
    const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { total_amount: '1', currency: 'RSD' } }), {
          status: 200,
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['X-API-Key']).toBe('tajni-kljuc-1234')
    // Kredencijal u adresi bi završio u logovima posrednika i u istoriji.
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('tajni-kljuc')
  })

  it('odbija nepoznat parametar umesto da ga prosledi', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      // Model pokušava da doda parametar koji definicija ne predviđa.
      input: { date: '2026-03-16', limit: '99999', admin: 'true' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('invalid_input')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ne prati preusmeravanje', async () => {
    // Preusmeravanje bi zaobišlo proveru odredišta i odvelo poziv na petlju.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
        ),
      ),
    )

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.redirectBlocked')
  })

  it('ne poziva host van allowlist-a', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx({
        config: {
          baseUrl: 'https://zlonamerni.rs',
          allowedHosts: ['api.klijent.rs'],
          authType: 'none',
          capabilities: [CAPABILITY],
        },
      }),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ne poziva internu infrastrukturu ni kad je upisana kao bazna adresa', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx({
        environment: 'sandbox',
        config: {
          baseUrl: 'http://169.254.169.254',
          allowedHosts: ['169.254.169.254'],
          authType: 'none',
          capabilities: [CAPABILITY],
        },
      }),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('traži https u produkciji', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx({
        environment: 'production',
        config: {
          baseUrl: 'http://api.klijent.rs',
          allowedHosts: ['api.klijent.rs'],
          authType: 'none',
          capabilities: [CAPABILITY],
        },
      }),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prijavljuje neuspelu autentikaciju kao stanje integracije', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 401 }))))

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.authFailed')
  })

  it('odbija odgovor koji ne odgovara deklarisanim poljima', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ nesto: 'drugo' }), { status: 200 })),
      ),
    )

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    // Polja se mapiraju u null, pa šema izlaza puca — bolje nego proslediti
    // prazne vrednosti u AI sloj kao da su podatak.
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.invalidOutput')
  })

  it('rezultat nosi izvor i vreme na koje se odnosi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { total_amount: '100', currency: 'RSD' } }), {
            status: 200,
          }),
        ),
      ),
    )

    const r = await runCapability({
      connector: restConnector,
      capabilityKey: 'get_daily_sales',
      input: { date: '2026-03-16' },
      ctx: ctx(),
      enabled: ENABLED,
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.provenance.classification).toBe('fact')
      expect(r.value.provenance.sources[0]?.isDemo).toBe(false)
      expect(r.value.provenance.freshness?.asOf).toBeTruthy()
    }
  })
})
