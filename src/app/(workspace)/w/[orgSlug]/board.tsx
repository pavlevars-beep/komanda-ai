import type { Board } from '@/core/dashboard/board'
import type { MorningBrief } from '@/core/brief/loader'
import type { BusinessRules } from '@/core/rules/business-rules'
import type { Translator } from '@/i18n/translator'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import { ChangeChip } from '@/ui/primitives/ChangeChip'
import { ColumnChart, Dumbbell, RankedBars, ShareBar, Sparkline, TrendChart } from '@/ui/charts'
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
 *
 * Raspored ima TRI nivoa, i to je jedina stvar koja razdvaja tablu od spiska.
 * Prva verzija je imala jedanaest jednakih kartica: sve podjednako krupno
 * znači da ništa nije krupno, pa oko počne od gornje leve i ide redom, umesto
 * da ode na ono što je najvažnije.
 *
 *   1. Jedan broj vodi — mesečna prodaja, na istaknutoj traci.
 *   2. Ostali stoje u pojasevima po temi: prodaja, novac, zalihe i ljudi.
 *   3. Grafikoni se razlikuju po OBLIKU, ne po boji: stubići, linija, udeo u
 *      celini, dve tačke po stavci. Oblik se bira prema poslu podatka, pa
 *      dospelost duga (deo celine) i pokrivenost zaliha (vrednost prema
 *      pragu) više ne izgledaju kao isti grafikon dvaput.
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
 * Oznaka promene uvek nosi i osnovu poređenja.
 *
 * „↘ 4%" bez osnove je zagonetka: manje od čega — od juče, od prošlog meseca,
 * od plana? Osnovu zna onaj ko je broj izračunao, pa je ovde prosleđuje kao
 * gotovu frazu; `ChangeChip` je pokazuje pored brojke ili na prelaz mišem,
 * dodir i tastaturu, a čitaču ekrana uvek.
 */
