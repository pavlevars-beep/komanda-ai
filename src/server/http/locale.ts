import 'server-only'
import { cookies, headers } from 'next/headers'
import { resolveLocale, type Locale } from '@/i18n/config'

/**
 * Jezik za trenutni zahtev.
 *
 * Postoji da bi SVE stranice birale jezik na isti način. Ranije su javne
 * stranice čitale kolačić i `Accept-Language`, a prijavljene samo profil — pa
 * je isti korisnik dobijao prijavu na engleskom a konzolu na srpskom, i
 * prekidač nije radio nigde jer kolačić niko nije ni upisivao.
 */

export const LOCALE_COOKIE = 'locale'

/** Godinu dana — izbor jezika nije nešto što treba ponavljati na svakoj poseti. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export async function requestLocale(userLocale?: string | null): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])

  return resolveLocale({
    chosenLocale: cookieStore.get(LOCALE_COOKIE)?.value ?? null,
    userLocale: userLocale ?? null,
    acceptLanguage: headerList.get('accept-language'),
  })
}
