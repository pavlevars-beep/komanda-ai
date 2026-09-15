import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { briefChoices } from '@/core/brief/preferences'
import { getBriefPreference } from '@/core/brief/preferences-repository'
import type { BriefSection } from '@/core/brief/focus'
import { DetailShell } from '../detail-shell'
import { PrefsForm, type SectionRow } from './prefs-form'
import styles from './prefs.module.css'

/** Naslov odeljka u brifu i na ovom ekranu mora da bude ISTI niz znakova. */
const SECTION_LABEL: Record<BriefSection, MessageKey> = {
  sales: 'brief.sales',
  receivables: 'brief.receivables',
  debtors: 'brief.receivables.topDebtors',
  payables: 'brief.payables',
  stock: 'brief.stock',
}

export default async function BriefPrefsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const db = await userDb()
  const user = await currentUser(db)
  if (!user) notFound()

  const resolved = await resolveOrgContext(db, {
    slug: orgSlug,
    userId: user.id,
    userName: user.fullName,
    requestId: makeRequestId(await headers()),
  })
  if (!resolved.ok) notFound()

  const org = resolved.value
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t } = createTranslator(locale)

  const preference = await getBriefPreference(db, org.organizationId, user.id)
  const choices = briefChoices(preference, org.memberRole, org.permissions)

  const rows: SectionRow[] = choices.map((choice) => ({
    key: choice.section,
    label: t(SECTION_LABEL[choice.section]),
    visible: choice.visible,
  }))

  return (
    <DetailShell
      orgSlug={org.organizationSlug}
      icon="settings"
      title={t('brief.prefs.title')}
      lede={t('brief.prefs.lede')}
      backLabel={t('detail.back')}
    >
      <div className={styles.page}>
        {/*
          Prazan spisak nije kvar nego posledica prava. Prazan obrazac bez
          objašnjenja izgleda kao da je ekran polomljen.
        */}
        {rows.length === 0 ? (
          <p className={styles.empty}>{t('brief.prefs.empty')}</p>
        ) : (
          <PrefsForm
            orgSlug={org.organizationSlug}
            rows={rows}
            labels={{
              order: t('brief.prefs.order'),
              up: t('brief.prefs.up'),
              down: t('brief.prefs.down'),
              show: t('brief.prefs.show'),
              position: t('brief.prefs.position', { position: '{position}' }),
              save: t('brief.prefs.save'),
              saved: t('brief.prefs.saved'),
              reset: t('brief.prefs.reset'),
              resetDone: t('brief.prefs.resetDone'),
              hiddenCount: t('brief.prefs.hiddenCount', { count: '{count}' }),
              allHidden: t('brief.prefs.allHidden'),
              messages: messagesFor(locale, ['error.', 'brief.prefs.error.']),
            }}
          />
        )}

        <div className={styles.notes}>
          <p className={styles.note}>{t('brief.prefs.attentionNote')}</p>
          {/*
            Granica se kaže naglas. Bez ove rečenice korisnik traži odeljak koji
            mu nedostaje na ekranu koji ga ne može dati, pa zaključi da je alat
            pokvaren umesto da traži pravo pristupa.
          */}
          <p className={styles.note}>{t('brief.prefs.accessNote')}</p>
        </div>
      </div>
    </DetailShell>
  )
}
