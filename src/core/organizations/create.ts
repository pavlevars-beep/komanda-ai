import { z } from 'zod'
import type { Db } from '@/server/db/types'
import { callRpc } from '@/server/db/rpc'
import { err, ok, domainError, type Result } from '../shared/result'
import { isValidSlug, SLUG_MAX, SLUG_MIN } from '../shared/slug'

export const createClientInput = z.object({
  displayName: z.string().trim().min(2, 'clients.error.nameRequired').max(80),
  legalName: z.string().trim().min(2, 'clients.error.legalNameRequired').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(SLUG_MIN, 'clients.error.slugInvalid')
    .max(SLUG_MAX, 'clients.error.slugInvalid')
    .refine(isValidSlug, 'clients.error.slugInvalid'),
  industry: z.string().trim().max(80).nullable(),
  country: z.string().trim().length(2).default('RS'),
  currency: z.enum(['RSD', 'EUR', 'USD']).default('RSD'),
  timezone: z.string().trim().max(60).default('Europe/Belgrade'),
  plan: z.enum(['standard', 'professional', 'enterprise']).default('standard'),
  locale: z.enum(['sr', 'en']).default('sr'),
})

export type CreateClientInput = z.infer<typeof createClientInput>

export async function createClientOrganization(
  db: Db,
  input: CreateClientInput,
): Promise<Result<string>> {
  const { data, error } = await callRpc(db, 'create_client_organization', {
    p_slug: input.slug,
    p_legal_name: input.legalName,
    p_display_name: input.displayName,
    p_industry: input.industry,
    p_country: input.country,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_plan: input.plan,
    p_locale: input.locale,
  })

  if (error) {
    // Zauzeta adresa je najčešća greška i zaslužuje sopstvenu poruku;
    // sve ostalo ide kao opšta greška, sa detaljem samo u logu.
    const taken = /organizations_slug_key|duplicate key/i.test(error.message)
    return err(
      domainError(taken ? 'conflict' : 'internal', taken ? 'clients.error.slugTaken' : 'error.internal', {
        detail: error.message,
      }),
    )
  }

  const id = z.string().uuid().safeParse(data)
  if (!id.success) {
    return err(domainError('internal', 'error.internal', { detail: 'neočekivan povratni tip' }))
  }

  return ok(id.data)
}

export async function isSlugAvailable(db: Db, slug: string): Promise<boolean> {
  const { data, error } = await callRpc(db, 'slug_available', { p_slug: slug })
  if (error) return false
  return data === true
}
