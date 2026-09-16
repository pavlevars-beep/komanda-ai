'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { checkRateLimit } from '@/server/http/rate-limit'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { recoveryRedirectUrl } from './redirect-url'

/**
 * Zaboravljena lozinka.
 *
 * Postoji zbog konkretnog kvara: middleware je `/reset-password` i
 * `/auth/callback` držao u javnim putanjama, a nijedna stranica nije
 * postojala. Supabase je slao mejl koji nigde ne sleće, pa je jedini izlaz iz
 * zaključanog naloga bio ručni upis u bazu.
 */

async function authClient() {
  const cookieStore = await cookies()

  return createServerClient(
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
}

export interface RequestState {
  readonly sent?: boolean
  readonly error?: 'rate_limited' | 'invalid_input'
  readonly requestId?: string
}

const emailOnly = z.object({ email: z.string().email().max(254) })

/**
 * Traženje mejla za promenu lozinke.
 *
 * Odgovor je ISTI bez obzira da li nalog postoji. Poruka „taj mejl nije
 * registrovan" je popis naloga u obliku ljubaznosti — isto pravilo koje već
 * važi za prijavu.
 */
export async function requestReset(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const headerList = await headers()
  const reqId = makeRequestId(headerList)

  const parsed = emailOnly.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'invalid_input', requestId: reqId }

  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const byEmail = checkRateLimit('auth', `reset:${parsed.data.email.toLowerCase()}`)
  const byIp = checkRateLimit('auth', `reset-ip:${ip}`)

  if (!byEmail.allowed || !byIp.allowed) {
    logger.warn('Traženje nove lozinke ograničeno brojem pokušaja', { requestId: reqId })
    return { error: 'rate_limited', requestId: reqId }
  }

  const supabase = await authClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: recoveryRedirectUrl(env().APP_URL),
  })

  // Greška se beleži, ali se korisniku NE prikazuje: razlika između „poslato"
  // i „nalog ne postoji" je upravo ono što se ovde krije.
  if (error) logger.info('Mejl za promenu lozinke nije poslat', { requestId: reqId, reason: error.name })

  return { sent: true, requestId: reqId }
}

export interface SetState {
  readonly error?: 'too_short' | 'mismatch' | 'no_session' | 'rejected'
  readonly requestId?: string
}

/*
 * Osam znakova je Supabase-ov podrazumevani minimum. Ista granica stoji i
 * ovde, da bi poruka stigla pre poziva — inače se vraća engleski tekst iz
 * auth servera usred srpskog ekrana.
 */
const MIN_LENGTH = 8

/*
 * Polja se čitaju kroz zod, ne kroz `String(...)`.
 *
 * `formData.get` vraća i `File`, pa bi pretvaranje u nisku dalo „[object
 * File]" — a to je niska od jedanaest znakova, koja bi prošla proveru dužine.
 */
const entries = z.object({
  password: z.string().max(256),
  confirm: z.string().max(256),
})

export async function setNewPassword(_prev: SetState, formData: FormData): Promise<SetState> {
  const headerList = await headers()
  const reqId = makeRequestId(headerList)

  const parsed = entries.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })

  if (!parsed.success) return { error: 'too_short', requestId: reqId }

  const { password, confirm } = parsed.data

  // Dve različite greške, jer traže dve različite radnje od čoveka.
  if (password.length < MIN_LENGTH) return { error: 'too_short', requestId: reqId }
  if (password !== confirm) return { error: 'mismatch', requestId: reqId }

  const supabase = await authClient()

  // Sesija ovde dolazi iz linka u mejlu, kroz /auth/callback. Bez nje se
  // lozinka ne menja — inače bi ova akcija bila način da bilo ko promeni
  // lozinku bilo kome.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'no_session', requestId: reqId }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    logger.info('Promena lozinke odbijena', { requestId: reqId, reason: error.name })
    return { error: 'rejected', requestId: reqId }
  }

  logger.info('Lozinka promenjena', { requestId: reqId })
  redirect('/')
}
