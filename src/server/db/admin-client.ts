import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Db } from './types'
import { env } from '../env'

/**
 * ⚠ ZAOBILAZI RLS.
 *
 * Dozvoljeni pozivaoci — i nijedan drugi:
 *   • migracije i seed
 *   • pozadinski poslovi bez korisnika u kontekstu (provere zdravlja,
 *     zakazani izveštaji, obrada reda poslova agenta)
 *   • upravljanje nalozima u `auth.users` (pozivnice), kroz `adminAuth()` —
 *     jedini put koji ne dodiruje nijednu tabelu u vlasništvu organizacije
 *
 * Uvoz ovog modula iz `src/app/**` i `src/core/**` obara lint. To nije
 * formalnost: jedan zaboravljen filter po organizaciji ovde poništava ceo
 * model izolacije.
 *
 * Svaki upit odavde MORA da eksplicitno filtrira po organization_id.
 */
export function adminDb(): Db {
  const key = env().SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY nije podešen. Admin klijent je dostupan samo u okruženjima koja ga imaju.',
    )
  }

  // createClient je generički i bez šeme vraća SupabaseClient<any>.
  // Sužavamo ga na Db jednom, ovde, umesto da se `any` širi dalje.
  return createClient(env().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as Db
}

/**
 * ⚠ ZAOBILAZI RLS — ali samo nad `auth` šemom.
 *
 * Postoji da bi se servisna rola stvarala na JEDNOM mestu. Da provajder
 * pozivnica pravi svoj klijent, guard u lint-u bi ostao netaknut a granica
 * probijena: service_role bi izlazio iz modula koji niko ne čuva.
 *
 * Koristi se isključivo za `auth.admin` pozive. Dodela članstva organizaciji
 * ide korisničkim klijentom, pod RLS-om.
 */
export function adminAuth(): SupabaseClient['auth']['admin'] {
  const key = env().SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY nije podešen. Upravljanje nalozima traži servisnu rolu.',
    )
  }

  return createClient(env().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin
}
