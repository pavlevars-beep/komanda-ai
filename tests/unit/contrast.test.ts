import { describe, expect, it } from 'vitest'
import {
  checkBrandColor,
  contrastRatio,
  deriveBrandPalette,
  parseHex,
} from '@/core/branding/contrast'

describe('kontrast brend boje', () => {
  it('računa poznate odnose kontrasta', () => {
    const white = parseHex('#ffffff')!
    const black = parseHex('#000000')!
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })

  it('odbija neispravan heksadecimalni zapis', () => {
    expect(checkBrandColor('plava').valid).toBe(false)
    expect(checkBrandColor('#12345').valid).toBe(false)
    expect(checkBrandColor('#12345g').valid).toBe(false)
    expect(checkBrandColor('rgb(1,2,3)').reason).toBe('invalid_hex')
  })

  it('koriguje presvetlu boju da bude čitljiva na svetloj podlozi', () => {
    // Neonska žuta je nečitljiva na skoro beloj podlozi.
    const result = deriveBrandPalette({ hex: '#ffff00', scheme: 'light' })
    expect(result).not.toBeNull()
    expect(result!.adjusted).toBe(true)

    const ground = parseHex('#f6f8f8')!
    expect(contrastRatio(parseHex(result!.brand)!, ground)).toBeGreaterThanOrEqual(3)
  })

  it('ostavlja boju koja već prolazi netaknutom', () => {
    const result = deriveBrandPalette({ hex: '#0e6e6b', scheme: 'light' })
    expect(result!.adjusted).toBe(false)
    expect(result!.brand).toBe('#0e6e6b')
  })

  it('bira čitljiv tekst na samoj brend boji', () => {
    const dark = deriveBrandPalette({ hex: '#0b3d3b', scheme: 'light' })!
    expect(dark.brandContrast).toBe('#ffffff')

    const light = deriveBrandPalette({ hex: '#ffe680', scheme: 'light' })!
    const onBrand = contrastRatio(parseHex(light.brandContrast)!, parseHex(light.brand)!)
    expect(onBrand).toBeGreaterThanOrEqual(3)
  })

  it('proizvodi upotrebljivu paletu u obe teme', () => {
    for (const hex of ['#0e6e6b', '#b4632a', '#2b5f9e', '#7a1f5c']) {
      const check = checkBrandColor(hex)
      expect(check.valid, `${hex} bi trebalo da bude upotrebljiva`).toBe(true)
    }
  })
})
