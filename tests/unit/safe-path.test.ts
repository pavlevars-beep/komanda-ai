import { describe, expect, it } from 'vitest'
import { safeInternalPath } from '@/core/shared/safe-path'

describe('provera odredišta preusmeravanja', () => {
  it('prihvata putanju unutar aplikacije', () => {
    expect(safeInternalPath('/w/demo-distribucija')).toBe('/w/demo-distribucija')
    expect(safeInternalPath('/console')).toBe('/console')
    expect(safeInternalPath('/')).toBe('/')
  })

  it('odbija apsolutne adrese', () => {
    expect(safeInternalPath('https://zlonamerni.rs')).toBe('/')
    expect(safeInternalPath('http://zlonamerni.rs')).toBe('/')
    expect(safeInternalPath('javascript:alert(1)')).toBe('/')
  })

  it('odbija adrese bez šeme koje vode na drugi host', () => {
    expect(safeInternalPath('//zlonamerni.rs')).toBe('/')
    expect(safeInternalPath('/\\zlonamerni.rs')).toBe('/')
    expect(safeInternalPath('/\\/zlonamerni.rs')).toBe('/')
  })

  it('odbija ubacivanje novog reda i upitne parametre', () => {
    expect(safeInternalPath('/console\nLocation: https://zlo.rs')).toBe('/')
    expect(safeInternalPath('/console?next=https://zlo.rs')).toBe('/')
    expect(safeInternalPath('/console#fragment')).toBe('/')
  })

  it('vraća zadati podrazumevani put kada vrednost nedostaje', () => {
    expect(safeInternalPath(null, '/console')).toBe('/console')
    expect(safeInternalPath(undefined)).toBe('/')
    expect(safeInternalPath('')).toBe('/')
  })
})
