import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { listAllIntegrations } from '@/core/integrations/repository'
import { Icon } from '@/ui/primitives/Icon'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import styles from '../console-detail.module.css'

const STATUS_TONE: Record<string, Tone> = {
  active: 'ok',
  draft: 'neutral',
  paused: 'warn',
  error: 'critical',
}

/**
 * Sve integracije svih klijenata na jednom mestu.
 *
 * Pregled, ne podešavanje. Menja se u okviru klijenta, gde stoji i sve ostalo
 * što se tiče te organizacije — dva mesta za istu izmenu znače da se jednog
 * dana raziđu.
 */
export default async function ConsoleIntegrationsPage() {
  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t } = createTranslator(locale)

  const integrations = await listAllIntegrations(db)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="box" size={22} />
          {t('integrations.title')}
        </h1>
        <p className={styles.lede}>{t('consoleIntegrations.lede')}</p>
      </header>

      {!integrations.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : integrations.value.length === 0 ? (
        <p className={styles.empty}>{t('consoleIntegrations.empty')}</p>
      ) : (
        <div className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('health.col.client')}</th>
                  <th scope="col">{t('health.col.integration')}</th>
                  <th scope="col">{t('health.col.type')}</th>
                  <th scope="col">{t('integrations.field.environment')}</th>
                  <th scope="col">{t('audit.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {integrations.value.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      <Link
                        href={`/console/clients/${integration.organizationId}` as Route}
                        className={styles.link}
                      >
                        {integration.organizationName}
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={
                          `/console/clients/${integration.organizationId}/integrations/${integration.id}` as Route
                        }
                        className={styles.link}
                      >
                        {integration.name}
                      </Link>
                    </td>
                    <td className={styles.action}>{integration.connectorType}</td>
                    <td>{t(`integrations.environment.${integration.environment}` as MessageKey)}</td>
                    <td>
                      <StatusBadge
                        tone={STATUS_TONE[integration.status] ?? 'neutral'}
                        label={t(`integration.status.${integration.status}` as MessageKey)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