function Delta({
  percent,
  hint,
  f,
  expose,
}: {
  percent: number | undefined
  hint: string | undefined
  f: BoardFormat
  expose?: boolean
}) {
  if (percent === undefined || percent === 0 || hint === undefined) return null
  const up = percent > 0
  const value = f.percent(Math.abs(percent))
  return (
    <ChangeChip
      direction={up ? 'up' : 'down'}
      value={value}
      hint={hint}
      ariaLabel={f.t(up ? 'delta.up' : 'delta.down', { value, hint })}
      {...(expose ? { expose: true } : {})}
    />
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

type BandKey = 'sales' | 'money' | 'stock'

interface Kpi {
  readonly key: string
  readonly band: BandKey
  readonly label: string
  readonly value: string | null
  /** Oznaka valute uz brojku. Prazno kod pokazatelja koji nisu novac. */
  readonly unit?: string
  readonly deltaPercent?: number
  /** Osnova poređenja uz promenu, kao nastavak rečenice. Bez nje nema oznake. */
  readonly deltaHint?: string
  readonly note?: string
  /** Boja napomene; odvojena od boje brojke, jer se tiču različitih stvari. */
  readonly noteTone?: 'warn' | 'critical'
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
          <Delta percent={kpi.deltaPercent} hint={kpi.deltaHint} f={f} />
          {kpi.note ? (
            <span
              className={`${styles.kpiNote} ${
                kpi.noteTone === 'critical'
                  ? styles.critical
                  : kpi.noteTone === 'warn'
                    ? styles.warn
                    : ''
              }`.trim()}
            >
              {kpi.note}
            </span>
          ) : null}
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

/**
 * Istaknuta traka: jedan broj koji tabla vodi.
 *
 * Bira se mesečna prodaja, i izbor nije stvar ukusa — to je jedini broj na
 * tabli koji se menja svakog dana, tiče se svih odeljenja i pokreće razgovor.
 * Ostali pokazatelji su odgovori na pitanja koja se postave POSLE njega.
 *
 * Traka je tamna zato što se razlika u PODLOZI čita brže od razlike u
 * veličini slova: prvi pogled pada na nju pre nego što je iko pročitao ijednu
 * reč. Linija ispod brojke nosi poslednjih trideset dana, bez ose i oznaka —
 * na traci se čita oblik, a tačni dani stoje u grafikonu ispod.
 */
function HeroPanel({
  kpi,
  aside,
  f,
}: {
  kpi: Kpi
  aside: readonly Kpi[]
  f: BoardFormat
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroMain}>
        <span className={styles.heroLabel}>{kpi.label}</span>

        {kpi.value === null ? (
          <span className={styles.heroPending}>{f.t('board.unavailable')}</span>
        ) : (
          <span className={styles.heroValue}>
            {kpi.value}
            {kpi.unit ? <span className={styles.heroUnit}>{kpi.unit}</span> : null}
          </span>
        )}

        {/*
          Na vodećem broju osnova stoji ISPISANA, ne u oblačiću.
          Broj koji tabla vodi ne sme da traži prelaz mišem da bi se razumeo —
          a ovde ima mesta da se pročita cela rečenica.
        */}
        <span className={styles.heroFoot}>
          <Delta percent={kpi.deltaPercent} hint={kpi.deltaHint} f={f} expose />
        </span>
      </div>

      {/*
        Uz vodeći broj stoje dva manja iz iste porodice — juče i sedam dana.
        Bez njih se mesečni zbir čita kao stanje, a sa njima kao TOK: isti
        podatak na tri dužine daje smer koji jedan broj ne nosi.
      */}
      <div className={styles.heroAside}>
        {aside.map((item) => (
          <div key={item.key} className={styles.heroSmall}>
            <span className={styles.heroSmallLabel}>{item.label}</span>
            <span className={styles.heroSmallValue}>
              {item.value ?? f.t('board.unavailable')}
              {item.value !== null && item.unit ? (
                <span className={styles.heroUnit}>{item.unit}</span>
              ) : null}
            </span>
            <Delta percent={item.deltaPercent} hint={item.deltaHint} f={f} />
          </div>
        ))}
      </div>

      {kpi.spark && kpi.spark.length > 1 ? (
        <div className={styles.heroSpark}>
          <Sparkline values={kpi.spark} label={kpi.label} height={64} area />
        </div>
      ) : null}
    </section>
  )
}

/** Naslov pojasa — tema iznad grupe kartica, sa svojom bojom i ikonicom. */
function BandHead({ band, title, icon }: { band: BandKey; title: string; icon: IconName }) {
  return (
    <h3 className={`${styles.bandHead} ${styles[`band-${band}`] ?? ''}`.trim()}>
      <span className={styles.bandIcon}>
        <Icon name={icon} size={15} />
      </span>
      {title}
    </h3>
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
      key: 'salesMonth',
      band: 'sales',
      label: f.t('board.kpi.salesMonth'),
      ...moneyKpi(f, sales?.monthToDate.total, sales?.currency),
      ...(sales
        ? {
            deltaPercent: sales.monthToDate.changePercent,
            // Poredi se ISTI broj dana prethodnog meseca, ne pun mesec — inače
            // bi svaki prvi u mesecu lažno prijavio pad.
            deltaHint: f.t('delta.vsSameLastMonth'),
          }
        : {}),
      ...(dailyValues.length > 1 ? { spark: dailyValues } : {}),
    },
    {
      key: 'salesYesterday',
      band: 'sales',
      label: f.t('board.kpi.salesYesterday'),
      ...moneyKpi(f, sales?.yesterday.total, sales?.currency),
      ...(sales
        ? { deltaPercent: sales.yesterday.changePercent, deltaHint: f.t('delta.vsDayBefore') }
        : {}),
      // Sparkline nosi poslednjih sedam dana — oblik kretanja, ne vrednosti.
      ...(dailyValues.length > 1 ? { spark: dailyValues.slice(-7) } : {}),
    },
    {
      key: 'sales7',
      band: 'sales',
      label: f.t('board.kpi.sales7'),
      ...moneyKpi(f, sales?.last7Days.total, sales?.currency),
      ...(sales
        ? { deltaPercent: sales.last7Days.changePercent, deltaHint: f.t('delta.vsPrevious7') }
        : {}),
      ...(dailyValues.length > 1 ? { spark: dailyValues.slice(-14) } : {}),
    },
    {
      key: 'revenue',
      band: 'money',
      label: f.t('board.kpi.revenue'),
      ...moneyKpi(f, financial?.revenue, financial?.currency),
    },
    {
      key: 'expenses',
      band: 'money',
      label: f.t('board.kpi.expenses'),
      ...moneyKpi(f, financial?.expenses, financial?.currency),
    },
    {
      key: 'profit',
      band: 'money',
      label: f.t('board.kpi.profit'),
      ...moneyKpi(f, financial?.profit, financial?.currency),
      ...(financial && Number(financial.profit) < 0 ? { tone: 'critical' as const } : {}),
      ...(financial
        ? { note: `${f.t('board.kpi.margin')} ${f.percent(financial.marginPercent)}` }
        : {}),
    },
    /*
     * Potraživanje i dospeli deo stoje na ISTOJ kartici.
     *
     * Dve kartice su tvrdile da su to dva iznosa; drugi je zapravo deo prvog.
     * Rukovodilac koji ih vidi razdvojeno sabira ih u glavi, pa dobije dug
     * koji ne postoji — a broj koji zaista traži radnju („od toga dospelo")
     * se izgubi među jednakim karticama.
     */
    {
      key: 'receivables',
      band: 'money',
      label: f.t('board.kpi.receivables'),
      ...moneyKpi(f, receivables?.total, receivables?.currency),
      ...(receivables && overdueBeyondThreshold !== null
        ? {
            note: f.t('board.kpi.ofWhichOverdue', {
              days: rules.receivableCriticalDays,
              amount: f.money(overdueBeyondThreshold, receivables.currency),
            }),
            ...(overdueBeyondThreshold > 0 ? { noteTone: 'critical' as const } : {}),
          }
        : {}),
    },
    {
      key: 'payables7',
      band: 'money',
      label: f.t('board.kpi.payables7'),
      ...moneyKpi(f, payables?.dueWithin7Days, payables?.currency),
      ...(payables && Number(payables.dueWithin7Days) > 0 ? { tone: 'warn' as const } : {}),
    },
    {
      key: 'stockRisk',
      band: 'stock',
      label: f.t('board.kpi.stockRisk'),
      value: stockAtRisk === null ? null : f.number(stockAtRisk),
      ...(stockAtRisk !== null && stockAtRisk > 0 ? { tone: 'warn' as const } : {}),
      ...(stock ? { note: f.t('board.kpi.items', { count: stock.items.length }) } : {}),
    },
    {
      key: 'headcount',
      band: 'stock',
      label: f.t('board.kpi.headcount'),
      value: headcount ? f.number(headcount.total) : null,
      ...(headcount
        ? { note: f.t('board.kpi.departments', { count: headcount.departments.length }) }
        : {}),
    },
  ]

  const byKey = (key: string) => kpis.find((k) => k.key === key)
  const hero = byKey('salesMonth')!
  const heroAside = ['salesYesterday', 'sales7']
    .map(byKey)
    .filter((k): k is Kpi => k !== undefined)

  /*
   * Pojasevi po temi.
   *
   * Vodeći broj i dva uz njega već stoje na traci, pa se iz pojaseva izuzimaju:
   * isti iznos dvaput na jednom ekranu se ne čita kao naglasak nego kao greška
   * u podacima.
   */
  const bands: readonly {
    readonly key: BandKey
    readonly title: string
    readonly icon: IconName
    readonly items: readonly Kpi[]
  }[] = (
    [
      { key: 'money', title: f.t('board.band.money'), icon: 'wallet' as IconName },
      { key: 'stock', title: f.t('board.band.stock'), icon: 'box' as IconName },
    ] as const
  ).map((band) => ({ ...band, items: kpis.filter((k) => k.band === band.key) }))

  const sourceLine = (block: { provenance?: { sources: readonly { label: string }[] } }) =>
    block.provenance?.sources[0]?.label

  /*
   * Najjači dan se RAČUNA, ne bira okom.
   *
   * Grafikon ističe tačno onaj stubić koji je najveći; da se isticanje radilo
   * po oku, isticalo bi se ono što deluje veliko — a to je često samo stubić
   * pored nižih suseda.
   */
  const peakDay =
    dailyValues.length > 0
      ? dailyValues.reduce((best, value, index) => (value > dailyValues[best]! ? index : best), 0)
      : undefined

  /*
   * Struktura prihoda se crta SAMO kad je dobit pozitivna.
   *
   * Traka udela deli celinu na delove; kada rashod premaši prihod, celine nema
   * — zbir delova bi bio veći od prihoda, pa bi „udeo" bio procenat od broja
   * koji nigde ne postoji. Tada umesto trake ide rečenica o manjku.
   */
  const structure =
    financial && Number(financial.profit) > 0 && Number(financial.revenue) > 0
      ? {
          caption: f.t('board.chart.revenueTotal', {
            amount: f.money(financial.revenue, financial.currency),
          }),
          segments: [
            {
              label: f.t('board.kpi.expenses'),
              value: Number(financial.expenses),
              display: f.money(financial.expenses, financial.currency),
              step: 1,
            },
            {
              label: f.t('board.kpi.profit'),
              value: Number(financial.profit),
              display: f.money(financial.profit, financial.currency),
              step: 3,
            },
          ],
        }
      : null

  const coverage = stock
    ? [...stock.items]
        .filter((i) => i.averageDailySales > 0)
        .sort((a, b) => a.daysOfCover - a.leadTimeDays - (b.daysOfCover - b.leadTimeDays))
        .slice(0, 6)
    : []

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

      <HeroPanel kpi={hero} aside={heroAside} f={f} />

      {bands.map((band) => (
        <section key={band.key} className={styles.band}>
          <BandHead band={band.key} title={band.title} icon={band.icon} />
          <div className={styles.kpis}>
            {band.items.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} f={f} />
            ))}
          </div>
        </section>
      ))}

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
              emphasis={peakDay}
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
          icon="wallet"
          title={f.t('board.chart.structure')}
          source={sourceLine(board.financial)}
        >
          {structure ? (
            <ShareBar
              segments={structure.segments}
              caption={structure.caption}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.item'), f.t('board.col.value')]}
              shareLabel={(share) => f.percent(share)}
            />
          ) : financial ? (
            <p className={`${styles.chartPending} ${styles.chartLoss}`}>
              {f.t('board.chart.loss', {
                amount: f.money(
                  Math.abs(Number(financial.revenue) - Number(financial.expenses)),
                  financial.currency,
                ),
              })}
            </p>
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
            /*
             * Dospelost je UDEO U CELINI, ne spisak iznosa.
             *
             * Pitanje nije koliko duguje svaki opseg nego koliki deo ukupnog
             * potraživanja je već zaglavljen — a to se iz pet zasebnih traka
             * dobija tek sabiranjem. Rampa prati starost duga: jači korak je
             * stariji dug, pa se najstariji deo vidi i kad nosi manji novac.
             * Smer rampe se u tamnoj temi obrće (tamo je jači korak svetliji),
             * ali ostaje jednosmeran — a to je ono što uređena skala traži.
             */
            <ShareBar
              segments={receivables.buckets.map((b, index) => ({
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
              shareLabel={(share) => f.percent(share)}
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
            /*
             * Isticanje umesto jednolikog niza: najbrojnije odeljenje nosi pun
             * ton, ostala najsvetliji. Redosled već kaže ko je prvi, ali se iz
             * niza jednakih traka to pročita tek posle poređenja dužina.
             */
            <RankedBars
              bars={[...headcount.departments]
                .sort((a, b) => b.count - a.count)
                .map((d, index) => ({
                  label: d.name,
                  value: d.count,
                  display: f.number(d.count),
                  step: index === 0 ? 3 : 0,
                }))}
              tableLabel={f.t('board.table')}
              headers={[f.t('board.col.item'), f.t('board.col.value')]}
            />
          ) : (
            <p className={styles.chartPending}>{f.t('board.unavailable')}</p>
          )}
        </ChartCard>

        <ChartCard
          icon="box"
          title={f.t('board.chart.coverage')}
          source={sourceLine(brief.stock)}
          wide
        >
          {coverage.length > 0 ? (
            /*
             * Pokrivenost se poredi sa ROKOM ISPORUKE, ne sa fiksnim brojem.
             *
             * „Devet dana zalihe" nije ni dobro ni loše dok se ne zna koliko se
             * čeka nova roba. Zato dve tačke po artiklu i razmak između njih:
             * kada je pokrivenost levo od roka, artikal će se potrošiti pre
             * nego što isporuka stigne.
             */
            <Dumbbell
              rows={coverage.map((i) => ({
                label: i.item,
                from: i.daysOfCover,
                fromDisplay: f.t('panel.days', { days: i.daysOfCover }),
                to: i.leadTimeDays,
                toDisplay: f.t('panel.days', { days: i.leadTimeDays }),
                alert: i.daysOfCover < i.leadTimeDays || i.daysOfCover <= rules.stockCriticalDays,
              }))}
              legend={{ from: f.t('board.legend.cover'), to: f.t('board.legend.lead') }}
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
