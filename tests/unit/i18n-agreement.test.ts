import { describe, expect, it } from 'vitest'
import { sr } from '@/i18n/messages/sr'

/*
 * Slaganje u rodu i broju u porukama sa umetnutim imenom.
 *
 * Ovo je ista greška koja je već dvaput prošla: „{vrsta} nije stigla" se slaže
 * samo sa „Prodaja", a „Da bi {firma} imao" samo sa nazivom muškog roda.
 * Umetnuta vrednost ima rod koji šablon ne može da zna — „Distribucija" je
 * ženskog, „Delta Pro" muškog, „Preduzeće" srednjeg.
 *
 * Rešenje je uvek isto: PREZENT se ne slaže u rodu, prošli particip se slaže.
 * Zato se rečenica prestrukturira umesto da se traži pravi oblik.
 *
 * Ako ovaj test jednom padne na ispravnom tekstu, ispravka je i dalje ista —
 * rečenicu treba prepisati tako da ne zavisi od roda.
 */

/** Oblici koji se slažu u rodu: ako stoje uz umetnuto ime, nešto je pogrešno. */
const GENDERED = [
  'imao',
  'imala',
  'imalo',
  'stigao',
  'stigla',
  'stiglo',
  'bio',
  'bila',
  'bilo',
  'dobio',
  'dobila',
  'poslao',
  'poslala',
  'primio',
  'primila',
]

/** Mesta za umetanje gde vrednost može biti naziv firme, vrste ili fajla. */
const NAME_PLACEHOLDERS = ['{org}', '{kind}', '{file}', '{name}', '{client}']

/**
 * Da li je umetnuta vrednost SUBJEKAT oblika koji se slaže u rodu.
 *
 * Heuristika, i namerno se tako zove. Gleda se tekst IZMEĐU mesta za umetanje i
 * spornog oblika: dvotačka, tačka ili crta znače da je rečenica u međuvremenu
 * dobila svoj subjekat, pa umetnuta vrednost stoji kao oznaka.
 *
 * Upravo to je i bila ispravka oba puta kada je greška prošla: „{vrsta} nije
 * stigla" → „{vrsta}: podatak nije stigao". Kada ovo jednom prijavi ispravan
 * tekst, ispravka je i dalje ista — prepisati rečenicu tako da ne zavisi od
 * roda. Lažna uzbuna košta jedno prepisivanje; propuštena greška košta poruku
 * koja godinama ide klijentu na lošem srpskom.
 */
function subjectOfGenderedForm(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []

  for (const placeholder of NAME_PLACEHOLDERS) {
    let from = lower.indexOf(placeholder.toLowerCase())
    while (from !== -1) {
      const after = lower.slice(from + placeholder.length)
      // Do prvog prekida rečenice: posle njega umetnuta vrednost nije subjekat.
      const stop = after.search(/[:.—]/)
      const scope = stop === -1 ? after : after.slice(0, stop)

      const words = scope.split(/[^a-zčćđšž]+/)
      for (const form of GENDERED) {
        if (words.includes(form) && !found.includes(form)) found.push(form)
      }

      from = lower.indexOf(placeholder.toLowerCase(), from + 1)
    }
  }

  return found
}

describe('poruke sa umetnutim imenom', () => {
  it('ne oslanjaju se na rod umetnute vrednosti', () => {
    const problems: string[] = []

    for (const [key, value] of Object.entries(sr)) {
      if (typeof value !== 'string') continue
      if (!NAME_PLACEHOLDERS.some((p) => value.includes(p))) continue

      const found = subjectOfGenderedForm(value)
      if (found.length > 0) problems.push(`${key}: ${found.join(', ')}`)
    }

    expect(problems).toEqual([])
  })

  /*
   * Da provera ne bi tiho prestala da radi. Test koji prolazi zato što ništa ne
   * gleda izgleda isto kao test koji prolazi zato što je sve u redu.
   */
  it('prepoznaje grešku koja je već dvaput prošla', () => {
    expect(subjectOfGenderedForm('Da bi {org} svakog jutra imao svoje brojeve')).toEqual([
      'imao',
    ])
    expect(subjectOfGenderedForm('{kind} nije stigla za {when}')).toEqual(['stigla'])
  })

  it('oznaka ispred dvotačke nije subjekat', () => {
    expect(subjectOfGenderedForm('{kind}: podatak nije stigao za {when}')).toEqual([])
    expect(subjectOfGenderedForm('{org} — izveštaj je stigao')).toEqual([])
  })
})
