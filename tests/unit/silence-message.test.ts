import { describe, expect, it } from 'vitest'
import { evaluateCadence, type Cadence } from '@/core/import/cadence'
import { formatLocal, silenceDedupeKey, silenceMessage } from '@/core/import/silence-message'

const RITAM: Cadence = {
  weekdays: [1, 2, 3, 4, 5],
  byTime: '08:00',
  timeZone: 'Europe/Belgrade',
  graceMinutes: 30,
  activeFrom: '2026-09-04T00:00:00Z',
}

function poruka(arrivals: readonly string[], now: string, weekdays = RITAM.weekdays) {
  const cadence = { ...RITAM, weekdays }
  const verdict = evaluateCadence(cadence, arrivals, new Date(now))
  return {
    verdict,
    message: silenceMessage({
      kind: 'sales',
      state: verdict.state,
      verdict,
      weekdays: cadence.weekdays,
      byTime: cadence.byTime,
      timeZone: cadence.timeZone,
      sourceName: 'Dnevni izvoz',
    }),
  }
}

describe('poruka o tišini', () => {
  it('uredno stanje ne pravi poruku', () => {
    const { message } = poruka(['2026-09-07T05:00:00Z'], '2026-09-07T07:00:00Z')
    expect(message).toBeNull()
  })

  /*
   * Upozorenje odgovara na tri pitanja: šta, od kada, i šta sada. Bez trećeg
   * dela je samo loša vest — onaj ko ga pročita u 08:31 mora da zna svoj potez.
   */
  it('kašnjenje nosi šta, od kada i šta sada', () => {
    const { message } = poruka(['2026-09-04T05:00:00Z'], '2026-09-07T07:00:00Z')
    expect(message?.severity).toBe('warning')
    expect(message?.title.sr).toContain('Prodaja')
    expect(message?.title.sr).toContain('Dnevni izvoz')
    expect(message?.title.sr).toContain('07.09.2026')
    expect(message?.body.sr).toContain('radnim danima do 08:00')
    expect(message?.body.sr).toContain('Poslednji uvoz: 04.09.2026')
    expect(message?.body.sr).toContain('Proveriti')
  })

  it('duža tišina je oštrija i kaže da se brojevima ne veruje', () => {
    const { message, verdict } = poruka(['2026-09-04T05:00:00Z'], '2026-09-08T07:00:00Z')
    expect(verdict.state).toBe('missing')
    expect(message?.severity).toBe('critical')
    expect(message?.body.sr).toContain('zastareli')
    expect(message?.body.sr).toContain('2')
  })

  /*
   * „Nikad nije stiglo" i „prestalo je da stiže" traže različit razgovor sa
   * klijentom: prvo je nepodešen dotok, drugo je kvar u dotoku koji je radio.
   */
  it('nijedan uvoz ikada vodi na podešavanje, ne na kvar', () => {
    const { message } = poruka([], '2026-09-08T07:00:00Z')
    expect(message?.severity).toBe('critical')
    expect(message?.title.sr).toContain('podatak nije stigao nijednom')
    expect(message?.body.sr).toContain('nije ni uspostavljen')
    expect(message?.body.sr).not.toContain('Poslednji uvoz')
  })

  it('dogovoreni dani se imenuju kada nisu cela radna nedelja', () => {
    const { message } = poruka([], '2026-09-08T07:00:00Z', [1, 4])
    expect(message?.body.sr).toContain('ponedeljkom, četvrtkom')
  })

  it('poruka postoji i na engleskom', () => {
    const { message } = poruka(['2026-09-04T05:00:00Z'], '2026-09-07T07:00:00Z')
    expect(message?.title.en).toContain('Sales')
    expect(message?.body.en).toContain('on working days by 08:00')
  })
})

/*
 * Vreme u poruci je na KLIJENTOVOM satu. Server proverava u UTC-u, a rukovodilac
 * koji pročita „nije stiglo u 06:00" ne prepoznaje svoj dogovoreni rok od 08:00.
 */
describe('vreme u poruci', () => {
  it('ispisuje se u zoni firme, ne u UTC-u', () => {
    expect(formatLocal('2026-09-08T06:00:00Z', 'Europe/Belgrade')).toBe('08.09.2026. u 08:00')
    expect(formatLocal('2026-01-08T07:00:00Z', 'Europe/Belgrade')).toBe('08.01.2026. u 08:00')
  })

  it('ista firma u drugoj zoni vidi svoje vreme', () => {
    expect(formatLocal('2026-09-08T06:00:00Z', 'Asia/Dubai')).toBe('08.09.2026. u 10:00')
  })
})

describe('ključ za sprečavanje duplikata', () => {
  it('razlikuje vrstu podatka i izvor', () => {
    expect(silenceDedupeKey('i1', 'sales')).not.toBe(silenceDedupeKey('i1', 'stock'))
    expect(silenceDedupeKey('i1', 'sales')).not.toBe(silenceDedupeKey('i2', 'sales'))
  })
})

/*
 * Rečenica „{vrsta} nije stigla" se slaže samo sa „Prodaja". Za „Zalihe" i
 * „Potraživanja" je pogrešna, a rod i broj se kroz šablon ne mogu složiti. Zato
 * subjekat mora da ostane isti za sve četiri vrste — ovo to i drži.
 */
describe('slaganje u rodu i broju', () => {
  const KINDS = ['sales', 'receivables', 'payables', 'stock'] as const

  it('subjekat rečenice je isti za svaku vrstu podatka', () => {
    for (const kind of KINDS) {
      const verdict = evaluateCadence(RITAM, [], new Date('2026-09-08T07:00:00Z'))
      const message = silenceMessage({
        kind,
        state: verdict.state,
        verdict,
        weekdays: RITAM.weekdays,
        byTime: RITAM.byTime,
        timeZone: RITAM.timeZone,
      })

      expect(message?.title.sr).toContain(': podatak nije stigao')
      // Oblik ženskog roda jednine ne sme da se vrati ni za jednu vrstu.
      expect(message?.title.sr).not.toContain('stigla')
    }
  })
})
