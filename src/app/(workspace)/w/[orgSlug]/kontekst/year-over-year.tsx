import type { Comparison } from '@/core/context/events'
import type { Translator } from '@/i18n/translator'
import { Icon } from '@/ui/primitives/Icon'
import { ChangeChip } from '@/ui/primitives/ChangeChip'
import styles from './context.module.css'

/**
 * Promena prema istom mesecu prethodne godine.
 *
 * Odvojena u komponentu zato što se ista računica pojavljuje dvaput — jednom
 * po izvornim vrednostima, jednom po osnovici. Kada je bila prepisana, jedna
 * kopija je već imala znak iz `signDisplay`, a druga strelicu, pa je isti
 * podatak u dva reda izgledao kao dve različite mere.
 */
function YoyChange({
  changePercent,
  hint,
  t,
  percent,
}: {
  changePercent: number
  hint: string
  t: Translator['t']
  percent: (value: number) => string
}) {
  const up = changePercent >= 0
  /* Znak nosi strelica, pa se apsolutna vrednost ne piše i po drugi put. */
  const value = percent(Math.abs(changePercent))
  return (
    <ChangeChip
      align="end"
      size="md"
      direction={up ? 'up' : 'down'}
      value={value}
      hint={hint}
      ariaLabel={t(up ? 'delta.up' : 'delta.down', { value, hint })}
    />
  )
}

/**
 * Poređenje meseca sa istim mesecom prethodne godine.
 *
 * Oba procenta stoje jedan pored drugog kada se razlikuju: prikaz samo
 * prilagođenog krije da je poređenje dirano, a prikaz samo izvornog vraća
 * lažni pad u mesecu u kojem se desio izuzetan događaj.
 */
export function YearOverYear({
  yoy,
  t,
  money,
  percent,
}: {
  yoy: Comparison
  t: Translator['t']
  money: (value: number) => string
  percent: (value: number) => string
}) {
  return (
    <div className={styles.compare}>
      {/*
        Prvi red imenuje POSMATRANI mesec, ne onaj sa kojim se poredi.
        Ranije je pisalo „Isti mesec prethodne godine · 2026-09" uz iznos iz
        2026 — natpis je tvrdio jedno, broj drugo. Sada oblačići ispod kažu sa
        čim se poredi i koliko je to bilo, pa taj natpis ovde nema šta da radi.
      */}
      <div className={styles.compareRow}>
        <span className={styles.compareLabel}>
          {t('history.month')} · {yoy.current.month}
        </span>
        <span className={styles.compareValue}>{money(yoy.current.total)}</span>
      </div>

      {yoy.previous === undefined ? (
        <p className={styles.compareLabel}>{t('history.noPrevious')}</p>
      ) : (
        <>
          {/*
            Oblačić pokazuje IZNOS sa kojim se poredi, ne samo mesec.
            Prošlogodišnja vrednost inače nigde ne stoji na ekranu, pa je „+8%"
            bilo nemoguće proveriti — a poređenje koje se ne može proveriti je
            tvrdnja, ne podatak.
          */}
          <div className={styles.compareRow}>
            <span className={styles.compareLabel}>{t('history.raw')}</span>
            {yoy.rawChangePercent === undefined ? (
              <span className={styles.compareValue}>—</span>
            ) : (
              <YoyChange
                changePercent={yoy.rawChangePercent}
                hint={t('history.vsPrevious', {
                  month: yoy.previous.month,
                  amount: money(yoy.previous.total),
                })}
                t={t}
                percent={percent}
              />
            )}
          </div>

          {/*
            Prilagođeni procenat stoji PORED izvornog, nikad umesto njega.
          */}
          {yoy.adjustedChangePercent !== undefined ? (
            <div className={styles.compareRow}>
              <span className={styles.compareLabel}>{t('history.adjusted')}</span>
              {/*
                Ovde se porede OSNOVICE, ne izvorni iznosi — zato i druga
                fraza. Ista bi tvrdila da je ista računica dala dva broja.
              */}
              <YoyChange
                changePercent={yoy.adjustedChangePercent}
                hint={t('history.vsPreviousBaseline', {
                  month: yoy.previous.month,
                  amount: money(yoy.previous.baseline),
                })}
                t={t}
                percent={percent}
              />
            </div>
          ) : null}

          {yoy.needsNote ? (
            <p className={styles.note}>
              <Icon name="warning" size={16} />
              {t('history.adjustedNote')}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
