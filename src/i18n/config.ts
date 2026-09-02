/**
 * Podrazumevani jezik je srpski (latinica). Engleski je prekidač.
 *
 * URL putanje ostaju neutralne i ne menjaju se sa jezikom — deljeni link
 * mora da radi bez obzira na to koji jezik primalac koristi.
 */

export const LOCALES = ['sr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'sr'

/** BCP 47 oznake za Intl formatiranje. */
export const INTL_LOCALE: Record<Locale, string> = {
  sr: 'sr-Latn-RS',
  en: 'en-GB',
}

export const LOCALE_LABEL: Record<Locale, string> = {
  sr: 'Srpski',
  en: 'English',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Redosled izbora jezika: izričit izbor -> profil korisnika -> podešavanje
 * organizacije -> Accept-Language -> podrazumevani.
 *
 * `chosenLocale` je prvi jer je to jedina stavka koju je korisnik upravo
 * kliknuo. Da profil ima prednost, prekidač na ekranu ne bi radio za
 * prijavljenog korisnika — dugme koje izgleda da radi a ne radi.
 */
export function resolveLocale(input: {
  // `| undefined` je eksplicitno zbog exactOptionalPropertyTypes: polje sme
  // da nedostaje, ali sme i da bude prosleđeno kao undefined.
  chosenLocale?: string | null | undefined
  userLocale?: string | null | undefined
  organizationLocale?: string | null | undefined
  acceptLanguage?: string | null | undefined
}): Locale {
  if (isLocale(input.chosenLocale)) return input.chosenLocale
  if (isLocale(input.userLocale)) return input.userLocale
  if (isLocale(input.organizationLocale)) return input.organizationLocale

  const header = input.acceptLanguage ?? ''
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? ''
    if (tag.startsWith('sr')) return 'sr'
    if (tag.startsWith('en')) return 'en'
  }
  return DEFAULT_LOCALE
}
