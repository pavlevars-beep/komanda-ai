import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseDelimited } from '@/core/import/csv'
import { readXlsx, columnIndex } from '@/core/import/xlsx'
import { readTable, ImportError } from '@/core/import/table'
import { parseDate, parseNumber, normalizeRows } from '@/core/import/normalize'
import { suggestMapping, validateMapping, normalizeHeader } from '@/core/import/mapping'

describe('razdvajač se prepoznaje, ne pretpostavlja', () => {
  /*
   * U srpskom Excelu je podrazumevani razdvajač tačka-zarez, jer je zarez
   * zauzet kao decimalni znak. Fajl sa tačkom-zarezom pročitan kao zarezom
   * razdvojen daje jednu kolonu — korisnik vidi „tabela je prazna" umesto
   * stvarnog razloga.
   */
  it('tačka-zarez pobeđuje zarez kada je zarez decimalni znak', () => {
    const text = 'Datum;Kupac;Iznos\n01.09.2026;Market;1.234,56\n'
    expect(detectDelimiter(text)).toBe(';')
    const rows = parseDelimited(text)
    expect(rows[1]).toEqual(['01.09.2026', 'Market', '1.234,56'])
  })

  it('tabulator i uspravna crta se takođe prepoznaju', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(detectDelimiter('a|b|c\n1|2|3')).toBe('|')
  })
})

describe('čitanje CSV-a', () => {
  it('prelom reda unutar navodnika je deo vrednosti', () => {
    // Adresa kupca u dva reda je uobičajena; bez ovoga se fajl razbije od tog
    // mesta nadalje.
    const rows = parseDelimited('a,b\n"Prvi red\nDrugi red",2\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.[0]).toBe('Prvi red\nDrugi red')
  })

  it('dvostruki navodnik unutar navodnika je jedan navodnik', () => {
    expect(parseDelimited('a\n"kaže ""zdravo"""\n')[1]?.[0]).toBe('kaže "zdravo"')
  })

  it('BOM ne postaje deo naziva prve kolone', () => {
    const rows = parseDelimited('﻿Datum,Iznos\n2026-09-01,100\n')
    expect(rows[0]?.[0]).toBe('Datum')
  })

  it('poslednji red bez preloma se ne gubi', () => {
    expect(parseDelimited('a,b\n1,2')).toHaveLength(2)
  })

  it('CRLF ne ostavlja povratnik u vrednosti', () => {
    expect(parseDelimited('a,b\r\n1,2\r\n')[1]).toEqual(['1', '2'])
  })
})

describe('čitanje .xlsx', () => {
  const bytes = readFileSync('tests/fixtures/prodaja.xlsx')

  it('deljena tabela stringova se razrešava', () => {
    const sheet = readXlsx(bytes)
    expect(sheet.name).toBe('Prodaja')
    expect(sheet.rows[0]).toEqual(['Datum', 'Kupac', 'Iznos'])
    expect(sheet.rows[1]?.[1]).toBe('Market Lazić')
  })

  it('ugrađeni string i XML entiteti se čitaju', () => {
    expect(readXlsx(bytes).rows[3]?.[1]).toBe('Vega & Sin')
  })

  it('oznaka kolone se prevodi u indeks', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AA1')).toBe(26)
    expect(columnIndex('BC12')).toBe(54)
  })

  it('vrsta fajla se bira po sadržaju, ne po nazivu', () => {
    // `.xlsx` preimenovan u `.csv` je čest kada se fajl šalje poštom.
    const table = readTable(bytes)
    expect(table.headers).toEqual(['Datum', 'Kupac', 'Iznos'])
  })

  it('prazan fajl se odbija sa razlogom', () => {
    expect(() => readTable(Buffer.alloc(0))).toThrow(ImportError)
  })
})

describe('brojevi iz tuđe tabele', () => {
  /*
   * Razlikuje se po tome KOJI znak stoji poslednji: on je decimalni. Bez toga
   * bi „1.234" postalo hiljadu dvesta trideset četiri ili jedan cela dvesta
   * trideset četiri, u zavisnosti od sreće.
   */
  it('domaći i engleski zapis daju isti broj', () => {
    expect(parseNumber('1.234.567,89')).toBeCloseTo(1_234_567.89, 2)
    expect(parseNumber('1,234,567.89')).toBeCloseTo(1_234_567.89, 2)
  })

  it('valuta i razmaci se uklanjaju', () => {
    expect(parseNumber('1 234,50 RSD')).toBeCloseTo(1234.5, 2)
  })

  it('negativan iznos zadržava predznak', () => {
    expect(parseNumber('-450,25')).toBeCloseTo(-450.25, 2)
  })

  it('prazno i besmisleno vraćaju ništa, ne nulu', () => {
    // Nula je podatak; izostanak nije. Zamena bi tiho pomerila svaki zbir.
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('n/a')).toBeNull()
    expect(parseNumber('-')).toBeNull()
  })
})

