import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { listMemberships } from '@/core/tenancy/workspace-repository'

/**
 * Ulazna tačka: korisnik se šalje tamo gde pripada.
 *
 * Delta Pro osoblje ide u konzolu; klijentski korisnik u svoj radni prostor.
 * Ako nema nijedno članstvo, dobija jasno objašnjenje umesto praznog ekrana.
 */
export default async function RootPage() {
  const db = await userDb()
  const user = await currentUser(db)

  if (!user) redirect('/login')
  if (user.staffRole) redirect('/console')

  const memberships = await listMemberships(db)
  const first = memberships.ok ? memberships.value[0] : undefined

  if (!first) redirect('/no-access')
  // Slug dolazi iz baze i već je ograničen CHECK-om na organizations.slug.
  redirect(`/w/${first.organizationSlug}` as Route)
}
