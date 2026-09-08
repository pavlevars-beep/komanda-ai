import { describe, expect, it } from 'vitest'
import { evaluateCadence, needsAttention, type Cadence } from '@/core/import/cadence'
import { isoWeekday, zonedTimeToInstant } from '@/core/import/zone'

/** Radnim danima do 08:00 po beogradskom vremenu, uz pola sata tolerancije. */
const RADNIM_DANIMA: Cadence = {
  weekdays: [1, 2, 3, 4, 5],
  byTime: '08:00',
  timeZone: 'Europe/Belgrade',
  graceMinutes: 30,
  activeFrom: '2026-08-01T00:00:00Z',
}

describe('ritam uvoza', () => {
  it('uvoz pre roka je uredan', () => {
    // Utorak 07:00, rok istog dana u 08:00 još nije ni prošao — ocenjuje se
    // ponedeljak, koji je pokriven.
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-07T05:10:00Z'],
      new Date('2026-09-08T05:00:00Z'),
    )
    expect(verdict.state).toBe('onTime')
    expect(verdict.missedPeriods).toBe(0)
  })

  /*
   * Uvoz u 07:00 pokriva rok u 08:00 ISTOG dana. Da se rok merio samo prema
   * vremenu poslednjeg uvoza, svaki uredan klijent koji šalje pre roka bi svako
   * jutro bio prijavljen kao zakasneo.
   */
  it('uvoz pre roka pokriva taj rok, ne prethodni', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-08T05:00:00Z'], // utorak 07:00 lokalno
      new Date('2026-09-08T07:00:00Z'), // utorak 09:00 lokalno, rok prošao
    )
    expect(verdict.state).toBe('onTime')
  })

  it('rok prošao i ništa nije stiglo — kasni', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-07T05:00:00Z'], // ponedeljak
      new Date('2026-09-08T07:00:00Z'), // utorak 09:00, rok 08:00 + 30min prošao
    )
    expect(verdict.state).toBe('late')
    expect(verdict.missedPeriods).toBe(1)
    expect(verdict.silentSince).toBe('2026-09-08T06:00:00.000Z')
  })

  it('u toku tolerancije se ćuti', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-07T05:00:00Z'],
      new Date('2026-09-08T06:20:00Z'), // 08:20 lokalno, tolerancija do 08:30
    )
    expect(verdict.state).toBe('onTime')
  })

  /*
   * Vikend nije tišina. Bez ovoga bi svaki ponedeljak počinjao sa dva „propuštena"
   * roka i alarm bi izgubio značenje pre nego što ga iko pročita.
   */
  it('vikend se ne broji kao propušten rok', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-04T05:00:00Z'], // petak ujutru
      new Date('2026-09-06T12:00:00Z'), // nedelja podne
    )
    expect(verdict.state).toBe('onTime')
    expect(verdict.missedPeriods).toBe(0)
  })

  it('ponedeljak posle urednog petka je kašnjenje od jednog roka', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-04T05:00:00Z'], // petak 07:00 lokalno, pokriva petak
      new Date('2026-09-07T07:00:00Z'), // ponedeljak 09:00
    )
    expect(verdict.state).toBe('late')
    expect(verdict.missedPeriods).toBe(1)
  })

  it('dva uzastopna propuštena roka su drugo stanje od jednog', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-09-04T05:00:00Z'], // petak
      new Date('2026-09-08T07:00:00Z'), // utorak: ponedeljak i utorak propušteni
    )
    expect(verdict.state).toBe('missing')
    expect(verdict.missedPeriods).toBe(2)
  })

  /*
   * Stara greška ne sme zauvek da boji sadašnje stanje: broji se NEPREKIDAN niz
   * unazad od poslednjeg roka, ne ukupan broj propuštenih.
   */
  it('zakasneo uvoz sledećeg dana vraća stanje na uredno', () => {
    const odPetka = { ...RADNIM_DANIMA, activeFrom: '2026-09-04T00:00:00Z' }
    const arrivals = [
      '2026-09-04T05:00:00Z', // petak 07:00 — na vreme
      '2026-09-07T07:30:00Z', // ponedeljak 09:30 — posle roka i tolerancije
    ]

    expect(evaluateCadence(odPetka, arrivals, new Date('2026-09-07T08:00:00Z')).state).toBe(
      'late',
    )

    // Isti taj zakasneli uvoz pokriva utorak, jer pada u utorkov period.
    expect(evaluateCadence(odPetka, arrivals, new Date('2026-09-08T07:00:00Z')).state).toBe(
      'onTime',
    )
  })

  it('nijedan uvoz ikada nije stigao — to nije prekid nego neuspostavljen dotok', () => {
    const verdict = evaluateCadence(RADNIM_DANIMA, [], new Date('2026-09-08T07:00:00Z'))
    expect(verdict.state).toBe('never')
    expect(verdict.lastArrivalAt).toBeNull()
  })

  it('tek podešen ritam ne prijavljuje ništa dok prvi rok ne prođe', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, activeFrom: '2026-09-08T04:00:00Z' },
      [],
      new Date('2026-09-08T05:00:00Z'), // rok u 08:00 lokalno = 06:00 UTC, još nije
    )
    expect(verdict.state).toBe('awaiting')
    expect(verdict.nextDueAt).toBe('2026-09-08T06:00:00.000Z')
  })

  it('pauza ućutkuje alarm, ali ne briše naredni rok', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, pausedUntil: '2026-09-20T00:00:00Z' },
      [],
      new Date('2026-09-08T07:00:00Z'),
    )
    expect(verdict.state).toBe('paused')
    expect(verdict.nextDueAt).not.toBeNull()
  })

  it('istekla pauza više ne ućutkuje', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, pausedUntil: '2026-09-01T00:00:00Z' },
      [],
      new Date('2026-09-08T07:00:00Z'),
    )
    expect(verdict.state).toBe('never')
  })

  it('bez ijednog dogovorenog dana nema šta da se meri', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, weekdays: [] },
      [],
      new Date('2026-09-08T07:00:00Z'),
    )
    expect(verdict.state).toBe('awaiting')
    expect(verdict.nextDueAt).toBeNull()
  })

  it('neispravno vreme roka ne ruši proračun', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, byTime: '25:00' },
      [],
      new Date('2026-09-08T07:00:00Z'),
    )
    expect(verdict.state).toBe('awaiting')
  })

  it('rokovi pre dogovora se ne broje', () => {
    const verdict = evaluateCadence(
      { ...RADNIM_DANIMA, activeFrom: '2026-09-08T00:00:00Z' },
      [],
      new Date('2026-09-08T07:00:00Z'),
    )
    // Samo utorkov rok je unutar dogovora, iako je pre njega bilo radnih dana.
    expect(verdict.missedPeriods).toBe(1)
    expect(verdict.state).toBe('never')
  })

  it('uvoz stariji od prozora ne pokriva ništa u prozoru', () => {
    const verdict = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-06-01T05:00:00Z'],
      new Date('2026-09-08T07:00:00Z'),
    )
    expect(verdict.state).toBe('missing')
    expect(verdict.missedPeriods).toBeGreaterThan(2)
  })
})

