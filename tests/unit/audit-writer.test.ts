import { describe, expect, it, vi } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'x'.repeat(40)

const { writeAudit } = await import('@/core/audit/writer')

/** Minimalni dvojnik: hvata argumente poziva rpc. */
function fakeDb() {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  return {
    calls,
    db: {
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return Promise.resolve({ data: null, error: null })
      }),
    },
  }
}

describe('upis revizionog traga', () => {
  it('nikad ne upisuje tajne u metapodatke', async () => {
    const { db, calls } = fakeDb()

    await writeAudit(db as never, {
      action: 'integration.credentials_rotated',
      status: 'success',
      actorType: 'staff',
      requestId: 'req-1',
      organizationId: '00000000-0000-0000-0000-00000000d002',
      metadata: {
        integrationName: 'Tim ERP',
        api_key: 'sk-tajna-vrednost',
        password: 'lozinka',
        vault_secret_id: 'abc-123',
        client_secret: 'xyz',
      },
    })

    const meta = calls[0]?.args.p_metadata as Record<string, unknown>
    expect(meta.integrationName).toBe('Tim ERP')
    expect(meta.api_key).toBe('[REDACTED]')
    expect(meta.password).toBe('[REDACTED]')
    expect(meta.vault_secret_id).toBe('[REDACTED]')
    expect(meta.client_secret).toBe('[REDACTED]')
  })

  it('ne prepisuje ugnežene strukture u reviziju', async () => {
    const { db, calls } = fakeDb()

    await writeAudit(db as never, {
      action: 'approval.approved',
      status: 'success',
      actorType: 'user',
      requestId: 'req-2',
      metadata: {
        payload: { to: 'kupac@primer.rs', body: 'pun tekst poruke' },
        recipients: ['a@primer.rs', 'b@primer.rs'],
      },
    })

    const meta = calls[0]?.args.p_metadata as Record<string, unknown>
    expect(meta.payload).toBe('[objekat]')
    expect(meta.recipients).toBe('[niz: 2]')
  })

  it('ne šalje identitet aktera — njega popunjava baza', async () => {
    const { db, calls } = fakeDb()

    await writeAudit(db as never, {
      action: 'workspace.opened',
      status: 'success',
      actorType: 'user',
      requestId: 'req-3',
    })

    const args = calls[0]?.args ?? {}
    expect(Object.keys(args)).not.toContain('p_actor_user_id')
    expect(Object.keys(args)).not.toContain('p_impersonation_session_id')
  })

  it('neuspeh upisa se ne pretvara u izuzetak', async () => {
    const db = {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'baza nedostupna' } })),
    }

    // Korisnička radnja koja je već izvršena ne sme da izgleda kao neuspela
    // zato što log nije mogao da se upiše.
    await expect(
      writeAudit(db as never, {
        action: 'workspace.opened',
        status: 'success',
        actorType: 'user',
        requestId: 'req-4',
      }),
    ).resolves.toBe(false)
  })
})
