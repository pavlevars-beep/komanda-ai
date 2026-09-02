'use server'

import { revalidatePath } from 'next/cache'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { supabaseInvitationProvider } from '@/server/auth/invite-provider'
import {
  inviteInput,
  inviteMember,
  listAssignableRoles,
  resolveRoleId,
} from '@/core/organizations/invitations'

export interface MemberState extends ActionResultBase {
  readonly invited?: {
    readonly email: string
    /** Razlikuje „poslata pozivnica" od „dodat postojeći nalog". */
    readonly accountCreated: boolean
  }
  readonly fieldErrors?: Readonly<Record<string, string>>
}

/**
 * Poziv korisnika u organizaciju klijenta.
 *
 * Forma šalje e-adresu i KLJUČ role. Identifikator role se razrešava ovde, i
 * to samo među rolama koje ta organizacija sme da dodeli — podmetnut
 * `role_id` iz zahteva ne bi imao gde da uđe. Opseg nad organizacijom i dalje
 * proverava RLS pri upisu članstva, ne ovaj kod.
 */
export const inviteMemberAction = consoleAction<MemberState>(
  { rateLimit: 'write', audit: 'user.invited' },
  async ({ db, user }, _prev, formData) => {
    const parsed = inviteInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      email: formString(formData, 'email'),
      roleKey: formString(formData, 'roleKey'),
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    // Spisak dodeljivih rola se čita korisničkim klijentom, pa ga i RLS filtrira.
    const roles = await listAssignableRoles(db, parsed.data.organizationId)
    if (!roles.ok) return { error: roles.error.key }

    const roleId = resolveRoleId(roles.value, parsed.data.roleKey)
    if (!roleId.ok) return { error: roleId.error.key, fieldErrors: { roleKey: roleId.error.key } }

    const invited = await inviteMember(db, supabaseInvitationProvider(), {
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
      roleId: roleId.value,
      invitedBy: user.id,
    })
    if (!invited.ok) return { error: invited.error.key }

    revalidatePath(`/console/clients/${parsed.data.organizationId}`)
    return {
      invited: {
        email: invited.value.email,
        accountCreated: invited.value.accountCreated,
      },
    }
  },
)
