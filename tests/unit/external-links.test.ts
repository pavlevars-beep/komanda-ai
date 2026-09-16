import { describe, expect, it } from 'vitest'
import { EXTERNAL_LINKS, groupedLinks, linksFor } from '@/core/links/catalog'
import { sr } from '@/i18n/messages/sr'
import { en } from '@/i18n/messages/en'

describe('katalog javnih servisa', () => {
  it('svaki link ima jedinstven ključ', () => {
    const keys = EXTERNAL_LINKS.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /*
   * Samo https. Državni sajt na http-u prenosi i ono što korisnik otkuca u
   * pretragu — a to ume da bude PIB kupca.
   */
  it('svaka adresa ide preko https', () => {
    for (const link of EXTERNAL_LINKS) {
      expect(link.url.startsWith('https://')).toBe(true)
    }
  })

  /*
   * Koreni domena, ne duboke putanje: putanje na državnim sajtovima se menjaju
   * bez najave, a pokvaren link je obećanje koje se prekršilo.
   */
  it('adrese su koreni domena, bez putanje i bez parametara', () => {
    for (const link of EXTERNAL_LINKS) {
      const url = new URL(link.url)
      expect(url.pathname).toBe('/')
      expect(url.search).toBe('')
      expect(url.hash).toBe('')
    }
  })

  it('svaki link ima naziv na oba jezika', () => {
    for (const link of EXTERNAL_LINKS) {
      for (const messages of [sr, en]) {
        expect(messages).toHaveProperty(`links.${link.key}`)
      }
    }
  })

  it('svaka grupa ima naziv na oba jezika', () => {
    for (const group of groupedLinks()) {
      for (const messages of [sr, en]) {
        expect(messages).toHaveProperty(`links.category.${group.category}`)
      }
    }
  })
})

describe('linkovi uz podatak', () => {
  /*
   * Link koji stoji tačno uz podatak zbog kojeg se otvara vredi više od istog
   * linka na spisku. Kupac čiji je račun u blokadi ne kasni sa plaćanjem — on
   * ne MOŽE da plati, i to menja potez.
   */
  it('uz dužnike stoji provera blokade i registar', () => {
    const keys = linksFor('debtors').map((l) => l.key)
    expect(keys).toContain('nbsBlocked')
    expect(keys).toContain('apr')
  })

  it('kontekst bez linkova daje prazno, ne grešku', () => {
    expect(linksFor('payables')).toEqual([])
  })
})

describe('grupisanje', () => {
  it('redosled grupa je stalan i ne zavisi od broja linkova', () => {
    expect(groupedLinks().map((g) => g.category)).toEqual([
      'registry',
      'finance',
      'tax',
      'customs',
      'state',
    ])
  })

  it('nijedan link se ne gubi pri grupisanju', () => {
    const grouped = groupedLinks().flatMap((g) => g.links)
    expect(grouped).toHaveLength(EXTERNAL_LINKS.length)
  })

  it('prazna grupa se ne prikazuje', () => {
    expect(groupedLinks().every((g) => g.links.length > 0)).toBe(true)
  })
})
