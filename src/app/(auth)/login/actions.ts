'use server'

import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { checkRateLimit } from '@/server/http/rate-limit'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { safeInternalPath } from '@/core/shared/safe-path'

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
})

export interface LoginState {
  readonly error?: 'invalid_credentials' | 'rate_limited' | 'invalid_input'
  readonly requestId?: string
}

/**
 * Prijava.
 *
 * Neispravna e-adresa i pogrešna lozinka vraćaju ISTU poruku i ne razlikuju
 * se ni po vremenu odgovora u meri koja bi bila korisna napadaču. Poruka
 * "korisnik ne postoji" je popis naloga u obliku poruke o grešci.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const headerList = await headers()
  const reqId = makeRequestId(headerList)

  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })

  if (!parsed.success) return { error: 'invalid_input', requestId: reqId }

  // Ograničenje ide po e-adresi I po IP-u: prvo zaustavlja probijanje jednog
  // naloga, drugo raspršeno pogađanje kroz mnogo naloga.
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const byEmail = checkRateLimit('auth', `email:${parsed.data.email.toLowerCase()}`)
  const byIp = checkRateLimit('auth', `ip:${ip}`)

  if (!byEmail.allowed || !byIp.allowed) {
    logger.warn('Prijava ograničena brojem pokušaja', { requestId: reqId })
    return { error: 'rate_limited', requestId: reqId }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
        },
      },
    },
  )

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Poruka iz auth servera ostaje u logu; korisnik dobija neutralan tekst.
    logger.info('Neuspela prijava', { requestId: reqId, reason: error.name })
    return { error: 'invalid_credentials', requestId: reqId }
  }

  // typedRoutes traži statički poznatu rutu. Ovde je putanja dinamička, ali
  // je safeInternalPath već sveo na bezbedan oblik unutar aplikacije.
  redirect(safeInternalPath(parsed.data.next) as Route)
}
