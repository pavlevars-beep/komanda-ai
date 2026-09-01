import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'

/**
 * Sesija pristupa poslovnim podacima klijenta.
 *
 * Jedini put kojim Delta Pro osoblje dolazi do sadržaja klijentovih podataka.
 * Baza sprovodi ista pravila kroz ograničenja i RLS politike — ovde su
 * ponovljena da bi korisnik dobio razumljivu poruku umesto greške iz baze,
 * a ne zato što se na aplikativnu proveru oslanjamo.
 */

export const REASON_MIN = 10
export const REASON_MAX = 500

export const startSessionInput = z.object({
  organizationId: uuid(),
  reason: z
    .string()
    .trim()
    .min(REASON_MIN, 'impersonation.error.reasonTooShort')
    .max(REASON_MAX, 'impersonation.error.reasonTooLong'),
  scope: z.enum(['read_only', 'full']),
  durationMinutes: z.coerce.number().int().min(5).max(480),
})

export type StartSessionInput = z.infer<typeof startSessionInput>

export interface StartedSession {
  readonly sessionId: string
  readonly expiresAt: string
}

export async function startAccessSession(
  db: Db,
  staffUserId: string,
  input: StartSessionInput,
  maxMinutes: number,
): Promise<Result<StartedSession>> {
  // Trajanje se seče na politiku okruženja; korisnik ne može da je nadmaši
  // ni ako pošalje veću vrednost mimo forme.
  const minutes = Math.min(input.durationMinutes, maxMinutes)
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString()

  const { data, error } = await db
    .from('impersonation_sessions')
    .insert({
      staff_user_id: staffUserId,
      organization_id: input.organizationId,
      reason: input.reason,
      scope: input.scope,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single()

  if (error) {
    // RLS odbija pokretanje nad organizacijom na koju osoblje nije dodeljeno.
    // Poruka iz baze ostaje interna.
    return err(
      domainError('forbidden', 'impersonation.error.notAllowed', { detail: error.message }),
    )
  }

  const row = z.object({ id: uuid(), expires_at: z.string() }).safeParse(data)
  if (!row.success) {
    return err(domainError('internal', 'error.internal', { detail: row.error.message }))
  }

  return ok({ sessionId: row.data.id, expiresAt: row.data.expires_at })
}

/**
 * Zatvara sesiju.
 *
 * Ne prima ništa osim identifikatora: RLS odlučuje sme li pozivalac da je
 * zatvori (vlasnik sesije ili administrator klijenta), a trigger u bazi
 * dozvoljava isključivo zatvaranje — ne i izmenu razloga, opsega ili trajanja.
 */
export async function endAccessSession(
  db: Db,
  sessionId: string,
  endedBy: string,
): Promise<Result<true>> {
  const { error, count } = await db
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), ended_by: endedBy }, { count: 'exact' })
    .eq('id', sessionId)
    .is('ended_at', null)

  if (error) {
    return err(domainError('forbidden', 'impersonation.error.cannotEnd', { detail: error.message }))
  }
  if (count === 0) {
    // Sesija ne postoji, već je zatvorena, ili je pozivalac ne vidi.
    // Sva tri slučaja daju isti odgovor.
    return err(domainError('not_found', 'impersonation.error.notFound'))
  }

  return ok(true)
}
