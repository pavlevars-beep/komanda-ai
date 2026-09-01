import { describe, expect, it } from 'vitest'
import { inspect } from 'node:util'
import { isSecret, maskValue, secret } from '@/core/secrets/secret'

describe('tip Secret', () => {
  const s = secret('sk-abcdefghijklmnop4f2a')

  it('ne otkriva vrednost kroz JSON.stringify', () => {
    expect(JSON.stringify({ apiKey: s })).toBe('{"apiKey":"[REDACTED]"}')
    expect(JSON.stringify(s)).toBe('"[REDACTED]"')
  })

  it('ne otkriva vrednost kroz spajanje sa stringom', () => {
    expect(`ključ: ${String(s)}`).toBe('ključ: [REDACTED]')
    expect(s.toString()).toBe('[REDACTED]')
  })

  it('ne otkriva vrednost kroz inspekciju u Node-u', () => {
    // console.log ide kroz util.inspect; bez ovoga bi ispisao ceo objekat.
    expect(inspect(s)).toBe('[REDACTED]')
    expect(inspect({ credential: s })).toContain('[REDACTED]')
    expect(inspect({ credential: s })).not.toContain('abcdefghij')
  })

  it('vrednost daje samo na izričit poziv', () => {
    expect(s.reveal()).toBe('sk-abcdefghijklmnop4f2a')
  })

  it('naznaka prepoznaje kredencijal ali ne otkriva ga', () => {
    expect(s.hint()).toBe('sk-••••4f2a')
    expect(s.hint()).not.toContain('abcdefghij')
  })

  it('kratke vrednosti se ne naziru uopšte', () => {
    expect(maskValue('kratko')).toBe('••••')
    expect(secret('1234').hint()).toBe('••••')
  })

  it('objekat se ne može izmeniti nizvodno', () => {
    expect(Object.isFrozen(s)).toBe(true)
  })

  it('prepoznaje se kao tajna', () => {
    expect(isSecret(s)).toBe(true)
    expect(isSecret('sk-nesto')).toBe(false)
    expect(isSecret(null)).toBe(false)
  })
})
