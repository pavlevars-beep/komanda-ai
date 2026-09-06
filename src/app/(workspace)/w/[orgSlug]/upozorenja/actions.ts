'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { acknowledgeAlert } from '@/core/alerts/repository'

export interface AlertState extends ActionResultBase {
  readonly acknowledged?: boolean
}

/**
 * Potvrđivanje upozorenja sme svako ko ga vidi — to je svakodnevni rad, ne
 * podešavanje. Provera prava ostaje na RLS-u.
 */
export const acknowledgeAlertAction = workspaceAction<AlertState>(
  { rateLimit: 'write', audit: 'workspace.opened' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const alertId = formString(formData, 'alertId')
    if (!slug || !alertId) return { error: 'alerts.error.failed' }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const done = await acknowledgeAlert(db, resolved.value.organizationId, alertId, user.id)
    if (!done.ok) return { error: done.error.key }

    revalidatePath(`/w/${slug}/upozorenja`)
    revalidatePath(`/w/${slug}`)
    return { acknowledged: true }
  },
)
