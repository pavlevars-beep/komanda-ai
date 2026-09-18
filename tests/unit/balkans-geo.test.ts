import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_SHAPES,
  FOREGROUND_SHAPES,
  MAP_BOUNDS,
  MAP_HEIGHT,
  projectPoint,
} from '@/ui/charts/balkans-geo'

/*
 * Obrisi na karti su GENERISANI, pa ih niko ne čita pri pregledu izmene.
 *
 * Zato ovde stoje tvrdnje o tome šta karta mora da prikazuje. Ponovno
 * pokretanje generatora sa drugačijim izvorom ili drugom verzijom biblioteke
 * ne sme tiho da promeni ono što se vidi na ekranu.
 */

function maxY(d: string): number {
  let max = -Infinity
  for (const m of d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
    max = Math.max(max, Number(m[2]))
  }
  return max
}

describe('obrisi Balkana', () => {
  const serbia = FOREGROUND_SHAPES.find((s) => s.name === 'Serbia')

  it('Srbija postoji u prvom planu', () => {
    expect(serbia).toBeDefined()
    expect(serbia!.d.length).toBeGreaterThan(200)
  })

  /*
   * Kosovo i Metohija je autonomna pokrajina Srbije i na ovoj karti je deo
   * srpskog obrisa, bez unutrašnje granice.
   *
   * Natural Earth ga vodi kao zaseban oblik, pa se u generatoru poligoni
   * SPAJAJU. Provera je geometrijska, ne po imenu: srpski obris mora da seže
   * južno od 42.1°, dokle Srbija bez Kosova i Metohije ne dopire.
   */
  it('Kosovo i Metohija je unutar srpskog obrisa', () => {
    const jug = projectPoint(MAP_BOUNDS.minLon, 42.1).y
    expect(maxY(serbia!.d)).toBeGreaterThan(jug)
  })

  it('nema zasebnog oblika za Kosovo', () => {
    const svi = [...FOREGROUND_SHAPES, ...BACKGROUND_SHAPES].map((s) => s.name)
    expect(svi).not.toContain('Kosovo')
  })

  it('zemlje sa objektima su u prvom planu, susedi u pozadini', () => {
    expect(FOREGROUND_SHAPES.map((s) => s.name)).toEqual([
      'Serbia',
      'Bosnia and Herz.',
      'Montenegro',
    ])
    expect(BACKGROUND_SHAPES.length).toBeGreaterThan(4)
  })

  /*
   * Samo PRVI PLAN mora da stane u okvir.
   *
   * Susedi namerno izlaze i seku se na ivici karte — Albanija i Bugarska se
   * pružaju daleko van onoga što nas zanima, a okvir koji bi ih ceo obuhvatio
   * smanjio bi Srbiju na trećinu. Prva verzija ovog testa je to tražila od svih
   * i pala na podatku koji je ispravan.
   */
  it('zemlje sa objektima staju u okvir crteža', () => {
    for (const shape of FOREGROUND_SHAPES) {
      // Blaga tolerancija: pojednostavljivanje sme da izađe za piksel.
      expect(maxY(shape.d), shape.name).toBeLessThan(MAP_HEIGHT + 2)
    }
  })
})
