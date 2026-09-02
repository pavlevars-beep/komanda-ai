'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/core/shared/uuid'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { redact } from '@/server/logger'
import {
  addCard,
  addCardInput,
  listAvailableTools,
  removeCard,
} from '@/core/dashboard/cards-repository'

export interface DashboardState extends ActionResultBase {
  readonly added?: string
  readonly removed?: boolean
  readonly fieldErrors?: Readonly<Record<string, string>>
}

/**
 * Dodavanje kartice na početnu klijenta.
 *
 * Alat se traži među onima koje STVARNO nudi neka uključena integracija ove
 * organizacije — spisak se ne uzima iz zahteva. Bez toga bi izmenjen zahtev
 * mogao da doda karticu za alat koji organizacija nema, i vezao je za tuđu
 * integraciju.
 */
export const addCardAction = consoleAction<DashboardState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const parsed = addCardInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      aiToolKey: formString(formData, 'aiToolKey'),
      titleSr: formString(formData, 'titleSr'),
      titleEn: formString(formData, 'titleEn'),
      format: formString(formData, 'format') ?? 'number',
      higherIsBetter: formString(formData, 'higherIsBetter') === 'on',
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    const available = await listAvailableTools(db, parsed.data.organizationId)
    if (!available.ok) return { error: available.error.key }

    const tool = available.value.find((t) => t.key === parsed.data.aiToolKey)
    if (!tool) return { error: 'dashboard.error.toolUnavailable' }

    const created = await addCard(db, parsed.data, tool, user.id)
    if (!created.ok) {
      return {
        error: created.error.key,
        ...(created.error.detail ? { detail: String(redact(created.error.detail)) } : {}),
      }
    }

    revalidatePath(`/console/clients/${parsed.data.organizationId}/dashboard`)
    return { added: created.value }
  },
)

const removeInput = z.object({ organizationId: uuid(), cardId: uuid() })

/** Uklanjanje kartice. Alat ostaje uključen — kartica i pravo nisu isto. */
export const removeCardAction = consoleAction<DashboardState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db }, _prev, formData) => {
    const parsed = removeInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      cardId: formString(formData, 'cardId'),
    })
    if (!parsed.success) return { error: 'error.invalid_input' }

    const removed = await removeCard(db, parsed.data.organizationId, parsed.data.cardId)
    if (!removed.ok) return { error: removed.error.key }

    revalidatePath(`/console/clients/${parsed.data.organizationId}/dashboard`)
    return { removed: true }
  },
)
