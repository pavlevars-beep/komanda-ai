import Link from 'next/link'
import type { Route } from 'next'
import type { AttentionItem, AttentionSeverity } from '@/core/brief/attention'
import type { Block, MorningBrief } from '@/core/brief/loader'
import type { BriefSection } from '@/core/brief/focus'
import type { Translator, MessageKey } from '@/i18n/translator'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import { ChangeChip } from '@/ui/primitives/ChangeChip'
import styles from './brief.module.css'

/**
 * Jutarnji brif.
 *
 * Redosled na ekranu je namerno obrnut od redosleda podataka: prvo izuzeci,
 * pa tek onda brojevi. Rukovodilac koji otvori ekran u 8h treba da za minut
 * zna šta danas traži pažnju — ne da pregleda sve i sam zaključi.
 *
 * Sve što stiže ovamo je već izračunato uzvodno. Komponenta ne računa nijedan
 * broj: da računa, isti podatak bi na dva mesta mogao da ispadne različit.
 */

const SEVERITY_CLASS: Record<AttentionSeverity, string> = {
  critical: styles.critical!,
  warning: styles.warning!,
  info: styles.info!,
}

const SEVERITY_ICON: Record<AttentionSeverity, IconName> = {
  critical: 'warning',
  warning: 'bell',
  info: 'chart',
}

export interface BriefFormat {
  readonly t: Translator['t']
  readonly money: (amount: number | string, currency: string) => string
  readonly number: (value: number) => string
  readonly percent: (value: number) => string
  readonly date: (value: string) => string
}

/** Tekst stavke. Obaveza koja je već dospela ima sopstvenu rečenicu. */
function attentionText(item: AttentionItem, f: BriefFormat): string {
  const p = item.params

  if (item.kind === 'sales_drop') {
    return f.t(`attention.sales_drop.${p.period}` as MessageKey, {
      percent: f.percent(Number(p.percent)),
    })
  }

  if (item.kind === 'payables_due' && item.severity === 'critical') {
    return f.t('attention.payables_due.overdue', {
      count: f.number(Number(p.count)),
      amount: f.money(Number(p.amount), String(p.currency)),
    })
  }

  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(p)) {
    params[key] =
      key === 'amount'
        ? f.money(Number(value), String(p.currency))
        : typeof value === 'number'
          ? f.number(value)
          : value
  }

  return f.t(`attention.${item.kind}` as MessageKey, params)
}

