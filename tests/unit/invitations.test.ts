import { describe, expect, it } from 'vitest'
import {
  inviteInput,
  inviteMember,
  listAssignableRoles,
  normalizeEmail,
  resolveRoleId,
  type AssignableRole,
  type InvitationProvider,
} from '@/core/organizations/invitations'
import { isExistingAccountError } from '@/server/auth/invite-provider'
import { ok, err, domainError } from '@/core/shared/result'

const ORG = '00000000-0000-0000-0000-00000000d002'
const STAFF = '00000000-0000-0000-0000-0000000000a1'

const ROLES: AssignableRole[] = [
  { id: '00000000-0000-0000-0000-0000000000f1', key: 'client_owner', name: { sr: 'Vlasnik', en: 'Owner' } },
  { id: '00000000-0000-0000-0000-0000000000f2', key: 'client_viewer', name: { sr: 'Pregled', en: 'Viewer' } },
]

describe('e-adresa', () => {
  it('normalizuje se pre upotrebe', () => {
    // Bez ovoga bi ista osoba postojala dvaput: jednom sa nalogom, jednom bez.
    expect(normalizeEmail('  Pera@Firma.RS ')).toBe('pera@firma.rs')
  })

  it('neispravna adresa se odbija sa prevodivim ključem', () => {
    const parsed = inviteInput.safeParse({ organizationId: ORG, email: 'pera', roleKey: 'client_owner' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues[0]?.message).toBe('members.error.emailInvalid')
  })

  it('adresa se normalizuje i kroz šemu', () => {
    const parsed = inviteInput.safeParse({
      organizationId: ORG,
      email: '  Pera@Firma.RS ',
      roleKey: 'client_owner',
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBe('pera@firma.rs')
  })
})

describe('razrešavanje role', () => {
  it('poznat ključ daje identifikator', () => {
    const r = resolveRoleId(ROLES, 'client_viewer')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toBe('00000000-0000-0000-0000-0000000000f2')
  })

  it('ODBIJA rolu koja nije među dodeljivima', () => {
    // Ovo je jezgro provere: forma šalje ključ, a ne identifikator, i ključ se
    // traži samo među rolama koje ta organizacija sme da dodeli. Platformska
    // rola tu ne postoji, pa se ne može podmetnuti kroz zahtev.
    const r = resolveRoleId(ROLES, 'platform_super_admin')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.key).toBe('members.error.roleUnknown')
  })
})

/** Dvojnik baze koji pamti šta je upisano i može da simulira grešku. */
function fakeDb(insertError?: string) {
  const inserts: Record<string, unknown>[] = []
  const query = {
    select: () => query,
    eq: () => query,
    or: () => query,
    order: () => query,
    single: () =>
      Promise.resolve(
        insertError
          ? { data: null, error: { message: insertError } }
          : { data: { id: '00000000-0000-0000-0000-0000000000e9' }, error: null },
      ),
    insert: (payload: Record<string, unknown>) => {
      inserts.push(payload)
      return query
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  }
  return { db: { from: () => query } as never, inserts }
}

const providerThatCreates: InvitationProvider = {
  ensureUser: () => Promise.resolve(ok({ userId: '00000000-0000-0000-0000-0000000000c1', created: true })),
}

describe('poziv člana', () => {
  it('upisuje članstvo sa statusom „pozvan" i onim ko je pozvao', async () => {
    const { db, inserts } = fakeDb()

    const r = await inviteMember(db, providerThatCreates, {
      organizationId: ORG,
      email: 'pera@firma.rs',
      roleId: ROLES[0]!.id,
      invitedBy: STAFF,
    })

    expect(r.ok).toBe(true)
    expect(inserts[0]?.['status']).toBe('invited')
    expect(inserts[0]?.['organization_id']).toBe(ORG)
    expect(inserts[0]?.['invited_by']).toBe(STAFF)
    // Nikad `accepted_at` — članstvo postaje aktivno tek prihvatanjem.
    expect(inserts[0]?.['accepted_at']).toBeUndefined()
  })

  it('postojeći nalog NIJE greška — dodaje se samo članstvo', async () => {
    // Ista osoba može da radi za dva klijenta. Da ovo bude greška, drugi
    // klijent je ne bi mogao pozvati.
    const { db } = fakeDb()
    const existing: InvitationProvider = {
      ensureUser: () => Promise.resolve(ok({ userId: '00000000-0000-0000-0000-0000000000c2', created: false })),
    }

    const r = await inviteMember(db, existing, {
      organizationId: ORG, email: 'pera@firma.rs', roleId: ROLES[0]!.id, invitedBy: STAFF,
    })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.accountCreated).toBe(false)
  })

  it('ponovljen poziv istoj osobi daje jasnu poruku, ne internu grešku', async () => {
    const { db } = fakeDb('duplicate key value violates unique constraint')

    const r = await inviteMember(db, providerThatCreates, {
      organizationId: ORG, email: 'pera@firma.rs', roleId: ROLES[0]!.id, invitedBy: STAFF,
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.key).toBe('members.error.alreadyMember')
  })

  it('kada nalog ne može da se napravi, članstvo se NE upisuje', async () => {
    const { db, inserts } = fakeDb()
    const failing: InvitationProvider = {
      ensureUser: () => Promise.resolve(err(domainError('internal', 'members.error.inviteFailed'))),
    }

    const r = await inviteMember(db, failing, {
      organizationId: ORG, email: 'pera@firma.rs', roleId: ROLES[0]!.id, invitedBy: STAFF,
    })

    expect(r.ok).toBe(false)
    // Članstvo bez naloga ne može da postoji; ne sme ni da se pokuša.
    expect(inserts).toHaveLength(0)
  })
})

describe('dodeljive role', () => {
  it('traže se samo role opsega „client"', async () => {
    // Platformske role pripadaju Delta Pro osoblju i imaju svoj put kroz
    // platform_staff. Kroz pozivnicu se ne smeju dobiti.
    const calls: string[] = []
    const query = {
      select: () => query,
      eq: (col: string, val: string) => { calls.push(`${col}=${val}`); return query },
      or: () => query,
      order: () => query,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }
    await listAssignableRoles({ from: () => query } as never, ORG)
    expect(calls).toContain('scope=client')
  })
})

describe('prepoznavanje postojećeg naloga u Auth odgovoru', () => {
  it('prepoznaje se po kodu i po poruci', () => {
    expect(isExistingAccountError('', 'email_exists')).toBe(true)
    expect(isExistingAccountError('A user with this email address has already been registered')).toBe(true)
    expect(isExistingAccountError('Invalid email address')).toBe(false)
  })
})
