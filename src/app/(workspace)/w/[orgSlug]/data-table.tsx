import styles from './page.module.css'

/**
 * Tabela u radnom prostoru klijenta.
 *
 * Serverska komponenta bez interakcije — namerno. Kartice odgovaraju na
 * „koliko", tabela na „ko" i „šta", i to je sve što ovde treba.
 *
 * Prazan rezultat i nedostupan podatak se NE prikazuju isto: „nema dugovanja"
 * i „ne mogu da pročitam" su u poslovnom razgovoru dve različite vesti.
 */
export interface Column<T> {
  readonly key: string
  readonly header: string
  readonly render: (row: T) => string
  /** Brojevi idu desno, sa tabularnim ciframa. */
  readonly numeric?: boolean
  /** Vrednost koja traži pažnju dobija upozoravajuću boju. */
  readonly warn?: (row: T) => boolean
}

export function DataTable<T>({
  columns,
  rows,
  caption,
  emptyLabel,
  unavailableLabel,
  unavailable,
}: {
  columns: readonly Column<T>[]
  rows: readonly T[]
  caption?: string | undefined
  emptyLabel: string
  unavailableLabel: string
  unavailable?: string | undefined
}) {
  if (unavailable) {
    return (
      <div className={styles.unavailable}>
        <span className={styles.unavailableLabel}>{unavailableLabel}</span>
        <span>{unavailable}</span>
      </div>
    )
  }

  if (rows.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        {caption ? <caption className={styles.tableCaption}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? styles.numeric : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={[
                    c.numeric ? styles.numeric : '',
                    c.warn?.(row) ? styles.warnCell : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
