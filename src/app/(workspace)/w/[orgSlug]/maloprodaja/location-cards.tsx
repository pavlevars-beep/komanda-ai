import Link from 'next/link'
import type { Route } from 'next'
import {
  averageMargin,
  changePercent,
  marginStep,
  type LocationPerformance,
} from '@/core/retail/network'
import { Icon } from '@/ui/primitives/Icon'
import { ChangeChip } from '@/ui/primitives/ChangeChip'
import styles from './retail.module.css'

/**
 * Kartice prodajnih mesta, pored karte.
 *
 * Karta odgovara na „gde" i „koliko" jednim pogledom. Kartice odgovaraju na
 * „šta se tu tačno prodaje" bez ijednog klika — zato stoje pored nje, a ne
 * ispod, i zato su uvek otvorene umesto oblačića na prelaz miša.
 *
 * Redosled je po prometu, ne po abecedi ili po mestu na karti: vlasnik prvo
 * gleda ono što najviše nosi.
 */

export interface CardLabels {
  readonly monthToDate: string
  readonly margin: string
  readonly receipts: string
  readonly topProducts: string
  readonly seeMore: string
  readonly aboveAverage: string
  readonly belowAverage: string
  readonly onAverage: string
  /** Osnova poređenja uz promenu, kao nastavak rečenice. */
  readonly vsPrevious: string
  /** Cela rečenica za čitač ekrana; {value} i {hint} popunjava kartica. */
  readonly changeUp: string
  readonly changeDown: string
}

export function LocationCards({
  locations,
  orgSlug,
  labels,
  money,
  number,
  percent,
}: {
  locations: readonly LocationPerformance[]
  orgSlug: string
  labels: CardLabels
  money: (value: string, currency: string) => string
  number: (value: number) => string
  percent: (value: number) => string
}) {
  const average = averageMargin(locations)

  /*
   * Redosled po BROJU RAČUNA, isto merilo koje nosi i veličina kruga na karti.
   *
   * Prva verzija je grupisala po valuti, pa su dva najmanja objekta — Banja
   * Luka i Podgorica, jedini u svojoj valuti — ispala na vrh spiska, a
   * najveći tek treći. Iznos se ne može porediti preko valuta bez kursa, ali
   * broj računa može, i time spisak i karta govore isto.
   */
  const sorted = [...locations].sort(
    (a, b) => b.transactions - a.transactions || a.label.localeCompare(b.label),
  )

  return (
    <ul className={styles.cards}>
      {sorted.map((location) => {
        const step = marginStep(location.marginPercent, average)
        const change = changePercent(location.monthToDate, location.previousPeriod)
        const marginLabel =
          step > 0 ? labels.aboveAverage : step < 0 ? labels.belowAverage : labels.onAverage

        return (
          <li key={location.id} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardName}>{location.label}</span>
              {/*
                Boja marže NIKAD ne stoji sama.
                Uz tačku ide i reč — inače je kartica neupotrebljiva daltonisti
                i u crno-beloj štampi izveštaja.
              */}
              <span className={`${styles.marginTag} ${styles[`step${step}`] ?? ''}`.trim()}>
                <span className={styles.marginDot} aria-hidden="true" />
                {percent(location.marginPercent)}
                <span className={styles.marginWord}>{marginLabel}</span>
              </span>
            </div>

            <div className={styles.cardFigures}>
              <span className={styles.cardLabel}>{labels.monthToDate}</span>
              <span className={styles.cardValue}>
                {money(location.monthToDate, location.currency)}
              </span>
              {/*
                Uz procenat ide i osnova poređenja.
                Bez nje „−7%" ne kaže manje od čega, a izgleda kao da kaže —
                što je gore nego da procenta nema.
              */}
              {change !== 0 ? (
                <ChangeChip
                  direction={change > 0 ? 'up' : 'down'}
                  value={percent(Math.abs(change))}
                  hint={labels.vsPrevious}
                  ariaLabel={(change > 0 ? labels.changeUp : labels.changeDown)
                    .replace('{value}', percent(Math.abs(change)))
                    .replace('{hint}', labels.vsPrevious)}
                />
              ) : null}
            </div>

            <div className={styles.cardMeta}>
              {labels.receipts}: {number(location.transactions)}
            </div>

            <div className={styles.products}>
              <span className={styles.cardLabel}>{labels.topProducts}</span>
              <ul className={styles.productList}>
                {/* Tri, ne ceo asortiman: kartica je pregled, a ne spisak.
                    Ostalo je iza „Vidi više", gde ima mesta da se pročita. */}
                {[...location.products]
                  .sort((a, b) => Number(b.revenue) - Number(a.revenue))
                  .slice(0, 3)
                  .map((product) => (
                    <li key={product.name} className={styles.product}>
                      <span className={styles.productName}>{product.name}</span>
                      <span className={styles.productQty}>
                        {number(product.soldQuantity)} {product.unit}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <Link
              href={`/w/${orgSlug}/maloprodaja/${location.id}` as Route}
              className={styles.seeMore}
            >
              {labels.seeMore}
              <Icon name="arrowRight" size={15} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
