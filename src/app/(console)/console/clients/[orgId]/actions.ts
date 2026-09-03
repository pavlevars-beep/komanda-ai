'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { redact } from '@/server/logger'
import { supabaseInvitationProvider } from '@/server/auth/invite-provider'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { populateDemoContent } from '@/core/demo/populate'
import {
  inviteInput,
  inviteMember,
  listAssignableRoles,
  resolveRoleId,
} from '@/core/organizations/invitations'

export interface DemoContentState extends ActionResultBase {
  readonly alerts?: number
  readonly notes?: number
}

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

/**
 * Punjenje radnog prostora demo sadržajem.
 *
 * Postoji da bi se klijentu moglo pokazati kako alat izgleda kada radi — bez
 * ekrana koji su tehnički ispravni a prazni.
 *
 * Sve provere koje su stvarno važne rade drugde: da je organizacija demo
 * proverava `populateDemoContent`, a da osoblje uopšte sme do podataka
 * proverava RLS kroz sesiju pristupa. Ovde se samo razrešava kontekst.
 */
export const fillDemoContentAction = consoleAction<DemoContentState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    if (!slug) return { error: 'error.not_found.organization' }

    const reqId = makeRequestId(await headers())

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: reqId,
    })
    // Osoblje bez otvorene sesije pristupa ovde ne prolazi — `accessible_org_ids`
    // ga ne vraća. To je isto pravilo koje čuva i sam radni prostor.
    if (!resolved.ok) return { error: 'preview.needSession' }

    initialiseConnectors()
    const source = await primaryIntegration(db, resolved.value.organizationId)

    const filled = await populateDemoContent(
      db,
      resolved.value,
      source.integrationId,
      source.connectorType,
      resolved.value.isDemo,
    )

    if (!filled.ok) {
      return {
        error: filled.error.key,
        ...(filled.error.detail ? { detail: String(redact(filled.error.detail)) } : {}),
      }
    }

    revalidatePath(`/w/${slug}`)
    revalidatePath(`/w/${slug}/beleske`)
    return { alerts: filled.value.alerts, notes: filled.value.notes }
  },
)
