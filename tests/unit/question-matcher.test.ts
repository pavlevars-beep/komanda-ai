import { describe, expect, it } from 'vitest'
import {
  answerableIntents,
  detectPeriod,
  matchQuestion,
  normalizeQuestion,
} from '@/core/ai/question-matcher'
import type { Permission } from '@/core/auth/permissions'

const ALL: readonly Permission[] = [
  'view_financial_data',
  'view_sales',
  'view_customers',
  'view_inventory',
  'ask_ai',
]

const ENABLED = [
  'get_financial_summary',
  'get_daily_sales',
  'get_sales_by_period',
  'get_outstanding_invoices',
  'get_top_debtors',
  'get_payables',
  'get_headcount',
  'get_inventory_alerts',
]

describe('svođenje pitanja na uporedivi oblik', () => {
  it('preslovljava ćirilicu i skida dijakritike', () => {
    expect(normalizeQuestion('Потраживања')).toBe('potrazivanja')
    expect(normalizeQuestion('POTRAŽIVANJA')).toBe('potrazivanja')
    expect(normalizeQuestion('  Koliko   dugujemo? ')).toBe('koliko dugujemo?')
  })

  it('isti odgovor bez obzira na raspored tastature', () => {
    const cyr = matchQuestion('Ко нам највише дугује?', ALL, ENABLED)
    const lat = matchQuestion('Ko nam najviše duguje?', ALL, ENABLED)
    expect(cyr).toEqual(lat)
    expect(cyr).toEqual({ kind: 'matched', intent: 'get_top_debtors' })
  })
})

describe('prepoznavanje namere', () => {
  it('prihod vodi na finansijski pregled', () => {
    expect(matchQuestion('Koliki je prihod ovog meseca?', ALL, ENABLED)).toEqual({
      kind: 'matched',
      intent: 'get_financial_summary',
      period: 'month',
    })
  })

  it('prodaja bez perioda je dnevna, sa periodom nije', () => {
    expect(matchQuestion('Kolika je prodaja danas?', ALL, ENABLED)).toEqual({
      kind: 'matched',
      intent: 'get_daily_sales',
      period: 'today',
    })
    expect(matchQuestion('Kolika je prodaja ove nedelje?', ALL, ENABLED)).toEqual({
      kind: 'matched',
      intent: 'get_sales_by_period',
      period: 'week',
    })
  })

  /*
   * Ovo je par koji se najlakše zameni: isti glagol, suprotno značenje.
   * Zamena bi klijentu pokazala tuđi dug kao sopstvenu obavezu.
   */
  it('razlikuje „koliko dugujemo" od „ko nama duguje"', () => {
    expect(matchQuestion('Koliko dugujemo dobavljačima?', ALL, ENABLED)).toMatchObject({
      kind: 'matched',
      intent: 'get_payables',
    })
    expect(matchQuestion('Ko nam duguje najviše?', ALL, ENABLED)).toMatchObject({
      kind: 'matched',
      intent: 'get_top_debtors',
    })
  })

  it('pitanje o dužnicima ne odlazi na listu faktura', () => {
    expect(matchQuestion('Koji su nam najveći dužnici?', ALL, ENABLED)).toMatchObject({
      intent: 'get_top_debtors',
    })
  })

  it('radi i na engleskom', () => {
    expect(matchQuestion('How many employees do we have?', ALL, ENABLED)).toMatchObject({
      kind: 'matched',
      intent: 'get_headcount',
    })
  })
})

describe('kada se ne odgovara', () => {
  it('neprepoznato pitanje NE dobija najbliži pogodak', () => {
    expect(matchQuestion('Kakvo je vreme sutra u Nišu?', ALL, ENABLED)).toEqual({
      kind: 'unmatched',
    })
  })

  it('prazno pitanje je neprepoznato', () => {
    expect(matchQuestion('  ', ALL, ENABLED)).toEqual({ kind: 'unmatched' })
  })

  it('bez permisije se prijavljuje uskraćen pristup, ne neprepoznato pitanje', () => {
    const result = matchQuestion('Koliki je prihod?', ['view_sales'], ENABLED)
    expect(result).toEqual({
      kind: 'no_permission',
      intent: 'get_financial_summary',
      permission: 'view_financial_data',
    })
  })

  /*
   * Ovaj slučaj je prvo bio napisan sa suprotnim očekivanjem — da pitanje
   * pređe na dnevnu prodaju kada periodična nije uključena. Test je pokazao
   * šta bi to značilo: na pitanje o NEDELJI stigao bi DANAŠNJI broj. Broj
   * tačan, odgovor pogrešan, i ništa na ekranu to ne odaje.
   */
  it('ne prelazi na drugu sposobnost kada tražena nije uključena', () => {
    const result = matchQuestion('Kolika je prodaja ove nedelje?', ALL, ['get_daily_sales'])
    expect(result).toEqual({ kind: 'unmatched' })
  })

  it('kada nijedna sposobnost nije uključena, nema odgovora', () => {
    expect(matchQuestion('Koliki je prihod?', ALL, [])).toEqual({ kind: 'unmatched' })
  })
})

describe('predlozi', () => {
  it('prolaze kroz oba filtera — permisiju i uključenost', () => {
    const intents = answerableIntents(['view_inventory'], ENABLED)
    expect(intents).toEqual(['get_inventory_alerts'])

    expect(answerableIntents(ALL, ['get_headcount'])).toEqual(['get_headcount'])
  })
})

describe('prepoznavanje perioda', () => {
  it('bira uži period kada su pomenuta dva', () => {
    // „prošlog meseca" je konkretnije od golog „mesec".
    expect(detectPeriod(normalizeQuestion('prodaja prošlog meseca'))).toBe('previousMonth')
  })

  it('bez pomena perioda ne izmišlja ga', () => {
    expect(detectPeriod('koliki je prihod')).toBeUndefined()
  })
})