/*
 * Letnje računanje vremena. 08:00 u Beogradu je 06:00 UTC leti i 07:00 UTC zimi.
 * Fiksni pomeraj bi dva puta godišnje pomerio rok za sat — taman toliko da se
 * alarm oglasi bez razloga ili izostane kad treba.
 */
describe('vremenska zona i pomeranje sata', () => {
  it('isti lokalni rok pada na različit UTC leti i zimi', () => {
    expect(zonedTimeToInstant(2026, 9, 8, 8, 0, 'Europe/Belgrade')).toBe(
      Date.parse('2026-09-08T06:00:00Z'),
    )
    expect(zonedTimeToInstant(2026, 1, 8, 8, 0, 'Europe/Belgrade')).toBe(
      Date.parse('2026-01-08T07:00:00Z'),
    )
  })

  it('rok se ne pomera preko prelaza na zimsko vreme', () => {
    // Poslednja nedelja oktobra 2026: sat se vraća u noći 24/25. oktobra.
    const petakPre = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-10-23T05:00:00Z'], // petak 07:00 letnjeg
      new Date('2026-10-23T07:00:00Z'),
    )
    expect(petakPre.state).toBe('onTime')

    const ponedeljakPosle = evaluateCadence(
      RADNIM_DANIMA,
      ['2026-10-26T06:00:00Z'], // ponedeljak 07:00 zimskog = 06:00 UTC
      new Date('2026-10-26T08:00:00Z'), // 09:00 lokalno
    )
    expect(ponedeljakPosle.state).toBe('onTime')
  })

  it('nedelja je sedmi dan, ne nulti', () => {
    expect(isoWeekday(2026, 9, 6)).toBe(7)
    expect(isoWeekday(2026, 9, 7)).toBe(1)
  })
})

describe('šta traži reakciju', () => {
  it('uredno, čekanje i pauza se ne prijavljuju', () => {
    expect(needsAttention('onTime')).toBe(false)
    expect(needsAttention('awaiting')).toBe(false)
    expect(needsAttention('paused')).toBe(false)
  })

  it('kašnjenje, izostanak i nikad se prijavljuju', () => {
    expect(needsAttention('late')).toBe(true)
    expect(needsAttention('missing')).toBe(true)
    expect(needsAttention('never')).toBe(true)
  })
})
