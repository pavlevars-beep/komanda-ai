'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { briefSections, type BriefSection } from '@/core/brief/focus'
import {
  resetBriefPreference,
  saveBriefPreference,
} from '@/core/brief/preferences-repository'

export interface BriefPrefsState extends ActionResultBase {
  readonly saved?: boolean
  readonly reset?: boolean
}

const SECTIONS: readonly string[] = ['sales', 'receivables', 'debtors', 'payables', 'stock']

function isSection(value: string): value is BriefSection {
  return SECTIONS.includes(value)
}

/**
 * Upis ličnog izbora odeljaka.
 *
 * PRILAGOĐAVANJE NIJE PRISTUP. Prosleđen spisak se preseca sa onim što korisnik
 * SME da vidi, pre nego što išta dodirne bazu. Bez toga bi izmenjen obrazac
 * upisao odeljak bez prava — ne bi ga otkrio, jer razrešavanje ionako filtrira
 * po pravima, ali bi u bazi ostao zapis o nečemu što korisnik ne sme da traži,
 * a takav zapis kasnije neko pročita kao nameru.
 */
export const saveBriefPrefs = workspaceAction<BriefPrefsState>(
  { rateLimit: 'write', audit: 'preferences.updated' },
  async ({ db, user }, _prev, formData) => {
    const orgSlug = formString(formData, 'orgSlug')
    if (!orgSlug) return { error: 'error.invalid_input' }

    const resolved = await resolveOrgContext(db, {
      slug: orgSlug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const org = resolved.value
    const allowed = briefSections(org.memberRole, org.permissions)

    if (formString(formData, 'reset') === '1') {
      const done = await resetBriefPreference(db, org.organizationId, user.id)
      if (!done.ok) return { error: done.error.key }
      revalidatePath(`/w/${orgSlug}`)
      revalidatePath(`/w/${orgSlug}/brif`)
      return { reset: true }
    }

    const order = formData
      .getAll('order')
      .filter((v): v is string => typeof v === 'string')
      .filter(isSection)
      .filter((section) => allowed.includes(section))

    // Vidljivi odeljci stižu kao potvrđena polja; skriveni su oni koje korisnik
    // sme da vidi a nisu potvrđeni. Slanje skrivenih bi značilo da se spisak
    // skrivenog puni iz obrasca, pa bi izmenjen obrazac mogao da „sakrije"
    // odeljak koji uopšte ne postoji.
    const visible = new Set(
      formData
        .getAll('visible')
        .filter((v): v is string => typeof v === 'string')
        .filter(isSection),
    )
    const hidden = allowed.filter((section) => !visible.has(section))

    const saved = await saveBriefPreference(db, org.organizationId, user.id, {
      order,
      hidden,
    })
    if (!saved.ok) return { error: saved.error.key }

    revalidatePath(`/w/${orgSlug}`)
    revalidatePath(`/w/${orgSlug}/brif`)
    return { saved: true }
  },
)
