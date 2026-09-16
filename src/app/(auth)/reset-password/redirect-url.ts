/**
 * Gde sleće link iz mejla za promenu lozinke.
 *
 * Ovo je STRUKTURALNI deo priče, ne pomoćna funkcija.
 *
 * Supabase podrazumevano šalje link na „Site URL" iz svog dashboarda. To polje
 * je jedna vrednost, unosi se rukom, i ostane na `http://localhost:3000` sve
 * dok neko ne primeti — a primeti se tek kada čovek zaključan iz naloga klikne
 * na link i dobije „This site can't be reached". Upravo se to i desilo.
 *
 * Zato aplikacija sama kaže gde link ide, iz `APP_URL`, kroz `redirectTo`.
 * Supabase tu vrednost poštuje ako je u spisku dozvoljenih adresa, pa se
 * odredište vezuje za isto okruženje koje je i poslalo mejl: pregled na
 * pregled, produkcija na produkciju. Jedno polje u dashboardu to ne može.
 */

/** Putanja koja prima kod iz mejla i pretvara ga u sesiju. */
export const CALLBACK_PATH = '/auth/callback'

/** Gde se stiže posle razmene koda — stranica za unos nove lozinke. */
export const AFTER_CALLBACK = '/reset-password'

export function recoveryRedirectUrl(appUrl: string): string {
  // `URL` sređuje i duplu kosu crtu i završnu kosu crtu, pa `APP_URL` sme da
  // stigne u oba oblika — a stiže, jer se prekopira iz Vercel-a kako dođe.
  const url = new URL(CALLBACK_PATH, appUrl)
  url.searchParams.set('next', AFTER_CALLBACK)
  return url.toString()
}
