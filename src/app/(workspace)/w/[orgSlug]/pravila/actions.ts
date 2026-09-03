'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { validateBusinessRules, type BusinessRules } from '@/core/rules/business-rules'
import { saveBusinessRules } from '@/core/rules/repository'

export interface RulesState extends ActionResultBase {
  readonly saved?: boolean
  readonly fieldErrors?: Readonly<Record<string, string>>
}

/**
 * Broj iz obrasca.
 *
 * Prazno polje i neispravan unos daju `NaN`, koji provera odbija sa imenovanom
 * greškom. Zamena praznog nulom bi tiho pomerila prag na nulu — a prag od nula
 * dana znači da se upozorenje otvara za svaki dug, uključujući onaj koji tek
 * što je izdat.
 */
function num(formData: FormData, name: string): number {
  const raw = formString(formData, name)
  return raw === undefined ? Number.NaN : Number(raw.replace(/\s/g, '').replace(',', '.'))
}

/**
 * Izmena pragova.
 *
 * Upisuje se SAMO proveren skup, i to sa imenovanim greškama po polju. Tiho
 * vraćanje na podrazumevano je ispravno pri čitanju iz baze, ali bi ovde
 * značilo da korisnik sačuva vrednost, vidi podrazumevanu i ne sazna zašto.
 *
 * Pravo se ne proverava ovde nego RLS-om. Politika traži `manage_alerts`, i to
 * je jedina provera koja stvarno štiti.
 */
export const saveRulesAction = workspaceAction<RulesState>(
  { rateLimit: 'write', audit: 'organization.updated' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    if (!slug) return { error: 'error.not_found.organization' }

    const candidate: Record<keyof BusinessRules, unknown> = {
      receivableWarningDays: num(formData, 'receivableWarningDays'),
      receivableCriticalDays: num(formData, 'receivableCriticalDays'),
      largeReceivableAmount: num(formData, 'largeReceivableAmount'),
      stockWarningDays: num(formData, 'stockWarningDays'),
      stockCriticalDays: num(formData, 'stockCriticalDays'),
      stockOverstockDays: num(formData, 'stockOverstockDays'),
      payableHorizonDays: num(formData, 'payableHorizonDays'),
      largePayableAmount: num(formData, 'largePayableAmount'),
      salesDropPercent: num(formData, 'salesDropPercent'),
      defaultComparison: formString(formData, 'defaultComparison'),
      forecastHistoryYears: num(formData, 'forecastHistoryYears'),
    }

    const validated = validateBusinessRules(candidate)
    if (!validated.ok) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of validated.issues) fieldErrors[issue.field] ??= issue.key
      return { error: 'error.invalid_input', fieldErrors }
    }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const saved = await saveBusinessRules(
      db,
      resolved.value.organizationId,
      validated.value,
      user.id,
    )
    if (!saved.ok) return { error: saved.error.key }

    // Pragovi menjaju šta brif uopšte prijavljuje, pa se i on osvežava.
    revalidatePath(`/w/${slug}`)
    revalidatePath(`/w/${slug}/pravila`)
    return { saved: true }
  },
)
