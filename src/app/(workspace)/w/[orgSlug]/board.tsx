import type { Board } from '@/core/dashboard/board'
import type { MorningBrief } from '@/core/brief/loader'
import type { BusinessRules } from '@/core/rules/business-rules'
import type { Translator } from '@/i18n/translator'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import { ColumnChart, RankedBars, Sparkline, TrendChart } from '@/ui/charts'
import { AutoRefresh } from './auto-refresh'
import styles from './board.module.css'

/**
 * Tabla sa pokazateljima na početnoj strani klijenta.
 *
 * Stoji IZNAD brifa, ne umesto njega. Tabla odgovara na „koliko" i „kako se
 * kreće"; brif odgovara na „šta danas traži pažnju". Bez table rukovodilac
 * nema osećaj za veličine; bez brifa mora sam da zaključi šta je važno.
 *
 * Svi brojevi dolaze iz istih sposobnosti koje hrane i brif. Poseban put do
 * podataka značio bi da isti broj na dva mesta jednog dana ispadne različit.
 */

export interface BoardFormat {
  readonly t: Translator['t']
  readonly money: (value: string | number, currency: string) => string
  /**
   * Isti iznos, rastavljen na brojku i oznaku valute.
   *
   * Kartica ih prikazuje u dve veličine, pa mora da ih dobije razdvojene — a
   * razdvajanje ide kroz `formatToParts` istog oblikovača, ne kroz sečenje
   * niske: valuta u nekim jezicima stoji ISPRED broja.
   */
  readonly moneyParts: (value: string | number, currency: string) => {
    readonly value: string
    readonly unit: string
  }
  readonly number: (value: number) => string
  readonly percent: (value: number) => string
  readonly compact: (value: number, currency: string) => string
  readonly monthLabel: (month: string) => string
  readonly dayLabel: (date: string) => string
}

/*
 * Strelica je IKONICA, ne znak ↑ iz teksta.
 *
 * Znakovi strelica retko postoje u samom fontu, pa ih pregledač uzima iz
 * rezervnog — i onda jedini element na kartici koji nosi smer ispadne iz druge
 * porodice, druge debljine i druge visine od svega oko sebe.
 */
function Delta({ percent, f }: { percent: number | undefined; f: BoardFormat }) {
  if (percent === undefined || percent === 0) return null
  const up = percent > 0
  return (
    <span className={`${styles.kpiDelta} ${up ? styles.up : styles.down}`}>
      <Icon name={up ? 'trendUp' : 'trendDown'} size={14} />
      {f.percent(Math.abs(percent))}
    </span>
  )
}

/*
 * Novčani pokazatelj: brojka i valuta odvojeno, ili ništa ako podatka nema.
 *
 * Vraća se ceo deo objekta (`value` + `unit`) da se na mestu upotrebe ne bi
 * pisalo dva izraza koja mogu da se raziđu — jedan sa valutom, drugi bez.
 */
function moneyKpi(
  f: BoardFormat,
  amount: string | number | null | undefined,
  currency: string | undefined,
): { value: string | null; unit?: string } {
  if (amount === null || amount === undefined || currency === undefined) return { value: null }
  const parts = f.moneyParts(amount, currency)
  return { value: parts.value, unit: parts.unit }
}

interface Kpi {
  readonly key: string
  readonly label: string
  readonly value: string | null
  /** Oznaka valute uz brojku. Prazno kod pokazatelja koji nisu novac. */
  readonly unit?: string
  readonly deltaPercent?: number
  readonly note?: string
  readonly tone?: 'warn' | 'critical'
  readonly spark?: readonly number[]
}

function KpiCard({ kpi, f }: { kpi: Kpi; f: BoardFormat }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{kpi.label}</span>

      {kpi.value === null ? (
        // Nedostupno se NE prikazuje kao nula. Nula je podatak, izostanak nije.
        <span className={styles.kpiPending}>{f.t('board.unavailable')}</span>
      ) : (
        <span
          className={`${styles.kpiValue} ${
            kpi.tone === 'critical' ? styles.critical : kpi.tone === 'warn' ? styles.warn : ''
          }`.trim()}
        >
          {kpi.value}
          {kpi.unit ? <span className={styles.kpiUnit}>{kpi.unit}</span> : null}
        </span>
      )}

      {kpi.deltaPercent !== undefined || kpi.note ? (
        <span className={styles.kpiFoot}>
          <Delta percent={kpi.deltaPercent} f={f} />
          {kpi.note ? <span className={styles.kpiNote}>{kpi.note}</span> : null}
        </span>
      ) : null}

      {kpi.spark && kpi.spark.length > 1 ? (
        <div className={styles.kpiSpark}>
          <Sparkline values={kpi.spark} label={kpi.label} />
        </div>
      ) : null}
    </div>
  )
}

