import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, notFound, type Result } from '../shared/result'

/**
 * Pozivanje korisnika u organizaciju klijenta.
 *
 * Nalog u `auth.users` pravi provajder (Supabase Auth Admin API), a članstvo
 * se upisuje kroz korisnički klijent, pod RLS-om. Ta podela je namerna: kreiranje
 * naloga traži servisnu rolu, ali dodela pristupa organizaciji ne sme da je
 * koristi — inače bi jedan zaboravljen filter dodelio članstvo u tuđoj
 * organizaciji, a RLS to ne bi ni video.
 */

/** Šta poziv od nas traži od sistema za autentikaciju. */
export interface InvitationProvider {
  /**
   * Vraća identifikator naloga za datu e-adresu, praveći ga ako ne postoji.
   *
   * Postojeći nalog NIJE greška. Ista osoba može da radi za dva klijenta, pa
   * se u tom slučaju samo dodaje novo članstvo.
   */
  ensureUser(email: string): Promise<Result<{ userId: string; created: boolean }>>
}

/**
 * E-adresa se normalizuje pre upotrebe.
 *
 * Bez ovoga bi `Pera@Firma.RS ` i `pera@firma.rs` bile dve različite osobe u
 * sistemu — jedna sa članstvom, druga sa nalogom.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export const inviteInput = z.object({
  organizationId: uuid(),
  email: z
    .string()
    .trim()
    .min(1, 'members.error.emailRequired')
    .transform(normalizeEmail)
    .pipe(z.string().email('members.error.emailInvalid')),
  /**
   * KLJUČ role, ne njen identifikator.
   *
   * Forma nikad ne šalje `role_id`. Da ga šalje, izmenjen zahtev bi mogao da
   * podmetne identifikator platformske role i time napravi člana sa pravima
   * Delta Pro osoblja. Ovako se ključ razrešava u bazi, i to samo među rolama
   * koje ta organizacija sme da dodeli.
   */
  roleKey: z.string().trim().min(2).max(40),
})

export type InviteInput = z.input<typeof inviteInput>

const assignableRoleRow = z.object({
  id: uuid(),
  key: z.string(),
  name: z.record(z.string(), z.string()),
})

export type AssignableRole = z.infer<typeof assignableRoleRow>

/**
 * Role koje se smeju dodeliti članu ove organizacije.
 *
 * Isključivo `scope = 'client'`. Platformske role pripadaju Delta Pro osoblju
 * i ne dodeljuju se kroz članstvo — osoblje ima svoj put kroz `platform_staff`
 * i sesije pristupa. Da se ovde propuste, pozivnica bi bila tiši način da se
 * dobiju prava koja taj tok namerno ne daje.
 */
export async function listAssignableRoles(
  db: Db,
  organizationId: string,
): Promise<Result<AssignableRole[]>> {
  const { data, error } = await db
    .from('roles')
    .select('id, key, name, scope, organization_id, is_system')
    .eq('scope', 'client')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .order('key')

  if (error) return err(domainError('internal', 'error.internal', { detail: error.message }))

  const rows = z.array(assignableRoleRow).safeParse(data)
  return rows.success
    ? ok(rows.data)
    : err(domainError('internal', 'error.internal', { detail: rows.error.message }))
}

/**
 * Razrešava ključ role u identifikator, samo među dozvoljenim rolama.
 *
 * Odvojeno od upita da bi moglo da se testira bez baze — ovo je mesto na kojem
 * se odlučuje koja prava neko dobija.
 */
export function resolveRoleId(
  roles: readonly AssignableRole[],
  roleKey: string,
): Result<string> {
  const found = roles.find((r) => r.key === roleKey)
  return found ? ok(found.id) : err(domainError('invalid_input', 'members.error.roleUnknown'))
}

export interface InvitedMember {
  readonly membershipId: string
  readonly email: string
  /** Da li je nalog tek napravljen; postojećem se samo dodaje članstvo. */
  readonly accountCreated: boolean
}

/**
 * Poziva korisnika: nalog kroz provajder, članstvo kroz RLS.
 *
 * Redosled nije proizvoljan. Nalog se pravi prvi jer članstvo bez `user_id` ne
 * može da postoji. Ako upis članstva posle toga padne, ostaje nalog bez
 * pristupa ijednoj organizaciji — bezopasno stanje: takav korisnik posle
 * prijave vidi ekran „nemate pristup". Obrnut redosled ne bi bio moguć, a
 * transakcija preko dva sistema ne postoji.
 */
export async function inviteMember(
  db: Db,
  provider: InvitationProvider,
  input: {
    organizationId: string
    email: string
    roleId: string
    invitedBy: string
  },
): Promise<Result<InvitedMember>> {
  const account = await provider.ensureUser(input.email)
  if (!account.ok) return account

  const { data, error } = await db
    .from('organization_memberships')
    .insert({
      organization_id: input.organizationId,
      user_id: account.value.userId,
      role_id: input.roleId,
      status: 'invited',
      invited_by: input.invitedBy,
    })
    .select('id')
    .single()

  if (error) {
    // `unique (organization_id, user_id)` — osoba je već član ove organizacije.
    if (/duplicate key/i.test(error.message)) {
      return err(domainError('conflict', 'members.error.alreadyMember'))
    }
    // Odbijeno od RLS-a znači da pozivalac ne sme da dira ovu organizaciju.
    return err(domainError('forbidden', 'error.forbidden', { detail: error.message }))
  }

  const row = z.object({ id: uuid() }).safeParse(data)
  if (!row.success) {
    return err(domainError('internal', 'error.internal', { detail: 'neočekivan povratni tip' }))
  }

  return ok({
    membershipId: row.data.id,
    email: input.email,
    accountCreated: account.value.created,
  })
}

/** Vraća grešku kada organizacija nema nijednu dodeljivu rolu — ne prazan izbor. */
export function requireRoles(roles: readonly AssignableRole[]): Result<readonly AssignableRole[]> {
  return roles.length > 0 ? ok(roles) : err(notFound('role'))
}
