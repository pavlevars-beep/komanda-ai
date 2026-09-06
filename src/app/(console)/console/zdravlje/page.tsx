import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { listAllIntegrations } from '@/core/integrations/repository'
import { Icon } from '@/ui/primitives/Icon'
import { StatusBadge } from '@/ui/patterns/StatusBadge'
import styles from '../console-detail.module.css'

/**
 * Zdravlje integracija svih klijenata.
 *
 * Integracija koja nikad nije proveravana i integracija koja ne odgovara nisu
 * isto stanje. Prikazivanje obe kao „neispravno" bi naterao konsultanta da
 * proverava ono što jednostavno još niko nije pokrenuo.
 */
export default async function HealthPage() {
  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t, formatRelative } = createTranslator(locale)

  const integrations = await listAllIntegrations(db)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="check" size={22} />
          {t('health.title')}
        </h1>
        <p className={styles.lede}>{t('health.lede')}</p>
      </header>

      {!integrations.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : integrations.value.length === 0 ? (
        <p className={styles.empty}>{t('health.empty')}</p>
      ) : (
        <div className={styles.card}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('health.col.client')}</th>
                  <th scope="col">{t('health.col.integration')}</th>
                  <th scope="col">{t('health.col.type')}</th>
                  <th scope="col">{t('health.col.state')}</th>
                  <th scope="col">{t('health.col.checked')}</th>
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
                    <td>{integration.name}</td>
                    <td className={styles.action}>{integration.connectorType}</td>
                    <td>
                      {integration.lastCheck === null ? (
                        <StatusBadge tone="neutral" label={t('health.state.unknown')} />
                      ) : integration.lastCheck.ok ? (
                        <StatusBadge tone="ok" label={t('health.state.ok')} />
                      ) : (
                        <StatusBadge tone="critical" label={t('health.state.failing')} />
                      )}
                    </td>
                    <td className={styles.when}>
                      {integration.lastCheck === null ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        formatRelative(integration.lastCheck.checkedAt)
                      )}
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
