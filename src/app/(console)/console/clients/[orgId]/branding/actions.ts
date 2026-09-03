'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/core/shared/uuid'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString, formStringOrNull } from '@/server/http/form'
import { redact } from '@/server/logger'
import { saveBranding } from '@/core/branding/repository'
import { clearLogo, uploadLogo } from '@/core/branding/logo'
import { checkBrandColor } from '@/core/branding/contrast'

export interface BrandingState extends ActionResultBase {
  readonly saved?: boolean
  /** Popunjeno kada je uneta boja morala da se koriguje radi čitljivosti. */
  readonly adjustedFrom?: string
  readonly fieldErrors?: Readonly<Record<string, string>>
}

const input = z.object({
  organizationId: uuid(),
  workspaceName: z.string().trim().max(60).nullable(),
  welcomeSr: z.string().trim().max(300).nullable(),
  welcomeEn: z.string().trim().max(300).nullable(),
})

export const saveBrandingAction = consoleAction<BrandingState>(
  { rateLimit: 'write', audit: 'branding.updated' },
  async ({ db }, _prev, formData) => {
    const parsed = input.safeParse({
      organizationId: formString(formData, 'organizationId'),
      workspaceName: formStringOrNull(formData, 'workspaceName'),
      welcomeSr: formStringOrNull(formData, 'welcomeSr'),
      welcomeEn: formStringOrNull(formData, 'welcomeEn'),
    })

    if (!parsed.success) return { error: 'error.invalid_input' }

    const rawColor = formStringOrNull(formData, 'primaryColor')

    /*
     * Boja se ne prihvata sirova.
     *
     * Klijentova boja sme da bude prepoznatljiva, ali ne sme da učini tekst
     * nečitljivim. Zato se proverava kontrast u OBE teme; ako boja ni nakon
     * korekcije ne može da zadovolji prag, odbija se sa objašnjenjem umesto
     * da se tiho snimi i pokvari radni prostor.
     */
    let primaryColor: string | null = null
    let adjustedFrom: string | undefined

    if (rawColor) {
      const check = checkBrandColor(rawColor)

      if (!check.valid) {
        return {
          error: 'error.invalid_input',
          fieldErrors: {
            primaryColor:
              check.reason === 'invalid_hex' ? 'branding.color.invalid' : 'branding.color.unusable',
          },
        }
      }

      primaryColor = rawColor.toLowerCase()
      if (check.adjustedFrom) adjustedFrom = check.adjustedFrom
    }

    const result = await saveBranding(db, {
      organizationId: parsed.data.organizationId,
      primaryColor,
      workspaceName: parsed.data.workspaceName,
      welcomeSr: parsed.data.welcomeSr,
      welcomeEn: parsed.data.welcomeEn,
    })

    if (!result.ok) return { error: result.error.key }

    revalidatePath(`/console/clients/${parsed.data.organizationId}/branding`)
    revalidatePath('/w', 'layout')

    return { saved: true, ...(adjustedFrom ? { adjustedFrom } : {}) }
  },
)

export interface LogoState extends ActionResultBase {
  readonly uploaded?: boolean
  readonly removed?: boolean
}

/**
 * Otpremanje logotipa.
 *
 * `File` iz `FormData` se prosleđuje direktno u skladište, bez međukoraka.
 * Čitanje u memoriju pa upisivanje ne bi dodalo nijednu proveru, a udvostručilo
 * bi zauzeće memorije servera na svakoj otpremi.
 */
export const uploadLogoAction = consoleAction<LogoState>(
  { rateLimit: 'write', audit: 'branding.updated' },
  async ({ db }, _prev, formData) => {
    const organizationId = formString(formData, 'organizationId')
    if (!organizationId) return { error: 'error.invalid_input' }

    const file = formData.get('logo')
    if (!(file instanceof File)) return { error: 'branding.error.logoEmpty' }

    const uploaded = await uploadLogo(db, organizationId, file)
    if (!uploaded.ok) {
      return {
        error: uploaded.error.key,
        ...(uploaded.error.detail ? { detail: String(redact(uploaded.error.detail)) } : {}),
      }
    }

    revalidatePath(`/console/clients/${organizationId}/branding`)
    return { uploaded: true }
  },
)

export const removeLogoAction = consoleAction<LogoState>(
  { rateLimit: 'write', audit: 'branding.updated' },
  async ({ db }, _prev, formData) => {
    const organizationId = formString(formData, 'organizationId')
    if (!organizationId) return { error: 'error.invalid_input' }

    const cleared = await clearLogo(db, organizationId)
    if (!cleared.ok) return { error: cleared.error.key }

    revalidatePath(`/console/clients/${organizationId}/branding`)
    return { removed: true }
  },
)
