import { isoWeekday, localParts, shiftDay, zonedTimeToInstant } from './zone'

/**
 * Ritam uvoza i alarm na tišinu.
 *
 * Najopasniji kvar u ovom proizvodu nije pogrešan broj nego IZOSTANAK podatka:
 * tabela ne stigne, a sistem nastavlja da radi i prikazuje jučerašnje brojeve
 * kao današnje. Niko ne vidi grešku jer greške nema — postoji samo tišina.
 *
 * Zato se očekivanje zapisuje unapred („radnim danima do 08:00"), a njegovo
 * neispunjenje je događaj koji se prijavljuje. Bez zapisanog očekivanja sistem
 * nema prema čemu da izmeri tišinu i mora da je prećuti.
 *
 * Ovaj modul NE zna za bazu, mrežu ni sistemski sat — trenutak se prosleđuje.
 * Zbog toga se ponašanje u praznik, preko vikenda i na pomeranju sata proverava
 * testom, umesto čekanjem da se taj dan desi.
 */

export interface Cadence {
  /** ISO dani kada se podatak očekuje: ponedeljak 1 … nedelja 7. */
  readonly weekdays: readonly number[]
  /** Lokalno vreme do kojeg se očekuje, „HH:MM". */
  readonly byTime: string
  readonly timeZone: string
  /** Koliko se kasnjenja toleriše pre nego što se oglasi. */
  readonly graceMinutes: number
  /** Rokovi pre ovog trenutka se ne broje — pre njega dogovora nije bilo. */
  readonly activeFrom: string
  /** Dok traje, tišina se ne prijavljuje (kolektivni odmor, praznici). */
  readonly pausedUntil?: string | null
}

export type CadenceState =
  /** Poslednji rok je ispunjen. */
  | 'onTime'
  /** Ijedan rok još nije prošao — nema se šta oceniti. */
  | 'awaiting'
  /** Tačno jedan rok je propušten. */
  | 'late'
  /** Dva ili više uzastopnih rokova propušteno. */
  | 'missing'
  /** Rokovi prolaze, a podatak nije stigao nijednom. */
  | 'never'
  | 'paused'

export interface CadenceVerdict {
  readonly state: CadenceState
  /** Poslednji rok koji je prošao (bez tolerancije), ISO. */
  readonly dueAt: string | null
  /** Prvi naredni rok, ISO. */
  readonly nextDueAt: string | null
  /** Rok od kojeg traje neprekidna tišina, ISO. */
  readonly silentSince: string | null
  readonly missedPeriods: number
  readonly lastArrivalAt: string | null
}

/**
 * Dokle se gleda unazad. Ograničenje je nužno — bez njega bi klijent koji je
 * ugašen pre godinu dana pravio proračun preko tri stotine rokova pri svakom
 * učitavanju. Sve preko dva propuštena roka ionako daje isti zaključak.
 */
const LOOKBACK_DAYS = 45

/** Dokle se traži naredni rok. Duže od dve nedelje znači da ritam ne postoji. */
const LOOKAHEAD_DAYS = 21

const MINUTE = 60_000
const DAY = 86_400_000

export function parseByTime(byTime: string): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(byTime)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

/**
 * Rokovi u opsegu, rastuće. Rok je trenutak lokalnog `byTime` na dan koji je u
 * dogovorenim danima nedelje.
 */
function deadlinesBetween(
  cadence: Cadence,
  fromInstant: number,
  toInstant: number,
): number[] {
  const time = parseByTime(cadence.byTime)
  if (!time || cadence.weekdays.length === 0) return []

  const days = new Set(cadence.weekdays)
  const out: number[] = []

  // Kreće se od dana pre početka opsega: rok tog dana u zoni istočno od UTC-a
  // može da padne unutar opsega iako mu je datum ranije.
  const start = localParts(fromInstant - DAY, cadence.timeZone)
  let cursor = { year: start.year, month: start.month, day: start.day }

  const limit = Math.ceil((toInstant - fromInstant) / DAY) + 3

  for (let i = 0; i < limit; i += 1) {
    if (days.has(isoWeekday(cursor.year, cursor.month, cursor.day))) {
      const at = zonedTimeToInstant(
        cursor.year,
        cursor.month,
        cursor.day,
        time.hour,
        time.minute,
        cadence.timeZone,
      )
      if (at >= fromInstant && at <= toInstant) out.push(at)
    }
    cursor = shiftDay(cursor.year, cursor.month, cursor.day, 1)
  }

  return out.sort((a, b) => a - b)
}

