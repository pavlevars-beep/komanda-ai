'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLocale } from '@/i18n/config'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/server/http/locale'

/**
 * Prebacivanje jezika.
 *
 * Namerno bez guard-a za prijavljene korisnike: prekidač mora da radi i na
 * stranici za prijavu, gde korisnika još nema. Akcija ne čita i ne menja
 * nijedan podatak — upisuje jedan kolačić, i to samo ako je vrednost jedan od
 * poznatih jezika. Nepoznata vrednost se tiho odbacuje, pa se kroz nju ne može
 * podmetnuti ništa.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const requested = formData.get('locale')
  if (!isLocale(requested)) return

  const store = await cookies()
  store.set(LOCALE_COOKIE, requested, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    // Nije tajna i ne nosi ništa o korisniku, ali nema razloga da je čita skripta.
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  revalidatePath('/', 'layout')
}
