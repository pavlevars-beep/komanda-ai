import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { getConsoleClient } from '@/core/organizations/console-repository'
import { getBranding } from '@/core/branding/repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { BrandingForm } from './branding-form'
import styles from './branding.module.css'

export default async function BrandingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const client = await getConsoleClient(db, orgId)
  if (!client.ok) notFound()

  const branding = await getBranding(db, orgId)
  const current = branding.ok ? branding.value : null

  const { t } = createTranslator(await requestLocale(user.locale))

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/console/clients/${orgId}` as Route} className={styles.crumb}>
          ← {client.value.display_name}
        </Link>
        <h1 className={styles.title}>{t('branding.title')}</h1>
        <p className={styles.lede}>{t('branding.lede')}</p>
      </header>

      <BrandingForm
        organizationId={orgId}
        initial={{
          organizationName: client.value.display_name,
          workspaceName: current?.workspace_name ?? '',
          primaryColor: current?.primary_color ?? '',
          welcomeSr: current?.welcome_message.sr ?? '',
          welcomeEn: current?.welcome_message.en ?? '',
        }}
        labels={{
          workspaceName: t('branding.workspaceName'),
          primaryColor: t('branding.primaryColor'),
          welcomeSr: t('branding.welcome.sr'),
          welcomeEn: t('branding.welcome.en'),
          save: t('common.save'),
          saved: t('branding.saved'),
          preview: t('branding.preview'),
          contrastOk: t('branding.contrastOk'),
          adjusted: t('branding.color.adjusted'),
          message: (key) => t(key as MessageKey),
        }}
      />
    </div>
  )
}
