import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { NewClientForm } from './new-client-form'
import styles from './new-client.module.css'

export const metadata: Metadata = { title: 'Novi klijent' }

export default async function NewClientPage() {
  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const { t } = createTranslator(await requestLocale(user.locale))

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href="/console/clients" className={styles.crumb}>
          ← {t('clients.title')}
        </Link>
        <h1 className={styles.title}>{t('clients.new')}</h1>
        <p className={styles.lede}>{t('clients.new.lede')}</p>
      </header>

      <NewClientForm
        labels={{
          displayName: t('clients.field.displayName'),
          legalName: t('clients.field.legalName'),
          slug: t('clients.field.slug'),
          slugHint: (slug) => t('clients.field.slugHint', { slug }),
          industry: t('clients.field.industry'),
          currency: t('clients.field.currency'),
          plan: t('clients.field.plan'),
          locale: t('clients.field.locale'),
          create: t('clients.create'),
          message: (key) => t(key as MessageKey),
        }}
      />
    </div>
  )
}
