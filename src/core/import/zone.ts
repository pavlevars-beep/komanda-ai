/**
 * Lokalno vreme u zadatoj vremenskoj zoni, bez ijedne zavisnosti.
 *
 * Ritam uvoza se dogovara u lokalnom vremenu firme („radnim danima do 08:00"),
 * a čuva i poredi u UTC-u. Prevod između to dvoje mora da uzme u obzir letnje
 * računanje vremena: 08:00 u Beogradu je 07:00 UTC leti, a 06:00 UTC zimi.
 * Fiksni pomeraj bi dva puta godišnje pomerio rok za sat vremena — taman
 * toliko da alarm krene da se javlja bez razloga, ili da izostane kad treba.
 *
 * `Intl` nosi punu bazu vremenskih zona, uključujući istorijske promene
 * pravila, pa se ovde koristi kao izvor istine umesto sopstvene tabele.
 */

const partsFormatter = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatter.get(timeZone)
  if (cached) return cached

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  partsFormatter.set(timeZone, created)
  return created
}

export interface LocalParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

/** Da li zona uopšte postoji — pogrešan naziv ne sme da sruši proračun. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone).format(0)
    return true
  } catch {
    return false
  }
}

/** Zidni sat u zoni, za dati trenutak. */
export function localParts(instant: number, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant))
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)
    return found ? Number(found.value) : 0
  }

  // `hour12: false` u nekim okruženjima daje 24 umesto 0 za ponoć.
  const hour = read('hour')

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Pomeraj zone u milisekundama za dati trenutak (istok pozitivan). */
function offsetAt(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant
}

/**
 * Lokalni zidni sat → trenutak u UTC-u.
 *
 * U dva prolaza: prvi pomeraj je pogodak na osnovu nagađanja, drugi se meri na
 * pogođenom trenutku. Bez drugog prolaza bi vreme neposredno oko pomeranja sata
 * palo na pogrešnu stranu prelaza.
 *
 * Zidni sat koji ne postoji (sat koji se preskače u proleće) se prevodi u prvi
 * trenutak posle preskoka — rok od 02:30 na taj dan pada u 03:00, umesto da
 * ispadne nevažeći.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  const firstGuess = asUtc - offsetAt(asUtc, timeZone)
  return asUtc - offsetAt(firstGuess, timeZone)
}

/** ISO dan u nedelji: ponedeljak 1 … nedelja 7. */
export function isoWeekday(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

/** Pomeranje kalendarskog dana, bez uticaja zone (računa se nad datumom). */
export function shiftDay(
  year: number,
  month: number,
  day: number,
  by: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + by))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}
