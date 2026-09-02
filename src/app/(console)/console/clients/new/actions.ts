'use server'

import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString, formStringOrNull } from '@/server/http/form'
import { redact } from '@/server/logger'
import { createClientInput, createClientOrganization } from '@/core/organizations/create'

export interface CreateClientState extends ActionResultBase {
  readonly fieldErrors?: Readonly<Record<string, string>>
}

export const createClientAction = consoleAction<CreateClientState>(
  { rateLimit: 'write', audit: 'organization.created' },
  async ({ db }, _prev, formData) => {
    const parsed = createClientInput.safeParse({
      displayName: formString(formData, 'displayName'),
      legalName: formString(formData, 'legalName'),
      slug: formString(formData, 'slug'),
      industry: formStringOrNull(formData, 'industry'),
      country: formString(formData, 'country') ?? 'RS',
      currency: formString(formData, 'currency') ?? 'RSD',
      timezone: formString(formData, 'timezone') ?? 'Europe/Belgrade',
      plan: formString(formData, 'plan') ?? 'standard',
      locale: formString(formData, 'locale') ?? 'sr',
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message
      }
      return { error: 'error.invalid_input', fieldErrors }
    }

    const created = await createClientOrganization(db, parsed.data)

    if (!created.ok) {
      if (created.error.key === 'clients.error.slugTaken') {
        return { error: created.error.key, fieldErrors: { slug: created.error.key } }
      }

      // Detalj ide osoblju u konzoli, ne samo u log. Bez toga se svaka greška
      // baze svodi na „nešto je pošlo naopako", a uzrok se traži po logovima
      // hostinga — što u praksi znači da se ne traži.
      return {
        error: created.error.key,
        ...(created.error.detail
          ? { detail: String(redact(created.error.detail)) }
          : {}),
      }
    }

    revalidatePath('/console/clients')
    // Konsultant se vodi pravo na sledeći korak onboardinga, umesto da se
    // vrati na listu i sam traži organizaciju koju je upravo napravio.
    redirect(`/console/clients/${created.value}` as Route)
  },
)
