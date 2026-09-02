import 'server-only'
import { adminAuth } from '../db/admin-client'
import { env } from '../env'
import { logger } from '../logger'
import { err, ok, domainError, type Result } from '@/core/shared/result'
import { normalizeEmail, type InvitationProvider } from '@/core/organizations/invitations'

/**
 * Pozivnice preko Supabase Auth Admin API-ja.
 *
 * Ovo je JEDINO mesto u pozivanju korisnika koje koristi servisnu rolu, i radi
 * isključivo sa `auth.users` — nijedan upit odavde ne dodiruje tabele u
 * vlasništvu organizacije. Dodela članstva ide korisničkim klijentom, pod
 * RLS-om, u `inviteMember`.
 */

/**
 * Koliko stranica naloga se pregleda kada Auth javi da adresa već postoji.
 *
 * Supabase JS klijent nema pretragu po e-adresi, samo listanje sa
 * stranicama. Granica postoji da jedan poziv ne bi prelistao ceo direktorijum;
 * kada se ne nađe unutar nje, vraća se JASNA greška umesto tihog promašaja.
 */
const MAX_LOOKUP_PAGES = 20
const LOOKUP_PAGE_SIZE = 200

/** Da li greška iz Auth-a znači „nalog sa tom adresom već postoji". */
export function isExistingAccountError(message: string, code?: string): boolean {
  if (code === 'email_exists' || code === 'user_already_exists') return true
  return /already (been )?registered|already exists|email_exists/i.test(message)
}

export function supabaseInvitationProvider(): InvitationProvider {
  return {
    async ensureUser(rawEmail: string): Promise<Result<{ userId: string; created: boolean }>> {
      const email = normalizeEmail(rawEmail)
      const admin = adminAuth()

      const invited = await admin.inviteUserByEmail(email, {
        // Adresa na koju vodi link iz pozivnice. Ovo je jedini stvarni potrošač
        // APP_URL-a, pa promenljiva više nije samo dekoracija u šemi okruženja.
        redirectTo: `${env().APP_URL}/auth/callback`,
      })

      if (!invited.error && invited.data.user) {
        return ok({ userId: invited.data.user.id, created: true })
      }

      const message = invited.error?.message ?? 'nepoznata greška'

      // Postojeći nalog nije greška: ista osoba može da radi za dva klijenta.
      // Tada se ne pravi novi nalog nego se pronalazi postojeći.
      if (invited.error && isExistingAccountError(message, invited.error.code)) {
        const found = await findUserByEmail(admin, email)
        if (found) return ok({ userId: found, created: false })

        return err(
          domainError('conflict', 'members.error.accountLookupFailed', {
            detail: `nalog za ${email} postoji, ali nije nađen u ${MAX_LOOKUP_PAGES} stranica`,
          }),
        )
      }

      // Poruka iz Auth-a ostaje u logu; korisnik dobija prevodiv ključ.
      logger.error('Pozivnica nije poslata', {
        component: 'invite',
        error: message,
      })
      return err(domainError('internal', 'members.error.inviteFailed', { detail: message }))
    },
  }
}

type AuthAdminClient = ReturnType<typeof adminAuth>

async function findUserByEmail(admin: AuthAdminClient, email: string): Promise<string | null> {
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page += 1) {
    const { data, error } = await admin.listUsers({
      page,
      perPage: LOOKUP_PAGE_SIZE,
    })
    if (error) return null

    const match = data.users.find((u) => normalizeEmail(u.email ?? '') === email)
    if (match) return match.id

    if (data.users.length < LOOKUP_PAGE_SIZE) return null
  }

  return null
}
