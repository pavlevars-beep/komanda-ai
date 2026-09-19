import Link from 'next/link'
import type { Route } from 'next'
import type { BusinessRules } from '@/core/rules/business-rules'
import {
  abcAnalysis,
  deadStock,
  shortageRisks,
  volumeWithoutMargin,
} from '@/core/retail/analytics'
import type { LocationPerformance } from '@/core/retail/network'
import { Icon, type IconName } from '@/ui/primitives/Icon'
import styles from '../retail.module.css'

/**
 * Nalazi nad asortimanom jednog objekta.
 *
 * Svaki odeljak ovde mora da vodi do ODLUKE. Ako se posle čitanja ne zna šta
 * raditi u ponedeljak, odeljak ne zaslužuje mesto na ekranu — takvih prikaza
 * vlasnik već ima koliko hoće.
 *
 * Zato svaki nosi tri stvari: nalaz u jednoj rečenici, redove koji ga dokazuju,
 * i pitanje sagovorniku koje vodi dalje kada odluka nije očigledna.
 */

export interface AnalysisLabels {
  readonly deadTitle: string
  readonly deadEmpty: string
  readonly deadFinding: string
  readonly shortageTitle: string
  readonly shortageEmpty: string
  readonly shortageFinding: string
  readonly volumeTitle: string
  readonly volumeEmpty: string
  readonly volumeFinding: string
  readonly abcTitle: string
  readonly abcFinding: string
  readonly colProduct: string
  readonly colStock: string
  readonly colValue: string
  readonly colLastSold: string
  readonly colCover: string
  readonly colLead: string
  readonly colRevenue: string
  readonly colMargin: string
  readonly colShare: string
  readonly days: string
  readonly ask: string
}

function Section({
  icon,
  title,
  finding,
  tone,
  children,
  askHref,
  askLabel,
}: {
  icon: IconName
  title: string
  finding: string
  tone?: 'warn' | 'critical' | undefined
  children?: React.ReactNode
  askHref?: Route | undefined
  askLabel: string
}) {
  return (
    <section className={styles.analysis}>
      <h3 className={styles.analysisTitle}>
        <span className={styles.analysisIcon}>
          <Icon name={icon} size={17} />
        </span>
        {title}
      </h3>

      {/*
        Nalaz stoji IZNAD tabele, u jednoj rečenici.
        Tabela dokazuje nalaz; ona ga ne zamenjuje. Vlasnik koji ima dva minuta
        pročita rečenicu i to mu je dovoljno da zna da li da otvori tabelu.
      */}
      <p
        className={`${styles.finding} ${
          tone === 'critical' ? styles.findingCritical : tone === 'warn' ? styles.findingWarn : ''
        }`.trim()}
      >
        {finding}
      </p>

      {children}

      {askHref ? (
        <Link href={askHref} className={styles.analysisAsk}>
          <Icon name="ask" size={15} />
          {askLabel}
        </Link>
      ) : null}
    </section>
  )
}

