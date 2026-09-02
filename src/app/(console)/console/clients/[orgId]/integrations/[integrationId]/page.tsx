import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { callRpc } from '@/server/db/rpc'
import { z } from 'zod'
import { getConsoleClient } from '@/core/organizations/console-repository'
import {
  getIntegration,
  listCapabilityState,
  listHealthChecks,
} from '@/core/integrations/repository'
import { declaredCapabilities } from '@/core/integrations/capabilities'
import { availableConnectorTypes, getConnector, initialiseConnectors } from '@/core/connectors'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { StatusBadge, DemoBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { IntegrationPanel } from './integration-panel'
import { CapabilityList } from './capability-list'
import styles from '../integrations.module.css'

const STATUS_TONE: Record<string, Tone> = {
  connected: 'ok',
  testing: 'info',
  draft: 'neutral',
  needs_attention: 'warn',
  disconnected: 'critical',
  disabled: 'neutral',
}

const credentialSummary = z.object({
  hint: z.string().nullable(),
  is_expired: z.boolean(),
})

export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; integrationId: string }>
}) {
  const { orgId, integrationId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(integrationId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const [client, integration] = await Promise.all([
    getConsoleClient(db, orgId),
    getIntegration(db, orgId, integrationId),
  ])
  if (!client.ok || !integration.ok) notFound()

  const { t, formatDate } = createTranslator(await requestLocale(user.locale))

  const [credential, health] = await Promise.all([
    callRpc(db, 'integration_credential_summary', { p_integration_id: integrationId }),
    listHealthChecks(db, orgId, integrationId),
  ])

  // Vraća samo naznaku i rokove — vrednost tajne ne postoji u ovom odgovoru.
  const summary = z.array(credentialSummary).safeParse(credential.data)
  const hint = summary.success ? (summary.data[0]?.hint ?? null) : null

  const value = integration.value
  initialiseConnectors()
  const connector = getConnector(value.connector_type_key)
  const implemented = availableConnectorTypes().includes(value.connector_type_key)

  // Spisak sposobnosti dolazi iz konektora u kodu; baza samo kaže koje su
  // uključene. Kada konektor nije implementiran, spiska nema — i tada se ne
  // prikazuje prazna lista nego razlog.
  const declared = connector ? declaredCapabilities(connector, value, user.id) : []
  const capabilities = connector
    ? await listCapabilityState(db, orgId, integrationId, declared)
    : null

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/console/clients/${orgId}/integrations` as Route} className={styles.crumb}>
          ← {t('integrations.title')}
        </Link>
        <div className={styles.headRow}>
          <h1 className={styles.title}>{value.name}</h1>
        </div>
        <div className={styles.cardTitle}>
          <StatusBadge
            tone={STATUS_TONE[value.status] ?? 'neutral'}
            label={t(`integration.status.${value.status}` as MessageKey)}
          />
          <span className={styles.meta}>
            {value.connector_type_key} ·{' '}
            {t(`integrations.environment.${value.environment}` as MessageKey)} · {value.auth_type}
          </span>
          {value.is_demo ? <DemoBadge label={t('common.demoData')} /> : null}
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.facts}>
          <span className={styles.fact}>
            <span className={styles.factLabel}>{t('integrations.lastSuccess')}</span>
            <span className={styles.factValue}>
              {value.last_success_at
                ? formatDate(value.last_success_at)
                : t('integrations.never')}
            </span>
          </span>
          {value.last_error_at ? (
            <span className={styles.fact}>
              <span className={styles.factLabel}>{t('integrations.lastError')}</span>
              <span className={styles.factValue}>
                {formatDate(value.last_error_at)}
                {value.last_error_code ? ` · ${value.last_error_code}` : ''}
              </span>
            </span>
          ) : null}
        </div>
      </section>

      {implemented ? (
        <IntegrationPanel
          organizationId={orgId}
          integrationId={integrationId}
          authType={value.auth_type}
          labels={{
            test: t('integrations.test'),
            testOk: (ms) => t('integrations.testOk', { ms }),
            testFailed: t('integrations.testFailed'),
            credential: t('integrations.credential'),
            credentialHint: t('integrations.credentialHint'),
            credentialSave: t('integrations.credentialSave'),
            credentialSaved: t('integrations.credentialSaved'),
            credentialNone: t('integrations.credentialNone'),
            currentHint: hint,
            message: (key) => t(key as MessageKey),
          }}
        />
      ) : (
        // Integracija postoji u bazi, ali konektor nije registrovan u kodu.
        // Test i kredencijal se ne nude jer ne bi imali šta da pozovu.
        <section className={styles.panel}>
          <p className={styles.hint}>{t('integrations.error.notImplemented')}</p>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('integrations.capabilities')}</h2>
          <span className={styles.hint}>
            {capabilities?.ok
              ? t('integrations.capabilityCount', {
                  enabled: capabilities.value.filter((c) => c.enabled).length,
                  total: capabilities.value.length,
                })
              : ''}
          </span>
        </div>

        {!capabilities ? (
          <p className={styles.hint}>{t('integrations.error.notImplemented')}</p>
        ) : !capabilities.ok ? (
          <p className={styles.hint}>{t(capabilities.error.key as MessageKey)}</p>
        ) : capabilities.value.length === 0 ? (
          <p className={styles.hint}>{t('integrations.capabilitiesNone')}</p>
        ) : (
          <CapabilityList
            organizationId={orgId}
            integrationId={integrationId}
            capabilities={capabilities.value}
            labels={{
              enable: t('integrations.capabilityEnable'),
              disable: t('integrations.capabilityDisable'),
              enabled: t('integrations.capabilityEnabled'),
              disabled: t('integrations.capabilityDisabled'),
              mode: (mode) => t(`integrations.capabilityMode.${mode}` as MessageKey),
              permission: t('integrations.capabilityPermission'),
              unknown: t('integrations.capabilityUnknown'),
              unknownHint: t('integrations.capabilityUnknownHint'),
              executeHint: t('integrations.capabilityExecuteHint'),
              message: (key) => t(key as MessageKey),
            }}
          />
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{t('integrations.healthHistory')}</h2>
        </div>

        {!health.ok ? (
          <p className={styles.hint}>{t(health.error.key as MessageKey)}</p>
        ) : health.value.length === 0 ? (
          // Prazna istorija nije greška: veza jednostavno još nije proveravana.
          <p className={styles.hint}>{t('integrations.healthHistoryNone')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.tableCaption}>
                {t('integrations.healthHistoryCaption')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('integrations.healthWhen')}</th>
                  <th scope="col">{t('integrations.healthOutcome')}</th>
                  <th scope="col" className={styles.numeric}>
                    {t('integrations.healthLatency')}
                  </th>
                  <th scope="col">{t('integrations.healthDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {health.value.map((check) => (
                  <tr key={check.id}>
                    <td>{formatDate(check.checked_at)}</td>
                    <td>
                      <StatusBadge
                        tone={check.ok ? 'ok' : 'critical'}
                        label={
                          check.ok
                            ? t('integrations.healthOk')
                            : t('integrations.healthFailed')
                        }
                      />
                    </td>
                    <td className={styles.numeric}>
                      {check.latency_ms === null ? '—' : `${check.latency_ms} ms`}
                    </td>
                    <td className={styles.detail}>
                      {check.error_code ?? ''}
                      {check.error_message ? ` · ${check.error_message}` : ''}
                      {!check.error_code && !check.error_message ? '—' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
