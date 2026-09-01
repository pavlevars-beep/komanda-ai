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

describe('odluka koju donosi ekran za brendiranje', () => {
  it('prihvata boje koje se u praksi biraju kao korporativne', () => {
    for (const hex of ['#1f5fa8', '#0e6e6b', '#7a1f5c', '#3d5a2b', '#8b1a1a']) {
      expect(checkBrandColor(hex).valid, `${hex} bi trebalo da prođe`).toBe(true)
    }
  })

  it('prijavlja korekciju kada je boja presvetla za svetlu podlogu', () => {
    // Bez ovoga bi klijent u radnom prostoru dobio nečitljiv tekst.
    const check = checkBrandColor('#ffe680')
    expect(check.valid).toBe(true)
    expect(check.adjustedFrom).toBe('#ffe680')
  })

  it('ne prijavljuje korekciju kada boja već prolazi', () => {
    expect(checkBrandColor('#1f5fa8').adjustedFrom).toBeUndefined()
  })

  it('boja koja prođe proveru je upotrebljiva i u tamnoj temi', () => {
    const ground = parseHex('#0d1113')!
    for (const hex of ['#1f5fa8', '#8b1a1a', '#0e6e6b']) {
      const dark = deriveBrandPalette({ hex, scheme: 'dark' })!
      expect(
        contrastRatio(parseHex(dark.brand)!, ground),
        `${hex} u tamnoj temi`,
      ).toBeGreaterThanOrEqual(3)
    }
  })
})
