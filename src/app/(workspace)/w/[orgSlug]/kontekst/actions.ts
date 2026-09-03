'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString, formStringOrNull } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import {
  addContextEvent,
  contextEventInput,
  deleteContextEvent,
} from '@/core/context/repository'

export interface ContextState extends ActionResultBase {
  readonly saved?: boolean
  readonly deleted?: boolean
  readonly fieldErrors?: Readonly<Record<string, string>>
}

/**
 * Procenjeni uticaj iz obrasca.
 *
 * Prazno polje znači „nije procenjeno", ne nulu. Nula bi tiho pomerila
 * osnovicu za poređenje; izostanak je vidljiv i ne menja ništa.
 */
function parseImpact(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

export const addContextEventAction = workspaceAction<ContextState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    if (!slug) return { error: 'error.not_found.organization' }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const parsed = contextEventInput.safeParse({
      organizationId: resolved.value.organizationId,
      kind: formString(formData, 'kind') ?? 'other',
      title: formString(formData, 'title') ?? '',
      note: formStringOrNull(formData, 'note'),
      startsOn: formString(formData, 'startsOn') ?? '',
      endsOn: formStringOrNull(formData, 'endsOn'),
      revenueImpact: parseImpact(formStringOrNull(formData, 'revenueImpact')),
      excludeFromBaseline: formString(formData, 'excludeFromBaseline') === 'on',
      keepInTotals: formString(formData, 'keepInTotals') === 'on',
      excludeFromForecast: formString(formData, 'excludeFromForecast') === 'on',
      annotateComparison: formString(formData, 'annotateComparison') === 'on',
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    const created = await addContextEvent(db, parsed.data, user.id)
    if (!created.ok) return { error: created.error.key }

    revalidatePath(`/w/${slug}/kontekst`)
    revalidatePath(`/w/${slug}`)
    return { saved: true }
  },
)

export const deleteContextEventAction = workspaceAction<ContextState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const eventId = formString(formData, 'eventId')
    if (!slug || !eventId) return { error: 'context.error.deleteFailed' }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const removed = await deleteContextEvent(db, resolved.value.organizationId, eventId)
    if (!removed.ok) return { error: removed.error.key }

    revalidatePath(`/w/${slug}/kontekst`)
    revalidatePath(`/w/${slug}`)
    return { deleted: true }
  },
)
