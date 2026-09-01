import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { getConsoleClient } from '@/core/organizations/console-repository'
import { listConnectorTypes } from '@/core/integrations/repository'
import { availableConnectorTypes } from '@/core/connectors'
import { resolveLocale } from '@/i18n/config'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { NewIntegrationForm } from './new-integration-form'
import styles from '../integrations.module.css'

export default async function NewIntegrationPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const client = await getConsoleClient(db, orgId)
  if (!client.ok) notFound()

  const locale = resolveLocale({ userLocale: user.locale })
  const { t } = createTranslator(locale)

  const types = await listConnectorTypes(db)
  // Katalog kaže šta je planirano; registar kaže šta stvarno radi.
  // Presek to dvoje je ono što konsultant sme da izabere.
  const implemented = new Set(availableConnectorTypes())

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/console/clients/${orgId}/integrations` as Route} className={styles.crumb}>
          ← {t('integrations.title')}
        </Link>
        <h1 className={styles.title}>{t('integrations.new')}</h1>
        <p className={styles.lede}>{client.value.display_name}</p>
      </header>

      {!types.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : (
        <NewIntegrationForm
          organizationId={orgId}
          catalog={types.value.map((type) => ({
            key: type.key,
            name: type.name[locale] ?? type.key,
            category: type.category,
            availability: type.availability,
            supportedAuth: type.supported_auth,
            implemented: implemented.has(type.key),
          }))}
          labels={{
            catalog: t('integrations.catalog'),
            name: t('integrations.field.name'),
            environment: t('integrations.field.environment'),
            authType: t('integrations.field.authType'),
            config: t('integrations.field.config'),
            configHint: t('integrations.field.configHint'),
            sandbox: t('integrations.environment.sandbox'),
            production: t('integrations.environment.production'),
            create: t('integrations.create'),
            availability: (a) => t(`integrations.availability.${a}` as MessageKey),
            plannedHint: t('integrations.plannedHint'),
            message: (key) => t(key as MessageKey),
          }}
        />
      )}
    </div>
  )
}
