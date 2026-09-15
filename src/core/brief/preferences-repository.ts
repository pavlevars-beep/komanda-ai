import { z } from 'zod'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import type { BriefSection } from './focus'
import type { BriefPreference } from './preferences'

/**
 * Čitanje i upis ličnog izbora odeljaka.
 *
 * Odvojeno od `preferences.ts`, koji ostaje čist: razrešavanje redosleda se
 * koristi i u komponentama, a uvoz baze iz tog modula bi povukao Zod i klijenta
 * baze u pregledač.
 */

const SECTIONS = ['sales', 'receivables', 'debtors', 'payables', 'stock'] as const

const preferenceRow = z.object({
  section_order: z.array(z.enum(SECTIONS)),
  hidden_sections: z.array(z.enum(SECTIONS)),
})

export async function getBriefPreference(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<BriefPreference | null> {
  const { data, error } = await db
    .from('brief_preferences')
    .select('section_order, hidden_sections')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()

  // Nepostojeći izbor NIJE greška — to je podrazumevano stanje svakog novog
  // korisnika. Brif se tada slaže po roli, kao i do sada.
  if (error) return null

  const parsed = preferenceRow.safeParse(data)
  if (!parsed.success) return null

  return { order: parsed.data.section_order, hidden: parsed.data.hidden_sections }
}

export async function saveBriefPreference(
  db: Db,
  organizationId: string,
  userId: string,
  preference: BriefPreference,
): Promise<Result<void>> {
  const known = new Set<string>(SECTIONS)
  const clean = (list: readonly BriefSection[]): string[] => [
    ...new Set(list.filter((s) => known.has(s))),
  ]

  const { error } = await db.from('brief_preferences').upsert(
    {
      organization_id: organizationId,
      user_id: userId,
      section_order: clean(preference.order),
      hidden_sections: clean(preference.hidden),
    },
    { onConflict: 'organization_id,user_id' },
  )

  if (error) {
    return err(domainError('forbidden', 'brief.prefs.error.saveFailed', { detail: error.message }))
  }
  return ok(undefined)
}

/** Povratak na redosled po roli. */
export async function resetBriefPreference(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<Result<void>> {
  const { error } = await db
    .from('brief_preferences')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId)

  if (error) {
    return err(domainError('forbidden', 'brief.prefs.error.saveFailed', { detail: error.message }))
  }
  return ok(undefined)
}