describe('datumi iz tuđe tabele', () => {
  it('ISO, domaći i Excel-ov redni broj daju isti datum', () => {
    expect(parseDate('2026-09-01')).toBe('2026-09-01')
    expect(parseDate('1.9.2026.')).toBe('2026-09-01')
    expect(parseDate('01/09/2026')).toBe('2026-09-01')
    // 46266 je 1. septembar 2026. u Excel-ovom brojanju od 30.12.1899.
    expect(parseDate('46266')).toBe('2026-09-01')
  })

  it('nepostojeći datum se odbija umesto da se prelije u sledeći mesec', () => {
    expect(parseDate('31.2.2026')).toBeNull()
  })

  it('broj van opsega rednih brojeva nije datum', () => {
    expect(parseDate('999999')).toBeNull()
  })

  it('prazno nije datum', () => {
    expect(parseDate('  ')).toBeNull()
  })
})

describe('predlog mapiranja', () => {
  it('prepoznaje domaće i engleske nazive kolona', () => {
    const mapping = suggestMapping(['Datum', 'Kupac', 'Iznos'], 'sales')
    expect(mapping).toMatchObject({ date: 0, customer: 1, amount: 2 })
  })

  it('ćirilica i dijakritici ne odlučuju', () => {
    expect(normalizeHeader('Дужник')).toBe('duznik')
    const mapping = suggestMapping(['Дужник', 'Дуг', 'Доспеће'], 'receivables')
    expect(mapping.customer).toBe(0)
  })

  /*
   * Kolona se dodeljuje najviše jednom polju. Bez toga bi „Datum" u
   * potraživanjima pokrio i dospeće, pa bi svaka faktura dospevala na dan
   * izdavanja — greška koja se vidi kao „sve kasni".
   */
  it('ista kolona ne pokriva dva polja', () => {
    const mapping = suggestMapping(['Kupac', 'Iznos', 'Datum'], 'receivables')
    const used = Object.values(mapping)
    expect(new Set(used).size).toBe(used.length)
  })

  it('poklapanje celom reči je jače od poklapanja delom', () => {
    const mapping = suggestMapping(['Broj dana', 'Broj fakture', 'Kupac', 'Iznos', 'Dospeće'], 'receivables')
    expect(mapping.invoiceNumber).toBe(1)
  })
})

describe('provera mapiranja', () => {
  it('obavezno polje bez kolone se prijavljuje', () => {
    const problems = validateMapping({ customer: 0 }, 'receivables', 3)
    expect(problems.map((p) => p.field)).toContain('amount')
    expect(problems.map((p) => p.field)).toContain('dueDate')
  })

  it('dva polja na istoj koloni se prijavljuju', () => {
    const problems = validateMapping({ customer: 0, amount: 1, dueDate: 1 }, 'receivables', 3)
    expect(problems[0]).toEqual({ field: 'dueDate', key: 'import.error.columnReused' })
  })

  it('kolona van opsega se prijavljuje', () => {
    const problems = validateMapping({ customer: 0, amount: 1, dueDate: 9 }, 'receivables', 3)
    expect(problems[0]?.key).toBe('import.error.columnOutOfRange')
  })

  it('potpuno mapiranje nema primedbi', () => {
    expect(validateMapping({ customer: 0, amount: 1, dueDate: 2 }, 'receivables', 3)).toEqual([])
  })
})

describe('normalizacija redova', () => {
  const rows = [
    ['Datum', 'Kupac', 'Iznos'],
    ['01.09.2026', 'Market Lazić', '125.000,50'],
    ['', '', ''],
    ['nije datum', 'Trgovina Jug', '98.000'],
    ['03.09.2026', 'Vega', 'nije broj'],
    ['04.09.2026', 'Alfa', '44.100'],
  ]
  const mapping = { date: 0, customer: 1, amount: 2 }

  it('ispravni redovi se čitaju, neispravni se PRIJAVLJUJU', () => {
    const result = normalizeRows(rows, mapping, 'sales')

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ date: '2026-09-01', customer: 'Market Lazić', amount: 125_000.5 })
    // Uvoz koji tiho preskoči redove daje brojeve manje od stvarnih, a niko ne
    // zna zašto — najgori mogući ishod.
    expect(result.problems).toHaveLength(2)
    expect(result.problems.map((p) => p.field)).toEqual(['date', 'amount'])
  })

  it('prazan red se ne broji ni kao uvezen ni kao greška', () => {
    const result = normalizeRows(rows, mapping, 'sales')
    expect(result.skippedEmpty).toBe(1)
  })

  it('broj reda odgovara onome što korisnik vidi u tabeli', () => {
    const result = normalizeRows(rows, mapping, 'sales')
    // Četvrti red tabele, računajući zaglavlje kao prvi.
    expect(result.problems[0]?.row).toBe(4)
  })

  it('neobavezno polje bez kolone ne obara red', () => {
    const result = normalizeRows(rows, { date: 0, amount: 2 }, 'sales')
    expect(result.rows[0]?.customer).toBeNull()
    expect(result.rows).toHaveLength(2)
  })
})