function AttentionList({
  items,
  orgSlug,
  f,
}: {
  items: readonly AttentionItem[]
  orgSlug: string
  f: BriefFormat
}) {
  if (items.length === 0) {
    return (
      <p className={styles.calm}>
        <Icon name="check" size={18} />
        {f.t('brief.attention.none')}
      </p>
    )
  }

  return (
    <ul className={styles.attention}>
      {items.map((item, index) => (
        <li
          // Ista vrsta se može pojaviti dvaput sa različitom težinom
          // (potraživanja preko 60 i preko 90), pa ključ mora da nosi i nju.
          key={`${item.kind}-${item.severity}-${index}`}
          className={`${styles.item} ${SEVERITY_CLASS[item.severity]}`}
        >
          <div className={styles.itemHead}>
            <Icon name={SEVERITY_ICON[item.severity]} size={18} />
            <span className={styles.itemText}>{attentionText(item, f)}</span>
            {item.href ? (
              <Link href={`/w/${orgSlug}${item.href}` as Route} className={styles.itemLink}>
                →
              </Link>
            ) : null}
          </div>

          {/*
            Dokaz stoji sklopljen, ne skriven. Rukovodilac koji veruje brojci
            ne mora da ga otvara; onaj koji ne veruje mora da može — inače
            upozorenje ostaje tvrdnja bez pokrića.
          */}
          <details className={styles.why}>
            <summary className={styles.whySummary}>{f.t('brief.attention.why')}</summary>
            <dl className={styles.evidence}>
              {item.evidence.map((e) => (
                <div key={e.label} style={{ display: 'contents' }}>
                  <dt className={styles.evidenceLabel}>{f.t(e.label as MessageKey)}</dt>
                  <dd className={styles.evidenceValue}>
                    {typeof e.value === 'number' ? f.number(e.value) : e.value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </li>
      ))}
    </ul>
  )
}

/** Blok koji se nije učitao prikazuje RAZLOG, nikad nulu. */
function Unavailable({ block, f }: { block: Block<unknown>; f: BriefFormat }) {
  return (
    <div className={styles.pending}>
      <span className={styles.pendingLabel}>{f.t('brief.unavailable')}</span>
      <span>{f.t(`brief.unavailable.${block.unavailable}` as MessageKey)}</span>
    </div>
  )
}

/**
 * Promena uz iznos — sa odgovorom na „u odnosu na šta".
 *
 * Procenat bez osnove ne znači ništa, a izgleda kao da znači. Osnovu zna onaj
 * ko je broj izračunao, pa je ovde prosleđuje kao gotovu frazu; vidi se na
 * prelaz mišem, dodir i tastaturu, a čitaču ekrana uvek.
 *
 * Strelica dolazi iz ikonica, ne iz teksta: znakovi ↑ i ↓ retko postoje u
 * samom fontu, pa ih pregledač uzima iz rezervnog — i onda jedini element reda
 * koji nosi smer ispadne iz druge porodice i druge debljine od svega oko sebe.
 *
 * Omotač ostaje zbog najmanje širine: bez nje iznosi u karticama poskakuju
 * levo-desno prema tome koliko je procenat širok.
 */
function Change({ percent, hint, f }: { percent: number; hint: string; f: BriefFormat }) {
  if (percent === 0) return null
  const up = percent > 0
  const value = f.percent(Math.abs(percent))
  return (
    <span className={styles.rowChange}>
      <ChangeChip
        align="end"
        direction={up ? 'up' : 'down'}
        value={value}
        hint={hint}
        ariaLabel={f.t(up ? 'delta.up' : 'delta.down', { value, hint })}
      />
    </span>
  )
}

function Source({ block, f }: { block: Block<unknown>; f: BriefFormat }) {
  const source = block.provenance?.sources[0]
  const asOf = block.provenance?.freshness?.asOf
  if (!source && !asOf) return null

  return (
    <div className={styles.footnote}>
      {source?.label ? <span>{source.label}</span> : null}
      {asOf ? <span>{f.t('brief.asOf', { when: f.date(asOf) })}</span> : null}
      {block.freshness && block.freshness !== 'fresh' ? (
        <span>{f.t(`freshness.${block.freshness}` as MessageKey)}</span>
      ) : null}
    </div>
  )
}

export function Brief({
  brief,
  orgSlug,
  greeting,
  sections,
  f,
}: {
  brief: MorningBrief
  orgSlug: string
  greeting: string
  /**
   * Odeljci, redom, za ovog korisnika.
   *
   * Redosled nije zaštita — odeljak koji korisnik ne sme da vidi je uklonjen
   * uzvodno, pravima. Ovde se odlučuje samo šta ide prvo.
   */
  sections: readonly BriefSection[]
  f: BriefFormat
}) {
  const { sales, receivables, debtors, payables, stock } = brief

  const blocks: Record<BriefSection, React.ReactNode> = {
    sales: (
      <section key="sales" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="chart" size={17} />
          {f.t('brief.sales')}
        </h2>
        {sales.data ? (
          <div className={styles.card}>
            <dl className={styles.rows}>
              {/*
                Uz svaki red ide i osnova poređenja, jer nije ista za sva tri:
                juče se poredi sa prekjuče, sedam dana sa prethodnih sedam, a
                mesec sa ISTIM brojem dana prethodnog meseca — ne sa punim
                mesecom, inače bi svaki prvi u mesecu lažno prijavio pad.
              */}
              {(
                [
                  ['brief.sales.yesterday', sales.data.yesterday, 'delta.vsDayBefore'],
                  ['brief.sales.last7', sales.data.last7Days, 'delta.vsPrevious7'],
                  ['brief.sales.month', sales.data.monthToDate, 'delta.vsSameLastMonth'],
                ] as const
              ).map(([key, period, hint]) => (
                <div key={key} className={styles.row}>
                  <dt className={styles.rowLabel}>{f.t(key)}</dt>
                  <dd className={styles.row}>
                    <span className={styles.rowValue}>
                      {f.money(period.total, sales.data!.currency)}
                    </span>
                    <Change percent={period.changePercent} hint={f.t(hint)} f={f} />
                  </dd>
                </div>
              ))}
            </dl>
            <Source block={sales} f={f} />
          </div>
        ) : (
          <Unavailable block={sales} f={f} />
        )}
      </section>
    ),

    receivables: (
      <section key="receivables" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="receipt" size={17} />
          {f.t('brief.receivables')}
        </h2>
        {receivables.data ? (
          <div className={styles.card}>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{f.t('brief.receivables.total')}</dt>
                <dd className={styles.rowValue}>
                  {f.money(receivables.data.total, receivables.data.currency)}
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{f.t('brief.receivables.overdue')}</dt>
                <dd className={styles.rowValue}>
                  {f.money(receivables.data.overdue, receivables.data.currency)}
                </dd>
              </div>
            </dl>

            <div className={styles.bars}>
              {receivables.data.buckets.map((bucket) => {
                const total = Number(receivables.data!.total)
                const share = total > 0 ? (Number(bucket.amount) / total) * 100 : 0
                const fill =
                  bucket.fromDays >= brief.rules.receivableCriticalDays
                    ? styles.barFillCritical
                    : bucket.fromDays >= brief.rules.receivableWarningDays
                      ? styles.barFillWarn
                      : ''

                return (
                  <div key={bucket.fromDays} className={styles.bar}>
                    <span className={styles.barLabel}>
                      {bucket.toDays === null
                        ? f.t('brief.receivables.bucketOpen', { from: bucket.fromDays })
                        : f.t('brief.receivables.bucket', {
                            from: bucket.fromDays,
                            to: bucket.toDays,
                          })}
                    </span>
                    <span className={styles.barValue}>
                      {f.money(bucket.amount, receivables.data!.currency)}
                    </span>
                    <div className={styles.barTrack}>
                      <div
                        className={`${styles.barFill} ${fill}`.trim()}
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <Source block={receivables} f={f} />
          </div>
        ) : (
          <Unavailable block={receivables} f={f} />
        )}
      </section>
    ),

    payables: (
      <section key="payables" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="wallet" size={17} />
          {f.t('brief.payables')}
        </h2>
        {payables.data ? (
          <div className={styles.card}>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{f.t('brief.payables.total')}</dt>
                <dd className={styles.rowValue}>
                  {f.money(payables.data.total, payables.data.currency)}
                </dd>
              </div>
              <div className={styles.row}>
                <dt className={styles.rowLabel}>{f.t('brief.payables.soon')}</dt>
                <dd className={styles.rowValue}>
                  {f.money(payables.data.dueWithin7Days, payables.data.currency)}
                </dd>
              </div>
            </dl>
            <Source block={payables} f={f} />
          </div>
        ) : (
          <Unavailable block={payables} f={f} />
        )}
      </section>
    ),

    debtors: (
      <section key="debtors" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="receipt" size={17} />
          {f.t('brief.receivables.topDebtors')}
        </h2>
        {debtors.data ? (
          <div className={styles.card}>
            <dl className={styles.rows}>
              {debtors.data.items.slice(0, 5).map((d) => (
                <div key={d.customer} className={styles.row}>
                  <dt className={styles.rowLabel}>
                    {d.customer} · {f.t('panel.days', { days: d.oldestOverdueDays })}
                  </dt>
                  <dd className={styles.rowValue}>{f.money(d.amount, d.currency)}</dd>
                </div>
              ))}
            </dl>
            <Source block={debtors} f={f} />
          </div>
        ) : (
          <Unavailable block={debtors} f={f} />
        )}
      </section>
    ),

    stock: (
      <section key="stock" className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="box" size={17} />
          {f.t('brief.stock')}
        </h2>
        {stock.data ? (
          <div className={styles.card}>
            <dl className={styles.rows}>
              {stock.data.items.map((item) => (
                <div key={item.item} className={styles.row}>
                  <dt className={styles.rowLabel}>
                    {item.item} ·{' '}
                    {f.t('brief.stock.perDay', { value: f.number(item.averageDailySales) })}
                  </dt>
                  <dd className={styles.rowValue}>
                    {f.t('panel.days', { days: item.daysOfCover })}
                  </dd>
                </div>
              ))}
            </dl>
            <Source block={stock} f={f} />
          </div>
        ) : (
          <Unavailable block={stock} f={f} />
        )}
      </section>
    ),
  }

  return (
    <div className={styles.page}>
      <header className={styles.greeting}>
        <h1 className={styles.hello}>{greeting}</h1>
        {brief.oldestAsOf ? (
          <span className={styles.asOf}>
            {f.t('brief.asOf', { when: f.date(brief.oldestAsOf) })}
          </span>
        ) : null}
      </header>

      {brief.staleBlocks > 0 ? (
        <p className={styles.stale}>
          <Icon name="warning" size={16} />
          {f.t('brief.stale')}
        </p>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Icon name="bell" size={17} />
          {f.t('brief.attention')}
          {brief.attention.length > 0 ? (
            <span className={styles.sectionMeta}>{f.number(brief.attention.length)}</span>
          ) : null}
        </h2>
        <AttentionList items={brief.attention} orgSlug={orgSlug} f={f} />
      </section>

      {sections.map((section) => blocks[section])}

      {/*
        Prilagođavanje stoji na DNU brifa, ne na vrhu.
        Ko je zadovoljan redosledom ne treba da ga vidi svako jutro; ko nije,
        dolazi do njega tek pošto skroluje pored onoga što mu ne treba — a to je
        upravo trenutak kada mu ta ponuda ima smisla.
      */}
      <Link href={`/w/${orgSlug}/brif` as Route} className={styles.customize}>
        <Icon name="settings" size={15} />
        {f.t('brief.prefs.customize')}
      </Link>
    </div>
  )
}