function ChartCard({
  icon,
  title,
  children,
  source,
  wide,
}: {
  icon: IconName
  title: string
  children: React.ReactNode
  source?: string | undefined
  wide?: boolean
}) {
  return (
    <section className={`${styles.chartCard} ${wide ? styles.chartWide : ''}`.trim()}>
      <h3 className={styles.chartTitle}>
        <span className={styles.chartIcon}>
          <Icon name={icon} size={17} />
        </span>
        {title}
      </h3>
      {children}
      {source ? <div className={styles.chartFoot}>{source}</div> : null}
    </section>
  )
}

export function MetricsBoard({
  board,
  brief,
  rules,
  refreshSeconds,
  f,
}: {
  board: Board
  brief: MorningBrief
  rules: BusinessRules
  refreshSeconds: number
  f: BoardFormat
}) {
  const sales = brief.sales.data
  const receivables = brief.receivables.data
  const payables = brief.payables.data
  const stock = brief.stock.data
  const financial = board.financial.data
  const daily = board.daily.data
  const history = board.history.data
  const headcount = board.headcount.data

  const dailyValues = (daily?.days ?? []).map((d) => Number(d.total))

  // Dospelo preko praga koji je firma postavila — ne fiksni „preko 90".
  const overdueBeyondThreshold = receivables
    ? receivables.buckets
        .filter((b) => b.fromDays >= rules.receivableCriticalDays)
        .reduce((sum, b) => sum + Number(b.amount), 0)
    : null

  const stockAtRisk = stock
    ? stock.items.filter(
        (i) =>
          i.averageDailySales > 0 &&
          (i.daysOfCover <= rules.stockWarningDays || i.daysOfCover < i.leadTimeDays),
      ).length
    : null

  const kpis: Kpi[] = [
    {
      key: 'salesYesterday',
      label: f.t('board.kpi.salesYesterday'),
      ...moneyKpi(f, sales?.yesterday.total, sales?.currency),
      ...(sales ? { deltaPercent: sales.yesterday.changePercent } : {}),
      // Sparkline nosi poslednjih sedam dana — oblik kretanja, ne vrednosti.
      ...(dailyValues.length > 1 ? { spark: dailyValues.slice(-7) } : {}),
    },
    {
      key: 'sales7',
      label: f.t('board.kpi.sales7'),
      ...moneyKpi(f, sales?.last7Days.total, sales?.currency),
      ...(sales ? { deltaPercent: sales.last7Days.changePercent } : {}),
      ...(dailyValues.length > 1 ? { spark: dailyValues.slice(-14) } : {}),
    },
    {
      key: 'salesMonth',
      label: f.t('board.kpi.salesMonth'),
      ...moneyKpi(f, sales?.monthToDate.total, sales?.currency),
      ...(sales ? { deltaPercent: sales.monthToDate.changePercent } : {}),
      ...(dailyValues.length > 1 ? { spark: dailyValues } : {}),
    },
    {
      key: 'revenue',
      label: f.t('board.kpi.revenue'),
      ...moneyKpi(f, financial?.revenue, financial?.currency),
    },
    {
      key: 'expenses',
      label: f.t('board.kpi.expenses'),
      ...moneyKpi(f, financial?.expenses, financial?.currency),
    },
    {
      key: 'profit',
      label: f.t('board.kpi.profit'),
      ...moneyKpi(f, financial?.profit, financial?.currency),
      ...(financial && Number(financial.profit) < 0 ? { tone: 'critical' as const } : {}),
      ...(financial
        ? { note: `${f.t('board.kpi.margin')} ${f.percent(financial.marginPercent)}` }
        : {}),
    },
    {
      key: 'receivables',
      label: f.t('board.kpi.receivables'),
      ...moneyKpi(f, receivables?.total, receivables?.currency),
    },
    {
      key: 'overdue',
      label: f.t('board.kpi.overdue', { days: rules.receivableCriticalDays }),
      ...moneyKpi(f, overdueBeyondThreshold, receivables?.currency),
      ...(overdueBeyondThreshold !== null && overdueBeyondThreshold > 0
        ? { tone: 'critical' as const }
        : {}),
    },
    {
      key: 'payables7',
      label: f.t('board.kpi.payables7'),
      ...moneyKpi(f, payables?.dueWithin7Days, payables?.currency),
      ...(payables && Number(payables.dueWithin7Days) > 0 ? { tone: 'warn' as const } : {}),
    },
    {
      key: 'stockRisk',
      label: f.t('board.kpi.stockRisk'),
      value: stockAtRisk === null ? null : f.number(stockAtRisk),
      ...(stockAtRisk !== null && stockAtRisk > 0 ? { tone: 'warn' as const } : {}),
      ...(stock ? { note: f.t('board.kpi.items', { count: stock.items.length }) } : {}),
    },
    {
      key: 'headcount',
      label: f.t('board.kpi.headcount'),
      value: headcount ? f.number(headcount.total) : null,
      ...(headcount
        ? { note: f.t('board.kpi.departments', { count: headcount.departments.length }) }
        : {}),
    },
  ]

  const sourceLine = (block: { provenance?: { sources: readonly { label: string }[] } }) =>
    block.provenance?.sources[0]?.label

  return (
    <div className={styles.board}>
      <AutoRefresh
        intervalSeconds={refreshSeconds}
        readAt={board.readAt}
        labels={{
          // Šabloni, ne gotov tekst — vreme se računa na klijentu.
          readAt: f.t('board.readAt', { when: '{when}' }),
          auto: f.t('board.autoRefresh', { seconds: '{seconds}' }),
          refresh: f.t('board.refresh'),
          refreshing: f.t('board.refreshing'),
        }}
      />

      <div className={styles.kpis}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} f={f} />
        ))}
      </div>

      <div className={styles.charts}>
        <ChartCard
          icon="chart"
          title={f.t('board.chart.daily')}
          source={sourceLine(board.daily)}
          wide
        >
          {daily && daily.days.length > 0 ? (
            <ColumnChart
              points={daily.days.map((d) => ({
                label: f.dayLabel(d.date),
                value: Number(d.total),
              }))}
              format={(v) => f.compact(v, daily.currency)}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.period'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>

        <ChartCard icon="chart" title={f.t('board.chart.history')} source={sourceLine(board.history)}>
          {history && history.months.length > 1 ? (
            <TrendChart
              points={history.months.map((m) => ({
                label: f.monthLabel(m.month),
                value: Number(m.total),
              }))}
              format={(v) => f.compact(v, history.currency)}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.period'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>

        <ChartCard
          icon="receipt"
          title={f.t('board.chart.aging')}
          source={sourceLine(brief.receivables)}
        >
          {receivables ? (
            <RankedBars
              // Rampa prati STAROST duga, ne veličinu iznosa: uređena skala
              // gde je tamnije starije, pa se najstariji opseg vidi i kada
              // nosi manji novac.
              bars={receivables.buckets.map((b, index) => ({
                label:
                  b.toDays === null
                    ? f.t('brief.receivables.bucketOpen', { from: b.fromDays })
                    : f.t('brief.receivables.bucket', { from: b.fromDays, to: b.toDays }),
                value: Number(b.amount),
                display: f.money(b.amount, receivables.currency),
                step: index,
              }))}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.period'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>

        <ChartCard icon="box" title={f.t('board.chart.coverage')} source={sourceLine(brief.stock)}>
          {stock ? (
            <RankedBars
              bars={[...stock.items]
                .filter((i) => i.averageDailySales > 0)
                .sort((a, b) => a.daysOfCover - b.daysOfCover)
                .slice(0, 6)
                .map((i) => ({
                  label: i.item,
                  value: i.daysOfCover,
                  display: f.t('panel.days', { days: i.daysOfCover }),
                  /*
                   * Korak rampe nosi RIZIK, ne veličinu: najkraća pokrivenost
                   * je najtamnija. Da je obrnuto, artikal koji traje najduže
                   * bi bio najuočljiviji — tačno suprotno od onoga što se
                   * traži.
                   */
                  step:
                    i.daysOfCover <= rules.stockCriticalDays || i.daysOfCover < i.leadTimeDays
                      ? 3
                      : i.daysOfCover <= rules.stockWarningDays
                        ? 2
                        : 0,
                }))}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.item'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>

        <ChartCard
          icon="users"
          title={f.t('board.chart.departments')}
          source={sourceLine(board.headcount)}
        >
          {headcount && headcount.departments.length > 0 ? (
            <RankedBars
              bars={[...headcount.departments]
                .sort((a, b) => b.count - a.count)
                .map((d) => ({
                  label: d.name,
                  value: d.count,
                  display: f.number(d.count),
                  step: 1,
                }))}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.item'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
