'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { consoleAction, workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { env } from '@/server/env'
import {
  endAccessSession,
  startAccessSession,
  startSessionInput,
} from '@/core/tenancy/impersonation'

export interface AccessSessionState extends ActionResultBase {
  readonly started?: { readonly sessionId: string; readonly expiresAt: string }
  readonly ended?: boolean
  /** Ključevi poruka po polju, za prikaz uz odgovarajući unos. */
  readonly fieldErrors?: Readonly<Record<string, string>>
}

/**
 * Pokretanje sesije pristupa.
 *
 * Razlog je obavezan i mora biti smislen. To nije birokratija: razlog je ono
 * što klijent vidi u traci nad svojim podacima i ono što ostaje u revizionom
 * tragu godinama.
 */
export const startAccessSessionAction = consoleAction<AccessSessionState>(
  { rateLimit: 'write', audit: 'staff.access_session_started' },
  async ({ db, user }, _prev, formData) => {
    const parsed = startSessionInput.safeParse({
      organizationId: formData.get('organizationId'),
      reason: formData.get('reason'),
      scope: formData.get('scope'),
      durationMinutes: formData.get('durationMinutes'),
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    const result = await startAccessSession(
      db,
      user.id,
      parsed.data,
      env().IMPERSONATION_MAX_MINUTES,
    )

    if (!result.ok) return { error: result.error.key }

    revalidatePath('/console', 'layout')
    return { started: result.value }
  },
)

const endInput = z.object({ sessionId: z.string().uuid() })

/** Prekid sesije iz konzole — zatvara je sam konsultant. */
export const endAccessSessionAction = consoleAction<AccessSessionState>(
  { rateLimit: 'write', audit: 'staff.access_session_ended' },
  async ({ db, user }, _prev, formData) => {
    const parsed = endInput.safeParse({ sessionId: formData.get('sessionId') })
    if (!parsed.success) return { error: 'error.invalid_input' }

    const result = await endAccessSession(db, parsed.data.sessionId, user.id)
    if (!result.ok) return { error: result.error.key }

    revalidatePath('/console', 'layout')
    return { ended: true }
  },
)

/**
 * Prekid sesije iz klijentskog radnog prostora.
 *
 * Namerno prolazi kroz workspaceAction, a ne kroz consoleAction: ovo pokreće
 * administrator klijenta, koji nije Delta Pro osoblje. Bez ovoga bi
 * transparentnost bila samo prikaz — klijent bi video ko mu je unutra, ali ne
 * bi mogao ništa da uradi povodom toga.
 */
export const endAccessSessionByClientAction = workspaceAction<AccessSessionState>(
  { rateLimit: 'write', audit: 'staff.access_session_ended_by_client' },
  async ({ db, user }, _prev, formData) => {
    const parsed = endInput.safeParse({ sessionId: formData.get('sessionId') })
    if (!parsed.success) return { error: 'error.invalid_input' }

    const result = await endAccessSession(db, parsed.data.sessionId, user.id)
    if (!result.ok) return { error: result.error.key }

    revalidatePath('/w', 'layout')
    return { ended: true }
  },
)
