'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { ask } from '@/core/ai/ask'

/** Gornja granica dužine pitanja; duži tekst nije pitanje nego nalepljen dokument. */
const MAX_QUESTION_LENGTH = 500

export interface AskState extends ActionResultBase {
  readonly answered?: boolean
}

/**
 * Postavljanje pitanja iz radnog prostora.
 *
 * Organizacija se razrešava iz SLUG-a u putanji preko iste funkcije koju
 * koristi i stranica — identifikator iz forme se ne uzima kao dokaz
 * pripadnosti. Ovo je jedno od mesta gde bi „samo prosledi organizationId"
 * značilo da pitanje može da se postavi nad tuđim podacima.
 */
export const askAction = workspaceAction<AskState>(
  { rateLimit: 'write', audit: 'ai.question_asked' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const question = (formString(formData, 'question') ?? '').trim()

    if (!slug) return { error: 'error.not_found.organization' }
    if (question.length === 0) return { error: 'ask.error.empty' }
    if (question.length > MAX_QUESTION_LENGTH) return { error: 'ask.error.tooLong' }

    const reqId = makeRequestId(await headers())

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: reqId,
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const org = resolved.value
    const locale = await requestLocale(user.locale ?? org.locale)
    const { t, formatNumber, formatDate } = createTranslator(locale)

    initialiseConnectors()
    const source = await primaryIntegration(db, org.organizationId)

    const result = await ask(db, org, {
      question,
      integrationId: source.integrationId,
      connectorType: source.connectorType,
      locale,
      format: {
        t,
        money: (amount, currency) =>
          new Intl.NumberFormat(INTL_LOCALE[locale], {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
          }).format(Number(amount)),
        number: (value) => formatNumber(value),
        percent: (value) =>
          new Intl.NumberFormat(INTL_LOCALE[locale], {
            style: 'percent',
            maximumFractionDigits: 1,
            signDisplay: 'exceptZero',
          }).format(value / 100),
        date: (value) => formatDate(`${value}T00:00:00Z`, { dateStyle: 'medium' }),
      },
    })

    // Neuspeh se NE vraća kao greška akcije: pitanje i objašnjenje zašto
    // odgovora nema već stoje u razgovoru, a stranica ih prikazuje. Crvena
    // traka povrh toga izgledala bi kao kvar, a nije — sistem je odgovorio,
    // samo ne brojem.
    revalidatePath(`/w/${slug}/pitanja`)
    return { answered: result.ok }
  },
)
