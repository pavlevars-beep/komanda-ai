import { describe, expect, it } from 'vitest'
import {
  listCapabilityState,
  listHealthChecks,
  setCapabilityEnabled,
} from '@/core/integrations/repository'
import { declaredCapabilities } from '@/core/integrations/capabilities'
import { demoConnector } from '@/core/connectors/impl/demo'
import type { Integration } from '@/core/integrations/repository'

const ORG = '00000000-0000-0000-0000-00000000d002'
const INTEGRATION = '00000000-0000-0000-0000-00000000e001'
const USER = '00000000-0000-0000-0000-0000000000b1'

const DECLARED = [
  {
    key: 'get_daily_sales',
    mode: 'read' as const,
    requiredPermission: 'view_sales',
    classification: 'fact',
  },
  {
    key: 'create_purchase_order',
    mode: 'execute' as const,
    requiredPermission: 'manage_integrations',
    classification: 'fact',
  },
]

/** Dvojnik baze koji vraća zadate redove i pamti šta je upisano. */
function fakeDb(rows: unknown[]) {
  const writes: { op: 'upsert' | 'update'; payload: Record<string, unknown> }[] = []

  const query = {
    select: () => query,
    eq: () => query,
    upsert: (payload: Record<string, unknown>) => {
      writes.push({ op: 'upsert', payload })
      return Promise.resolve({ error: null })
    },
    update: (payload: Record<string, unknown>) => {
      writes.push({ op: 'update', payload })
      return query
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  }

  return { db: { from: () => query } as never, writes }
}

describe('stanje sposobnosti', () => {
  it('režim i permisiju uzima iz koda, ne iz reda u bazi', async () => {
    // Red u bazi tvrdi da je EXECUTE sposobnost zapravo čitanje sa najnižim
    // pragom. To se dešava kada se kod promeni a stari red ostane.
    const { db } = fakeDb([
      {
        capability_key: 'create_purchase_order',
        mode: 'read',
        required_permission: 'view_dashboard',
        enabled: true,
      },
    ])

    const state = await listCapabilityState(db, ORG, INTEGRATION, DECLARED)
    expect(state.ok).toBe(true)
    if (!state.ok) return

    const row = state.value.find((c) => c.capabilityKey === 'create_purchase_order')
    expect(row?.mode).toBe('execute')
    expect(row?.requiredPermission).toBe('manage_integrations')
    // Sam podatak o uključenosti i dalje dolazi iz baze.
    expect(row?.enabled).toBe(true)
  })

  it('sposobnost bez reda u bazi je isključena', async () => {
    const { db } = fakeDb([])
    const state = await listCapabilityState(db, ORG, INTEGRATION, DECLARED)
    if (!state.ok) throw new Error('očekivan uspeh')

    expect(state.value).toHaveLength(2)
    expect(state.value.every((c) => !c.enabled)).toBe(true)
    expect(state.value.every((c) => c.declared)).toBe(true)
  })

  it('uključen red za sposobnost koje u kodu nema se PRIKAZUJE, ne skriva', async () => {
    const { db } = fakeDb([
      {
        capability_key: 'export_general_ledger',
        mode: 'read',
        required_permission: 'view_financial_data',
        enabled: true,
      },
    ])

    const state = await listCapabilityState(db, ORG, INTEGRATION, DECLARED)
    if (!state.ok) throw new Error('očekivan uspeh')

    const orphan = state.value.find((c) => c.capabilityKey === 'export_general_ledger')
    expect(orphan).toBeDefined()
    expect(orphan?.declared).toBe(false)
    expect(orphan?.enabled).toBe(true)
  })
})

describe('promena stanja sposobnosti', () => {
  it('permisiju upisuje iz deklaracije, ne iz poziva', async () => {
    const { db, writes } = fakeDb([])

    const result = await setCapabilityEnabled(db, {
      organizationId: ORG,
      integrationId: INTEGRATION,
      capabilityKey: 'create_purchase_order',
      enabled: true,
      descriptor: { mode: 'execute', requiredPermission: 'manage_integrations' },
      changedBy: USER,
    })

    expect(result.ok).toBe(true)
    expect(writes[0]?.op).toBe('upsert')
    expect(writes[0]?.payload['required_permission']).toBe('manage_integrations')
    expect(writes[0]?.payload['mode']).toBe('execute')
    expect(writes[0]?.payload['enabled_by']).toBe(USER)
  })

  it('ne dozvoljava uključivanje sposobnosti koju kod ne poznaje', async () => {
    const { db, writes } = fakeDb([])

    const result = await setCapabilityEnabled(db, {
      organizationId: ORG,
      integrationId: INTEGRATION,
      capabilityKey: 'run_arbitrary_sql',
      enabled: true,
      changedBy: USER,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.key).toBe('integrations.error.capabilityUnknown')
    // Ništa nije upisano — red koji runner odbija ne sme ni da nastane.
    expect(writes).toHaveLength(0)
  })

  it('isključivanje radi i za sposobnost koje u kodu nema', async () => {
    const { db, writes } = fakeDb([])

    const result = await setCapabilityEnabled(db, {
      organizationId: ORG,
      integrationId: INTEGRATION,
      capabilityKey: 'export_general_ledger',
      enabled: false,
      changedBy: USER,
    })

    expect(result.ok).toBe(true)
    expect(writes[0]?.op).toBe('update')
    expect(writes[0]?.payload['enabled']).toBe(false)
    expect(writes[0]?.payload['enabled_by']).toBeNull()
  })
})

describe('deklarisane sposobnosti', () => {
  const integration: Integration = {
    id: INTEGRATION,
    organization_id: ORG,
    connector_type_key: 'demo',
    name: 'Demo',
    environment: 'sandbox',
    status: 'connected',
    auth_type: 'none',
    config: {},
    is_read_only: true,
    is_demo: true,
    last_success_at: null,
    last_sync_at: null,
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: new Date().toISOString(),
  }

  it('spisak dolazi iz konektora i poklapa se sa onim što runner poznaje', () => {
    const declared = declaredCapabilities(demoConnector, integration, USER)
    const fromConnector = demoConnector.getCapabilities().map((c) => c.key).sort()

    expect(declared.map((d) => d.key).sort()).toEqual(fromConnector)
    expect(declared.every((d) => d.requiredPermission.length > 0)).toBe(true)
  })

  it('spisak ne zavisi od permisija onoga ko gleda', () => {
    const declared = declaredCapabilities(demoConnector, integration, USER)
    expect(declared.length).toBeGreaterThan(0)
  })
})

describe('istorija provera veze', () => {
  function checkRow(over: Record<string, unknown> = {}) {
    return {
      id: '00000000-0000-0000-0000-0000000000f1',
      checked_at: '2026-09-01T09:00:00.000Z',
      ok: true,
      latency_ms: 142,
      error_code: null,
      error_message: null,
      ...over,
    }
  }

  /** Dvojnik sa lancem koji istorija koristi: order i limit. */
  function historyDb(rows: unknown[]) {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    }
    return { from: () => query } as never
  }

  it('provera bez izmerenog odziva se učitava', async () => {
    // Provera koja padne pre slanja zahteva nema latenciju. To nije greška u
    // podatku i ne sme da obori učitavanje cele istorije.
    const result = await listHealthChecks(
      historyDb([checkRow({ ok: false, latency_ms: null, error_code: 'blocked_destination' })]),
      ORG,
      INTEGRATION,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]?.latency_ms).toBeNull()
    expect(result.value[0]?.error_code).toBe('blocked_destination')
  })

  it('red koji se raziđe sa šemom se odbija, ne prikazuje pogrešno', async () => {
    // Kolona `ok` nedostaje. Bez provere na granici, `undefined` bi se u UI-ju
    // prikazalo kao „neuspešno" — tiho pogrešan podatak umesto greške.
    const { ok: _dropped, ...withoutOk } = checkRow()
    const result = await listHealthChecks(historyDb([withoutOk]), ORG, INTEGRATION)

    expect(result.ok).toBe(false)
  })
})
