'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { sendMessage, validateMessage } from '@/core/messages/repository'

export interface MessageState extends ActionResultBase {
  /** Broj primalaca. Nula nije greška, ali jeste vest koju pošiljalac mora da vidi. */
  readonly sentTo?: number
}

/**
 * Slanje poruke iz radnog prostora.
 *
 * Role stižu iz obrasca kao spisak polja za potvrdu; nepoznata vrednost se
 * odbacuje pri proveri, pa se kroz izmenjen zahtev ne može podmetnuti rola
 * koja nije predviđena za poruke.
 *
 * Pravo se NE proverava ovde. Proverava ga funkcija u bazi, i to je jedina
 * provera koja stvarno štiti — ova bi je samo duplirala, a dve provere istog
 * pravila se vremenom raziđu.
 */
export const sendMessageAction = workspaceAction<MessageState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    if (!slug) return { error: 'error.not_found.organization' }

    const validated = validateMessage({
      roles: formData.getAll('roles').filter((v): v is string => typeof v === 'string'),
      title: formString(formData, 'title') ?? '',
      body: formString(formData, 'body') ?? '',
    })
    if (!validated.ok) return { error: validated.error.key }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const sent = await sendMessage(db, {
      organizationId: resolved.value.organizationId,
      roles: validated.value.roles,
      title: validated.value.title,
      body: validated.value.body,
    })
    if (!sent.ok) return { error: sent.error.key }

    revalidatePath(`/w/${slug}/poruke`)
    return { sentTo: sent.value }
  },
)