function timeOf(iso: string): number | null {
  const value = new Date(iso).getTime()
  return Number.isNaN(value) ? null : value
}

/**
 * Ocena ritma.
 *
 * `arrivals` su trenuci stvarnih uvoza — ne samo poslednji. Sa jednim jedinim
 * podatkom se ne može razlikovati „stiglo juče pa danas izostalo" od „ništa
 * nije stiglo cele nedelje", a to su dve različite poruke klijentu.
 *
 * Broji se NEPREKIDNI niz propuštenih rokova unazad od poslednjeg. Ukupan broj
 * propuštenih bi jednom davnom greškom zauvek obojio ispravno stanje.
 */
export function evaluateCadence(
  cadence: Cadence,
  arrivals: readonly string[],
  now: Date,
): CadenceVerdict {
  const nowMs = now.getTime()
  const graceMs = Math.max(0, cadence.graceMinutes) * MINUTE

  const activeFrom = timeOf(cadence.activeFrom) ?? nowMs
  const windowStart = Math.max(activeFrom, nowMs - LOOKBACK_DAYS * DAY)

  const times = arrivals
    .map(timeOf)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b)

  const lastArrival = times.length > 0 ? times[times.length - 1]! : null

  const upcoming = deadlinesBetween(cadence, nowMs, nowMs + LOOKAHEAD_DAYS * DAY).find(
    (d) => d > nowMs,
  )
  const nextDueAt = upcoming === undefined ? null : new Date(upcoming).toISOString()

  // Rok se smatra prošlim tek kada istekne i tolerancija — u toku tolerancije
  // se ćuti, jer kašnjenje od par minuta nije vest.
  const passed = deadlinesBetween(cadence, windowStart, nowMs).filter(
    (d) => d + graceMs <= nowMs,
  )

  const base = {
    nextDueAt,
    lastArrivalAt: lastArrival === null ? null : new Date(lastArrival).toISOString(),
  }

  const paused = cadence.pausedUntil ? timeOf(cadence.pausedUntil) : null
  if (paused !== null && nowMs < paused) {
    return { ...base, state: 'paused', dueAt: null, silentSince: null, missedPeriods: 0 }
  }

  if (passed.length === 0) {
    return { ...base, state: 'awaiting', dueAt: null, silentSince: null, missedPeriods: 0 }
  }

  const dueAt = new Date(passed[passed.length - 1]!).toISOString()

  /*
   * Period roka traje od isteka tolerancije prethodnog roka do isteka
   * sopstvene. Time je vremenska osa podeljena bez rupa i preklapanja, pa svaki
   * uvoz pripada tačno jednom roku — i uvoz u 07:00 uredno pokriva rok u 08:00.
   */
  const satisfied = (index: number): boolean => {
    const end = passed[index]! + graceMs
    const start = index === 0 ? windowStart : passed[index - 1]! + graceMs
    return times.some((t) => t > start && t <= end)
  }

  let missed = 0
  for (let i = passed.length - 1; i >= 0; i -= 1) {
    if (satisfied(i)) break
    missed += 1
  }

  if (missed === 0) {
    return { ...base, state: 'onTime', dueAt, silentSince: null, missedPeriods: 0 }
  }

  const silentSince = new Date(passed[passed.length - missed]!).toISOString()

  // Nijedan uvoz ikada nije stigao: to nije prekid nego neuspostavljen dotok, i
  // razgovor sa klijentom je drugi — proverava se podešavanje, ne kvar.
  const state: CadenceState = lastArrival === null ? 'never' : missed === 1 ? 'late' : 'missing'

  return { ...base, state, dueAt, silentSince, missedPeriods: missed }
}

/** Stanja koja traže reakciju čoveka. */
export function needsAttention(state: CadenceState): boolean {
  return state === 'late' || state === 'missing' || state === 'never'
}

export function cadenceSeverity(state: CadenceState): 'info' | 'warning' | 'critical' {
  if (state === 'missing' || state === 'never') return 'critical'
  if (state === 'late') return 'warning'
  return 'info'
}
