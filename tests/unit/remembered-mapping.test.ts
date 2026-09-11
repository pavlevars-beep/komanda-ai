import { describe, expect, it } from 'vitest'
import { applyRememberedMapping } from '@/core/import/mapping'

/*
 * Zapamćeno mapiranje po INDEKSU je zamka: kada neko ubaci kolonu, svi indeksi
 * posle nje se pomere i zapamćeni indeks tiho pokazuje na pogrešnu kolonu.
 * Brojevi i dalje postoje, samo su iz druge kolone — kvar koji se ne primeti.
 */

const STARO = ['Datum', 'Iznos', 'Kupac']
const MAPA = { date: 0, amount: 1, customer: 2 }

describe('zapamćeno mapiranje', () => {
  it('isto zaglavlje daje isto mapiranje, bez izmena', () => {
    const r = applyRememberedMapping(MAPA, STARO, STARO)
    expect(r.mapping).toEqual(MAPA)
    expect(r.headersChanged).toBe(false)
    expect(r.missing).toEqual([])
    expect(r.moved).toEqual([])
    expect(r.added).toEqual([])
  })

  it('ubačena kolona pomera indekse, a mapiranje ostaje na svojim kolonama', () => {
    const novo = ['Datum', 'Broj naloga', 'Iznos', 'Kupac']
    const r = applyRememberedMapping(MAPA, STARO, novo)

    expect(r.mapping).toEqual({ date: 0, amount: 2, customer: 3 })
    expect(r.moved).toEqual(['Iznos', 'Kupac'])
    expect(r.added).toEqual(['Broj naloga'])
    expect(r.headersChanged).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('premeštena kolona se prati po nazivu, ne po mestu', () => {
    const novo = ['Kupac', 'Datum', 'Iznos']
    const r = applyRememberedMapping(MAPA, STARO, novo)
    expect(r.mapping).toEqual({ date: 1, amount: 2, customer: 0 })
    expect(r.missing).toEqual([])
  })

  /*
   * Nestala kolona se NE pogađa iznova. Tiho ponovno pogađanje je način na koji
   * kolona sa obavezama počne da se čita kao potraživanja i mesec dana niko ne
   * primeti — zato polje ostaje nemapirano i traži odluku čoveka.
   */
  it('nestala kolona ostaje nemapirana i prijavljena', () => {
    const novo = ['Datum', 'Iznos']
    const r = applyRememberedMapping(MAPA, STARO, novo)

    expect(r.mapping).toEqual({ date: 0, amount: 1 })
    expect(r.missing).toEqual(['customer'])
  })

  it('promena velikog slova i dijakritika nije promena kolone', () => {
    const staro = ['Datum', 'Iznos', 'Šifra']
    const novo = ['DATUM', 'iznos', 'Sifra']
    const r = applyRememberedMapping({ date: 0, amount: 1, product: 2 }, staro, novo)

    expect(r.mapping).toEqual({ date: 0, amount: 1, product: 2 })
    expect(r.headersChanged).toBe(false)
    expect(r.added).toEqual([])
  })

  it('dve istoimene kolone ne preuzimaju jedna drugoj mapiranje', () => {
    const novo = ['Datum', 'Iznos', 'Iznos', 'Kupac']
    const r = applyRememberedMapping(MAPA, STARO, novo)
    // Prvo pojavljivanje pobeđuje; druga „Iznos" ne pomera mapiranje.
    expect(r.mapping.amount).toBe(1)
    expect(r.mapping.customer).toBe(3)
  })

  it('zapamćen indeks van opsega starog zaglavlja je nestalo polje', () => {
    const r = applyRememberedMapping({ date: 0, amount: 9 }, STARO, STARO)
    expect(r.mapping).toEqual({ date: 0 })
    expect(r.missing).toEqual(['amount'])
  })

  it('prazna kolona u zaglavlju se ne broji kao nova', () => {
    const novo = ['Datum', 'Iznos', 'Kupac', '   ']
    const r = applyRememberedMapping(MAPA, STARO, novo)
    expect(r.added).toEqual([])
    expect(r.mapping).toEqual(MAPA)
  })
})
