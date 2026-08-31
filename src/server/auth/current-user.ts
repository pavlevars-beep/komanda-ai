import 'server-only'
import { z } from 'zod'
import type { Db } from '../db/types'
import type { AuthUser } from '@/core/auth/session'
import { STAFF_ROLES } from '@/core/auth/permissions'
import { isLocale } from '@/i18n/config'

const profileRow = z.object({
  full_name: z.string().nullable(),
  locale: z.string().nullable(),
  theme: z.enum(['light', 'dark', 'system']),
})

const staffRow = z.object({
  staff_role: z.enum(STAFF_ROLES),
  is_active: z.boolean(),
})

/**
 * Trenutno prijavljeni korisnik.
 *
 * Koristi se `auth.getUser()`, a NIKAD `auth.getSession()`.
 *
 * getSession čita korisnika iz kolačića i veruje mu. Na serveru se kolačić
 * mora smatrati podatkom koji dolazi od klijenta; getUser proverava token kod
 * auth servera. Razlika je između provere i pretpostavke.
 */
export async function currentUser(db: Db): Promise<AuthUser | null> {
  const {
    data: { user },
    error,
  } = await db.auth.getUser()

  if (error || !user?.email) return null

  const [{ data: profileData }, { data: staffData }] = await Promise.all([
    db.from('user_profiles').select('full_name, locale, theme').eq('id', user.id).maybeSingle(),
    db.from('platform_staff').select('staff_role, is_active').eq('user_id', user.id).maybeSingle(),
  ])

  const profile = profileRow.safeParse(profileData)
  const staff = staffRow.safeParse(staffData)

  return {
    id: user.id,
    email: user.email,
    fullName: profile.success ? profile.data.full_name : null,
    locale: profile.success && isLocale(profile.data.locale) ? profile.data.locale : null,
    theme: profile.success ? profile.data.theme : 'system',
    // Neaktivan nalog osoblja je isto što i nalog koji nije osoblje.
    staffRole: staff.success && staff.data.is_active ? staff.data.staff_role : null,
  }
}
