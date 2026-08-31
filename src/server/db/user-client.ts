import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Db } from './types'
import { env } from '../env'

/**
 * Klijent baze vezan za prijavljenog korisnika.
 *
 * Koristi ANON ključ i korisnikov JWT, pa RLS važi i za naš serverski kod.
 * To je namerno: kada bi server radio sa service_role ključem, sve politike
 * koje smo napisali bile bi zaobiđene upravo tamo gde je najviše koda i
 * najveća šansa za grešku.
 */
export async function userDb(): Promise<Db> {
  const cookieStore = await cookies()

  return createServerClient(env().NEXT_PUBLIC_SUPABASE_URL, env().NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server komponente ne smeju da postavljaju kolačiće. Osvežavanje
          // sesije obavlja middleware, pa je ovo bezopasno.
        }
      },
    },
  })
}
