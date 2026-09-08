'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import { interpolate } from '@/i18n/translator'
import { analyzeFileAction, importFileAction, type AnalyzeState, type ImportState } from './actions'
import styles from './import.module.css'

export interface FieldOption {
  readonly key: string
  readonly label: string
  readonly required: boolean
}

export interface Labels {
  readonly kind: string
  readonly kinds: readonly { key: string; label: string }[]
  readonly file: string
  readonly fileHint: string
  readonly analyze: string
  readonly confirm: string
  readonly cancel: string
  readonly mapping: string
  readonly mappingHint: string
  readonly columnNone: string
  /** Šablon sa {index}. */
  readonly column: string
  readonly required: string
  readonly preview: string
  /** Šabloni sa {count}, {rows}, {problems}. */
  readonly detected: string
  readonly imported: string
  readonly withProblems: string
  readonly fields: Readonly<Record<string, string>>
  readonly messages: Readonly<Record<string, string>>
}

/**
 * Uvoz u dva koraka.
 *
 * Prvi korak čita zaglavlje i predlaže mapiranje; drugi upisuje. Fajl se
 * između koraka nosi u samom obrascu, pa se ne otprema dvaput i ne ostaje
 * nedovršen skup kada konsultant odustane pošto vidi predlog.
 *
 * Predlog se UVEK prikazuje na potvrdu, i kada je siguran. Automatski uvoz bez
 * pogleda na kolone je najbrži način da iznos završi u koloni za datum, a to
 * se otkriva tek kada tabla pokaže besmislen broj.
 */
export function ImportForm({
  organizationId,
  integrationId,
  fields,
  labels,
}: {
  organizationId: string
  integrationId: string
  /** Polja po vrsti skupa; menjaju se kada se promeni izbor. */
  fields: Readonly<Record<string, readonly FieldOption[]>>
  labels: Labels
}) {
  const [analysis, analyze, analyzing] = useActionState<AnalyzeState, FormData>(
    analyzeFileAction,
    {},
  )
  const [result, runImport, importing] = useActionState<ImportState, FormData>(
    importFileAction,
    {},
  )

  const detected = analysis.analysis

  return (
    <>
      <form action={analyze} className={styles.card}>
        <div className={styles.row}>
          <div className={styles.group}>
            <label className={styles.label} htmlFor="import-kind">
              {labels.kind}
            </label>
            <select id="import-kind" name="kind" className={styles.select} defaultValue="sales">
              {labels.kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.group}>
            <label className={styles.label} htmlFor="import-file">
              {labels.file}
            </label>
            <input
              id="import-file"
              type="file"
              name="file"
              className={styles.file}
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            />
            <span className={styles.hint}>{labels.fileHint}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="submit" disabled={analyzing}>
            <Icon name="upload" size={16} />
            {labels.analyze}
          </Button>
          {analysis.error ? (
            <span className={styles.error} role="alert">
              {labels.messages[analysis.error] ?? analysis.error}
            </span>
          ) : null}
        </div>
      </form>

      {detected ? (
        <form action={runImport} className={styles.card}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="integrationId" value={integrationId} />
          <input type="hidden" name="kind" value={detected.kind} />
          <input type="hidden" name="fileName" value={detected.fileName} />
          <input type="hidden" name="payload" value={detected.payload} />

          <div className={styles.group}>
            <span className={styles.label}>{labels.mapping}</span>
            <span className={styles.hint}>
              {interpolate(labels.detected, {
                count: detected.headers.length,
                rows: detected.rowCount,
              })}{' '}
              {labels.mappingHint}
            </span>
          </div>

          <div className={styles.row}>
            {(fields[detected.kind] ?? []).map((field) => (
              <div key={field.key} className={styles.group}>
                <label className={styles.label} htmlFor={`map-${field.key}`}>
                  {labels.fields[field.key] ?? field.key}{' '}
                  {field.required ? <span className={styles.required}>{labels.required}</span> : null}
                </label>
                <select
                  id={`map-${field.key}`}
                  name={`map.${field.key}`}
                  className={styles.select}
                  defaultValue={String(detected.mapping[field.key] ?? '')}
                >
                  <option value="">{labels.columnNone}</option>
                  {detected.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header.trim() === ''
                        ? interpolate(labels.column, { index: index + 1 })
                        : header}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className={styles.group}>
            <span className={styles.label}>{labels.preview}</span>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {detected.headers.map((header, index) => (
                      <th key={index} scope="col">
                        <span className={styles.colIndex}>{index + 1}</span> {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detected.preview.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {detected.headers.map((_, index) => (
                        <td key={index}>{row[index] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={importing}>
              <Icon name="check" size={16} />
              {labels.confirm}
            </Button>

            {result.error ? (
              <span className={styles.error} role="alert">
                {labels.messages[result.error] ?? result.error}
                {result.detail ? <span className={styles.detail}> {result.detail}</span> : null}
              </span>
            ) : null}

            {result.imported ? (
              <span
                className={result.imported.problems > 0 ? styles.warn : styles.ok}
                role="status"
              >
                {result.imported.problems > 0
                  ? interpolate(labels.withProblems, {
                      rows: result.imported.rows,
                      problems: result.imported.problems,
                    })
                  : interpolate(labels.imported, { rows: result.imported.rows })}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </>
  )
}
