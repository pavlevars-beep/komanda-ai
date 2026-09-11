import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { DATASET_KINDS, FIELDS } from '@/core/import/mapping'
import { listDatasets } from '@/core/import/repository'
import { reportCadence } from '@/core/import/expectations'
import type { CadenceState as CadenceStateName } from '@/core/import/cadence'
import { Icon } from '@/ui/primitives/Icon'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { ImportForm, type FieldOption } from './import-form'
import { CadenceForm, type CadenceStatus } from './cadence-form'
import styles from './import.module.css'

const STATUS_TONE: Record<string, Tone> = {
  ready: 'ok',
  superseded: 'neutral',
  failed: 'critical',
  pending: 'warn',
}

const CADENCE_TONE: Record<CadenceStateName, Tone> = {
  onTime: 'ok',
  awaiting: 'info',
  late: 'warn',
  missing: 'critical',
  never: 'critical',
  paused: 'neutral',
}

/*
 * Kratak spisak zona umesto svih četiri stotine iz IANA baze. Ponuda u kojoj se
 * traži znači da neko bira prvu koja liči — a pogrešna zona pomera rok za sate.
 */
const TIME_ZONES = [
  'Europe/Belgrade',
  'Europe/Zagreb',
  'Europe/Sarajevo',
  'Europe/Podgorica',
  'Europe/Skopje',
  'Europe/Ljubljana',
  'Europe/Vienna',
  'Europe/Berlin',
  'Europe/London',
  'Asia/Dubai',
  'Asia/Shanghai',
  'UTC',
]

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

  const [datasets, cadence] = await Promise.all([
    listDatasets(db, orgId, integrationId),
    reportCadence(db, orgId, integrationId),
  ])

  const byKind = new Map(
    cadence.ok ? cadence.value.map((report) => [report.kind, report] as const) : [],
  )

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
          duplicate: t('import.duplicate'),
          duplicateWhen: t('import.duplicateWhen', { when: '{when}', file: '{file}' }),
          duplicateHint: t('import.duplicateHint'),
          remembered: t('import.mapping.remembered'),
          headersChanged: t('import.mapping.changed'),
          moved: t('import.mapping.moved', { columns: '{columns}' }),
          added: t('import.mapping.added', { columns: '{columns}' }),
          missing: t('import.mapping.missing', { fields: '{fields}' }),
        }}
      />

      <section className={styles.head}>
        <h2 className={styles.label}>{t('import.cadence.title')}</h2>
        <p className={styles.lede}>{t('import.cadence.lede')}</p>
      </section>

      {DATASET_KINDS.map((kind) => {
        const report = byKind.get(kind)
        const verdict = report?.verdict

        const detail = !verdict
          ? ''
          : [
              verdict.lastArrivalAt
                ? t('import.cadence.lastArrival', {
                    when: formatDate(verdict.lastArrivalAt, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }),
                  })
                : t('import.cadence.never'),
              verdict.nextDueAt
                ? t('import.cadence.nextDue', {
                    when: formatDate(verdict.nextDueAt, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }),
                  })
                : '',
            ]
              .filter(Boolean)
              .join(' · ')

        const status: CadenceStatus | null = verdict
          ? {
              label: t(`import.cadence.state.${verdict.state}` as MessageKey),
              tone: CADENCE_TONE[verdict.state],
              detail,
            }
          : null

        return (
          <CadenceForm
            key={kind}
            organizationId={orgId}
            integrationId={integrationId}
            kind={kind}
            kindLabel={t(`import.kind.${kind}` as MessageKey)}
            value={
              report
                ? {
                    weekdays: report.expectation.weekdays,
                    byTime: report.expectation.by_time.slice(0, 5),
                    timeZone: report.expectation.time_zone,
                    graceMinutes: report.expectation.grace_minutes,
                    pausedUntil: report.expectation.paused_until,
                    enabled: report.expectation.enabled,
                  }
                : null
            }
            status={status}
            labels={{
              days: t('import.cadence.days'),
              byTime: t('import.cadence.byTime'),
              timeZone: t('import.cadence.timeZone'),
              grace: t('import.cadence.grace'),
              graceUnit: t('import.cadence.graceUnit'),
              graceHint: t('import.cadence.graceHint'),
              enabled: t('import.cadence.enabled'),
              pausedUntil: t('import.cadence.pausedUntil'),
              pausedHint: t('import.cadence.pausedHint'),
              save: t('import.cadence.save'),
              saved: t('import.cadence.saved'),
              remove: t('import.cadence.remove'),
              none: t('import.cadence.none'),
              weekdays: [1, 2, 3, 4, 5, 6, 7].map((value) => ({
                value,
                label: t(`import.cadence.weekday.${value}` as MessageKey),
              })),
              zones: TIME_ZONES,
              messages: messagesFor(locale, ['error.', 'import.cadence.error.']),
            }}
          />
        )
      })}

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
