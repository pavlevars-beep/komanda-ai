import type { Locale } from '@/i18n/config'
import type { StaffRole } from './permissions'

/** Prijavljeni korisnik, bez konteksta organizacije. */
export interface AuthUser {
  readonly id: string
  readonly email: string
  readonly fullName: string | null
  readonly locale: Locale | null
  readonly theme: 'light' | 'dark' | 'system'
  readonly staffRole: StaffRole | null
}

/** Jedno članstvo, za prekidač organizacija i početno preusmeravanje. */
export interface Membership {
  readonly organizationId: string
  readonly organizationSlug: string
  readonly organizationName: string
  readonly roleKey: string
  readonly isDemo: boolean
}
