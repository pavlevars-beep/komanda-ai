import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { DATASET_KINDS, FIELDS } from '@/core/import/mapping'
import { listDatasets } from '@/core/import/repository'
import { Icon } from '@/ui/primitives/Icon'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { ImportForm, type FieldOption } from './import-form'
import styles from './import.module.css'

const STATUS_TONE: Record<string, Tone> = {
  ready: 'ok',
  superseded: 'neutral',
  failed: 'critical',
  pending: 'warn',
}

export default async function ImportPage({
  params,
}: {
  params: Promise<{ orgId: string; integrationId: string }>
}) {
  const { orgId, integrationId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^[0-9a-f-]{36}$/i.test(integrationId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t, formatDate } = createTranslator(locale)

  const datasets = await listDatasets(db, orgId, integrationId)

  const fields: Record<string, readonly FieldOption[]> = {}
  for (const kind of DATASET_KINDS) {
    fields[kind] = FIELDS[kind].map((f) => ({
      key: f.key,
      label: t(`import.field.${f.key}` as MessageKey),
      required: f.required,
    }))
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link
          href={`/console/clients/${orgId}/integrations/${integrationId}` as Route}
          className={styles.crumb}
        >
          ← {t('integrations.title')}
        </Link>
        <h1 className={styles.title}>
          <Icon name="upload" size={22} />
          {t('import.title')}
        </h1>
        <p className={styles.lede}>{t('import.lede')}</p>
      </header>

      <ImportForm
        organizationId={orgId}
        integrationId={integrationId}
        fields={fields}
        labels={{
          kind: t('import.kind'),
          kinds: DATASET_KINDS.map((k) => ({
            key: k,
            label: t(`import.kind.${k}` as MessageKey),
          })),
          file: t('import.file'),
          fileHint: t('import.fileHint'),
          analyze: t('import.analyze'),
          confirm: t('import.confirm'),
          cancel: t('import.cancel'),
          mapping: t('import.mapping'),
          mappingHint: t('import.mappingHint'),
          columnNone: t('import.column.none'),
          // Šabloni, ne gotove rečenice — brojeve umeće klijentska komponenta.
          column: t('import.column', { index: '{index}' }),
          required: t('import.required'),
          preview: t('import.preview'),
          detected: t('import.detected', { count: '{count}', rows: '{rows}' }),
          imported: t('import.imported', { rows: '{rows}' }),
          withProblems: t('import.withProblems', { rows: '{rows}', problems: '{problems}' }),
          fields: messagesFor(locale, ['import.field.']),
          messages: messagesFor(locale, ['error.', 'import.error.']),
        }}
      />

      <section className={styles.head}>
        <h2 className={styles.label}>{t('import.history')}</h2>
      </section>

      {!datasets.ok ? (
        <p className={styles.empty}>{t('state.error.title')}</p>
      ) : datasets.value.length === 0 ? (
        <p className={styles.empty}>{t('import.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {datasets.value.map((dataset) => (
            <li key={dataset.id} className={styles.item}>
              <span className={styles.itemName}>
                {t(`import.kind.${dataset.kind}` as MessageKey)} · {dataset.file_name}
              </span>
              <span className={styles.itemMeta}>
                {t('import.rowsAndProblems', {
                  rows: dataset.row_count,
                  problems: dataset.problem_count,
                })}{' '}
                · {formatDate(dataset.imported_at, { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <StatusBadge
                tone={STATUS_TONE[dataset.status] ?? 'neutral'}
                label={t(`import.status.${dataset.status}` as MessageKey)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