export function LocationAnalysis({
  location,
  rules,
  labels,
  orgSlug,
  money,
  number,
  percent,
  itemsPhrase,
  question,
}: {
  location: LocationPerformance
  rules: BusinessRules
  labels: AnalysisLabels
  orgSlug: string
  money: (value: string | number, currency: string) => string
  number: (value: number) => string
  percent: (value: number) => string
  /**
   * Broj artikala sa ispravnim oblikom množine.
   *
   * Ne prosleđuje se broj nego gotova fraza: srpski ima tri oblika, i „1
   * artikala" je greška koju svaki govornik primeti pre nego što pročita
   * ostatak rečenice.
   */
  itemsPhrase: (count: number) => string
  /** Sastavlja pitanje za sagovornika; ime objekta se ne prepisuje rukom. */
  question: (topic: 'dead' | 'shortage' | 'volume') => string
}) {
  const dead = deadStock(location.products, rules)
  const shortages = shortageRisks(location.products, rules)
  const volume = volumeWithoutMargin(location.products, location.marginPercent)
  const abc = abcAnalysis(location.products)

  const askHref = (topic: 'dead' | 'shortage' | 'volume') =>
    `/w/${orgSlug}/pitanja?q=${encodeURIComponent(question(topic))}` as Route

  return (
    <div className={styles.analyses}>
      {/* --- Mrtav novac --- */}
      <Section
        icon="box"
        title={labels.deadTitle}
        tone={dead.shareOfStock >= 20 ? 'critical' : dead.items.length > 0 ? 'warn' : undefined}
        finding={
          dead.items.length === 0
            ? labels.deadEmpty
            : labels.deadFinding
                .replace('{value}', money(dead.value, location.currency))
                .replace('{items}', itemsPhrase(dead.items.length))
                .replace('{share}', percent(dead.shareOfStock))
                .replace('{days}', number(rules.stockOverstockDays))
        }
        {...(dead.items.length > 0
          ? { askHref: askHref('dead'), askLabel: labels.ask }
          : { askLabel: labels.ask })}
      >
        {dead.items.length > 0 ? (
          <table className={styles.analysisTable}>
            <thead>
              <tr>
                <th scope="col">{labels.colProduct}</th>
                <th scope="col" className={styles.num}>{labels.colStock}</th>
                <th scope="col" className={styles.num}>{labels.colValue}</th>
                <th scope="col" className={styles.num}>{labels.colLastSold}</th>
              </tr>
            </thead>
            <tbody>
              {dead.items.slice(0, 6).map((item) => (
                <tr key={item.sku}>
                  <td>{item.name}</td>
                  <td className={styles.num}>
                    {number(item.onHand)} {item.unit}
                  </td>
                  <td className={styles.num}>{money(item.stockValue, location.currency)}</td>
                  <td className={`${styles.num} ${styles.bad}`}>
                    {number(item.lastSoldDaysAgo)} {labels.days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      {/* --- Rizik od nestašice --- */}
      <Section
        icon="warning"
        title={labels.shortageTitle}
        tone={shortages.length > 0 ? 'warn' : undefined}
        finding={
          shortages.length === 0
            ? labels.shortageEmpty
            : labels.shortageFinding.replace('{items}', itemsPhrase(shortages.length))
        }
        {...(shortages.length > 0
          ? { askHref: askHref('shortage'), askLabel: labels.ask }
          : { askLabel: labels.ask })}
      >
        {shortages.length > 0 ? (
          <table className={styles.analysisTable}>
            <thead>
              <tr>
                <th scope="col">{labels.colProduct}</th>
                <th scope="col" className={styles.num}>{labels.colCover}</th>
                <th scope="col" className={styles.num}>{labels.colLead}</th>
              </tr>
            </thead>
            <tbody>
              {shortages.slice(0, 6).map((risk) => (
                <tr key={risk.product.sku}>
                  <td>{risk.product.name}</td>
                  <td className={`${styles.num} ${styles.bad}`}>
                    {number(risk.daysOfCover)} {labels.days}
                  </td>
                  <td className={styles.num}>
                    {number(risk.product.leadTimeDays)} {labels.days}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      {/* --- Mnogo prodaje, malo zarađuje --- */}
      <Section
        icon="trendDown"
        title={labels.volumeTitle}
        tone={volume.length > 0 ? 'warn' : undefined}
        finding={
          volume.length === 0
            ? labels.volumeEmpty
            : labels.volumeFinding
                .replace('{items}', itemsPhrase(volume.length))
                .replace('{average}', percent(location.marginPercent))
        }
        {...(volume.length > 0
          ? { askHref: askHref('volume'), askLabel: labels.ask }
          : { askLabel: labels.ask })}
      >
        {volume.length > 0 ? (
          <table className={styles.analysisTable}>
            <thead>
              <tr>
                <th scope="col">{labels.colProduct}</th>
                <th scope="col" className={styles.num}>{labels.colRevenue}</th>
                <th scope="col" className={styles.num}>{labels.colShare}</th>
                <th scope="col" className={styles.num}>{labels.colMargin}</th>
              </tr>
            </thead>
            <tbody>
              {volume.slice(0, 6).map((item) => (
                <tr key={item.product.sku}>
                  <td>{item.product.name}</td>
                  <td className={styles.num}>{money(item.product.revenue, location.currency)}</td>
                  <td className={styles.num}>{percent(item.share)}</td>
                  <td className={`${styles.num} ${styles.bad}`}>
                    {percent(item.product.marginPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      {/* --- ABC --- */}
      <Section
        icon="chart"
        title={labels.abcTitle}
        finding={labels.abcFinding
          .replace('{count}', number(abc.aCount))
          .replace('{total}', number(location.products.length))
          .replace('{share}', percent(abc.aShareOfCatalog))}
        askLabel={labels.ask}
      >
        {/*
          Traka udela, ne tabela od četrnaest redova.
          Poenta ABC-a je ODNOS: nekolicina artikala nosi većinu prometa. Taj
          odnos se vidi iz jedne trake, a iz spiska tek posle sabiranja.
        */}
        <div className={styles.abcBar}>
          {abc.lines.map((line) => (
            <span
              key={line.product.sku}
              className={`${styles.abcSegment} ${styles[`abc${line.abc}`] ?? ''}`.trim()}
              style={{ width: `${line.share}%` }}
              title={`${line.product.name} — ${percent(line.share)} (${line.abc})`}
            />
          ))}
        </div>
        <div className={styles.abcLegend}>
          {(['A', 'B', 'C'] as const).map((klasa) => (
            <span key={klasa} className={styles.abcLegendItem}>
              <span className={`${styles.abcSwatch} ${styles[`abc${klasa}`] ?? ''}`.trim()} />
              {klasa} · {number(abc.lines.filter((l) => l.abc === klasa).length)}
            </span>
          ))}
        </div>
      </Section>
    </div>
  )
}
