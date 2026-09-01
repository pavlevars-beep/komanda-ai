import { z } from 'zod'
import { uuid } from '../shared/uuid'
import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'

const brandingRow = z.object({
  organization_id: uuid(),
  logo_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  primary_color: z.string().nullable(),
  secondary_color: z.string().nullable(),
  workspace_name: z.string().nullable(),
  welcome_message: z.record(z.string(), z.string()),
})

export type Branding = z.infer<typeof brandingRow>

export async function getBranding(
  db: Db,
  organizationId: string,
): Promise<Result<Branding | null>> {
  const { data, error } = await db
    .from('organization_branding')
    .select(
      'organization_id, logo_url, favicon_url, primary_color, secondary_color, workspace_name, welcome_message',
    )
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    return err(domainError('internal', 'error.internal', { detail: error.message }))
  }
  if (!data) return ok(null)

  const row = brandingRow.safeParse(data)
  if (!row.success) {
    return err(domainError('internal', 'error.internal', { detail: row.error.message }))
  }

  return ok(row.data)
}

export interface BrandingUpdate {
  readonly organizationId: string
  readonly primaryColor: string | null
  readonly workspaceName: string | null
  readonly welcomeSr: string | null
  readonly welcomeEn: string | null
}

export async function saveBranding(db: Db, input: BrandingUpdate): Promise<Result<true>> {
  // Poruka dobrodošlice mora da postoji na oba jezika ili ni na jednom —
  // isto pravilo stoji i kao CHECK u bazi, da se ne bi razišli.
  const welcome =
    input.welcomeSr && input.welcomeEn
      ? { sr: input.welcomeSr, en: input.welcomeEn }
      : {}

  const { error } = await db.from('organization_branding').upsert(
    {
      organization_id: input.organizationId,
      primary_color: input.primaryColor,
      workspace_name: input.workspaceName,
      welcome_message: welcome,
    },
    { onConflict: 'organization_id' },
  )

  if (error) {
    // RLS odbija izmenu nad organizacijom van dosega pozivaoca.
    return err(domainError('forbidden', 'error.forbidden', { detail: error.message }))
  }

  return ok(true)
}
