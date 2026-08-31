import type { Permission } from '../auth/permissions'
import type { StaffRole } from '../auth/permissions'
import type { Locale } from '@/i18n/config'

/**
 * Kontekst organizacije za jedan zahtev.
 *
 * Sklapa ga isključivo server, iz autentikovane sesije i putanje. Nijedno
 * polje ne dolazi iz tela zahteva, zaglavlja, upitnog parametra — niti iz
 * argumenata koje pošalje jezički model.
 *
 * Tip je `readonly` do kraja da se ne bi mogao izmeniti nizvodno.
 */
export interface OrgContext {
  readonly organizationId: string
  readonly organizationSlug: string
  readonly organizationName: string
  readonly locale: Locale
  readonly currency: string
  readonly timezone: string
  readonly isDemo: boolean

  readonly userId: string
  readonly userName: string | null
  readonly permissions: readonly Permission[]

  /** Popunjeno samo kada je pozivalac Delta Pro osoblje. */
  readonly staff?: {
    readonly role: StaffRole
    /** Id aktivne sesije pristupa. Bez njega osoblje nema poslovne podatke. */
    readonly impersonationSessionId: string | null
    readonly impersonationExpiresAt: string | null
  }

  readonly requestId: string
}

export function hasPermission(ctx: OrgContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission)
}

/**
 * Da li je pozivalac Delta Pro osoblje koje trenutno gleda podatke klijenta.
 * Koristi se za traku upozorenja u oba radna prostora.
 */
export function isImpersonating(ctx: OrgContext): boolean {
  return Boolean(ctx.staff?.impersonationSessionId)
}
