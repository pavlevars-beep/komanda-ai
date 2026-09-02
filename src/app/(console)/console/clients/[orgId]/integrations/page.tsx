import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { getConsoleClient } from '@/core/organizations/console-repository'
import { listIntegrations } from '@/core/integrations/repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { StatusBadge, DemoBadge, type Tone } from '@/ui/patterns/StatusBadge'
import styles from './integrations.module.css'

const STATUS_TONE: Record<string, Tone> = {
  connected: 'ok',
  testing: 'info',
  draft: 'neutral',
  needs_attention: 'warn',
  disconnected: 'critical',
  disabled: 'neutral',
}

export default async function IntegrationsPage({
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

  const { t, formatRelative } = createTranslator(await requestLocale(user.locale))
  const integrations = await listIntegrations(db, orgId)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/console/clients/${orgId}` as Route} className={styles.crumb}>
          ← {client.value.display_name}
        </Link>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{t('integrations.title')}</h1>
          <Link
            href={`/console/clients/${orgId}/integrations/new` as Route}
            className={styles.primaryLink}
          >
            {t('integrations.new')}
          </Link>
        </div>
        <p className={styles.lede}>{t('integrations.lede')}</p>
      </header>

      {!integrations.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : integrations.value.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('integrations.empty')}</p>
          <Link
            href={`/console/clients/${orgId}/integrations/new` as Route}
            className={styles.primaryLink}
          >
            {t('integrations.new')}
          </Link>
        </div>
      ) : (
        <div className={styles.list}>
          {integrations.value.map((i) => (
            <Link
              key={i.id}
              href={`/console/clients/${orgId}/integrations/${i.id}` as Route}
              className={styles.card}
            >
              <div className={styles.cardBody}>
                <span className={styles.cardTitle}>
                  <span className={styles.name}>{i.name}</span>
                  <StatusBadge
                    tone={STATUS_TONE[i.status] ?? 'neutral'}
                    label={t(`integration.status.${i.status}` as MessageKey)}
                  />
                  {i.is_demo ? <DemoBadge label="Demo" /> : null}
                </span>
                <span className={styles.meta}>
                  {i.connector_type_key} ·{' '}
                  {t(`integrations.environment.${i.environment}` as MessageKey)}
                </span>
                {/* Poruka o grešci je već redaktovana u runneru. */}
                {i.last_error_message && i.status === 'needs_attention' ? (
                  <span className={styles.error}>{i.last_error_message}</span>
                ) : null}
              </div>
              <span className={styles.when}>
                {i.last_success_at ? formatRelative(i.last_success_at) : t('integrations.never')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
