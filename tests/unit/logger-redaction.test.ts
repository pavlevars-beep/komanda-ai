import { describe, expect, it } from 'vitest'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'x'.repeat(40)

const { redact } = await import('@/server/logger')

describe('redakcija tajni u logovima', () => {
  it('sakriva vrednost po nazivu ključa', () => {
    const out = redact({ password: 'tajna123', api_key: 'abc', user: 'marko' }) as Record<
      string,
      unknown
    >
    expect(out.password).toBe('[REDACTED]')
    expect(out.api_key).toBe('[REDACTED]')
    expect(out.user).toBe('marko')
  })

  it('sakriva i ugnežene tajne', () => {
    const out = redact({
      integration: { name: 'Tim ERP', config: { connection_string: 'postgres://u:p@h/db' } },
    }) as { integration: { name: string; config: Record<string, unknown> } }
    expect(out.integration.name).toBe('Tim ERP')
    expect(out.integration.config.connection_string).toBe('[REDACTED]')
  })

  it('hvata tajne po obliku i kad naziv ključa nije sumnjiv', () => {
    const out = redact({
      note: 'koristi sk-abcdefghijklmnopqrstuvwxyz012345 za pristup',
      header: 'Bearer eyJhbGciOi.eyJzdWIiOjEyMw.SflKxwRJSMeKKF2QT4',
      dsnInText: 'postgresql://user:pass@host:5432/base',
    }) as Record<string, string>
    expect(out.note).not.toContain('sk-abcdefghij')
    expect(out.header).toContain('[REDACTED]')
    expect(out.dsnInText).toBe('[REDACTED]')
  })

  it('redaktuje poruku greške, ne samo objekte', () => {
    const out = redact(new Error('konekcija pala: postgres://u:p@h/db')) as { message: string }
    expect(out.message).not.toContain('postgres://')
  })

  it('ne ulazi u beskonačnu rekurziju', () => {
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic.self = cyclic
    expect(() => redact(cyclic)).not.toThrow()
  })
})
