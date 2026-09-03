'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { THEMES, type Theme } from '@/ui/theme/theme'

/*
 * Godinu dana — izbor teme nije nešto što korisnik želi da ponavlja.
 *
 * Namerno NIJE izvezena. Fajl sa `'use server'` sme da izvozi isključivo async
 * funkcije; izvezen broj obara build na koraku prikupljanja stranica, i to sa
 * porukom koja pokazuje na sasvim drugu rutu.
 */
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Prebacivanje svetle i tamne teme.
 *
 * Kao i prekidač jezika: bez guard-a, jer mora da radi i pre prijave. Akcija
 * ne dodiruje nijedan podatak — upisuje jedan kolačić, i to samo ako je
 * vrednost jedna od poznatih tema.
 *
 * Kolačić NIJE httpOnly, za razliku od jezika. Razlog je konkretan: tema se
 * čita u `layout.tsx` pri svakom renderu, ali i skripta koja bi jednog dana
 * sprečila blesak pogrešne teme pri učitavanju mora da je pročita. Vrednost je
 * jedna od tri poznate reči i ne nosi ništa o korisniku.
 */
export async function setThemeAction(formData: FormData): Promise<void> {
  const requested = formData.get('theme')
  if (typeof requested !== 'string' || !THEMES.includes(requested as Theme)) return

  const store = await cookies()
  store.set('theme', requested, {
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  revalidatePath('/', 'layout')
}
