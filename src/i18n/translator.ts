import { INTL_LOCALE, type Locale } from './config'
import { sr, type MessageKey, type Messages } from './messages/sr'
import { en } from './messages/en'

const CATALOGUE: Record<Locale, Messages> = { sr, en }

export type TranslateParams = Readonly<Record<string, string | number>>

export interface Translator {
  readonly locale: Locale
  /** Prevodi ključ i umeće parametre oblika {naziv}. */
  t: (key: MessageKey, params?: TranslateParams) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string
  formatRelative: (value: Date | string, now?: Date) => string
}

/**
 * Umeće parametre oblika {naziv}.
 *
 * Izvezeno jer ga koriste i klijentske komponente. Serverska komponenta ne
 * sme da prosledi funkciju klijentskoj — React to odbija pri serijalizaciji —
 * pa se prosleđuje ŠABLON, a umetanje se radi na klijentu.
 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function createTranslator(locale: Locale): Translator {
  const messages = CATALOGUE[locale]
  const intl = INTL_LOCALE[locale]

  return {
    locale,

    t(key, params) {
      // Ključ je tipiziran, pa promašaj znači grešku u katalogu, ne u pozivu.
      return interpolate(messages[key], params)
    },

    formatNumber(value, options) {
      return new Intl.NumberFormat(intl, options).format(value)
    },

    formatDate(value, options) {
      const date = typeof value === 'string' ? new Date(value) : value
      return new Intl.DateTimeFormat(
        intl,
        options ?? { dateStyle: 'medium', timeStyle: 'short' },
      ).format(date)
    },

    formatRelative(value, now = new Date()) {
      const date = typeof value === 'string' ? new Date(value) : value
      const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
      const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' })

      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31_536_000],
        ['month', 2_592_000],
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
      ]
      for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
      }
      return rtf.format(seconds, 'second')
    },
  }
}

/**
 * Rečnik prevoda za prosleđivanje klijentskoj komponenti.
 *
 * Postoji zbog stvarnog kvara: kroz ceo projekat su klijentske komponente
 * dobijale funkciju `(key) => t(key)` da bi prevele poruku koju akcija vrati
 * tek pri izvršavanju. Funkcija ne može da pređe granicu server→klijent i
 * render puca — a to se vidi tek kada se ekran stvarno otvori.
 *
 * Umesto funkcije prosleđuje se OBIČAN OBJEKAT sa ključevima koji toj
 * komponenti mogu zatrebati. Serijalizuje se bez problema.
 *
 * Prosleđuje se samo ono što komponenti treba, po prefiksu — ceo katalog na
 * svakoj stranici bio bi nepotrebna težina.
 */
export function messagesFor(
  locale: Locale,
  prefixes: readonly string[],
): Record<string, string> {
  const catalogue = CATALOGUE[locale]
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(catalogue)) {
    if (prefixes.some((p) => key.startsWith(p))) out[key] = value
  }

  return out
}

export type { MessageKey }

/**
 * Da li je vrednost ključ iz kataloga.
 *
 * Postoji zbog jednog konkretnog rizika: predlog radnje prosleđuje ključ kroz
 * adresu, a adresu piše ko god hoće. Bez ove provere bi se kroz upitni
 * parametar mogao podmetnuti proizvoljan tekst i poslati celoj upravi pod
 * izgledom poruke koju je sistem predložio.
 *
 * Prihvata se SAMO ono što stvarno postoji u katalogu; sve ostalo pada.
 */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.hasOwn(sr, value)
}
