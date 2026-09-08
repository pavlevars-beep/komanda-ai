import { describe, expect, it } from 'vitest'
import { barScale, lineGeometry, tickIndices } from '@/ui/charts/geometry'

describe('razmera stubića', () => {
  /*
   * Osnova je uvek nula. Skraćena osa uvećava razlike i od pomeraja od dva
   * procenta pravi provaliju — najčešći način da tačan podatak ispriča
   * netačnu priču.
   */
  it('najveća vrednost puni okvir, ostale su srazmerne njoj', () => {
    const scale = barScale([100, 50, 25])
    expect(scale.height(100)).toBe(100)
    expect(scale.height(50)).toBe(50)
    expect(scale.height(25)).toBe(25)
  })

  it('vrednosti bliske jedna drugoj ostaju bliske i na ekranu', () => {
    // Sa skraćenom osom bi 98 i 100 izgledali kao dvostruka razlika.
    const scale = barScale([100, 98])
    expect(scale.height(98)).toBeCloseTo(98, 0)
  })

  it('vrednost veća od nule nikad ne nestane sa ekrana', () => {
    const scale = barScale([1_000_000, 1])
    expect(scale.height(1)).toBeGreaterThan(0)
  })

  it('nula je nula, ne mrvica', () => {
    expect(barScale([100, 0]).height(0)).toBe(0)
  })

  it('prazan niz ne deli nulom', () => {
    const scale = barScale([])
    expect(scale.max).toBe(1)
    expect(scale.height(0)).toBe(0)
  })

  it('neispravna vrednost se tretira kao nula umesto da obori razmeru', () => {
    const scale = barScale([100, Number.NaN, Number.POSITIVE_INFINITY])
    expect(scale.max).toBe(100)
    expect(scale.height(Number.NaN)).toBe(0)
  })
})

describe('geometrija linije', () => {
  it('prva tačka je uz levu ivicu, poslednja uz desnu', () => {
    const geo = lineGeometry([1, 2, 3], 600, 100)
    expect(geo.points[0]?.x).toBe(0)
    expect(geo.points[2]?.x).toBe(600)
  })

  it('veća vrednost je VIŠE na ekranu, dakle manje y', () => {
    const geo = lineGeometry([1, 10], 100, 100)
    expect(geo.points[1]!.y).toBeLessThan(geo.points[0]!.y)
  })

  it('jedna tačka se crta na sredini, ne uz ivicu', () => {
    const geo = lineGeometry([5], 600, 100)
    expect(geo.points[0]?.x).toBe(300)
  })

  it('ispuna se zatvara do dna okvira', () => {
    const geo = lineGeometry([1, 2], 100, 50)
    expect(geo.areaPath.endsWith('Z')).toBe(true)
    expect(geo.areaPath).toContain('L100.00 50')
  })

  it('prazan niz ne pravi neispravnu putanju', () => {
    const geo = lineGeometry([], 100, 50)
    expect(geo.path).toBe('')
    expect(geo.areaPath).toBe('')
  })

  it('negativna vrednost se privodi nuli umesto da izađe iz okvira', () => {
    const geo = lineGeometry([-50, 100], 100, 100, 0)
    expect(geo.points[0]!.y).toBe(100)
  })
})

describe('oznake na osi', () => {
  it('kratak niz dobija sve oznake', () => {
    expect(tickIndices(4)).toEqual([0, 1, 2, 3])
  })

  /*
   * Prva i poslednja se ispisuju uvek. Bez njih čitalac ne zna ni gde niz
   * počinje ni gde se završava, a to je prvo što se sa grafikona traži.
   */
  it('dug niz se proređuje, ali krajevi ostaju', () => {
    const ticks = tickIndices(30, 5)
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBe(29)
    expect(ticks.length).toBeLessThanOrEqual(6)
  })

  it('oznake se ne ponavljaju', () => {
    for (const count of [7, 12, 24, 36, 90]) {
      const ticks = tickIndices(count, 6)
      expect(new Set(ticks).size).toBe(ticks.length)
    }
  })

  it('prazan niz nema oznake', () => {
    expect(tickIndices(0)).toEqual([])
  })
})
