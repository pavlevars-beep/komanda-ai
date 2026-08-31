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

function interpolate(template: string, params?: TranslateParams): string {
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

export type { MessageKey }
