'use client'

import { useEffect, useState } from 'react'
import styles from './page.module.css'

/**
 * Satovi za zone u kojima klijent posluje.
 *
 * Vreme se računa na klijentu, iz zone. Serverski render bi upisao trenutak
 * generisanja stranice, pa bi sat stajao — a sat koji stoji je gori od sata
 * kojeg nema, jer izgleda tačno.
 *
 * Do prve tikanje na klijentu prikazuje se crtica umesto vremena. Bez toga bi
 * se serverski i klijentski render razišli i React bi prijavio nesaglasnost.
 */
export interface Clock {
  readonly label: string
  readonly timeZone: string
  /** Označava zonu same organizacije, koja se izdvaja u prikazu. */
  readonly primary?: boolean
}

export function WorldClocks({ clocks, locale }: { clocks: readonly Clock[]; locale: string }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    // Kucanje na sekundu; minut bi kasnio i do 59 sekundi pri prvom prikazu.
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <ul className={styles.clocks}>
      {clocks.map((clock) => (
        <li
          key={clock.timeZone}
          className={`${styles.clock} ${clock.primary ? styles.clockPrimary : ''}`.trim()}
        >
          <span className={styles.clockLabel}>{clock.label}</span>
          <span className={styles.clockTime}>
            {now
              ? new Intl.DateTimeFormat(locale, {
                  timeZone: clock.timeZone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(now)
              : '—:—'}
          </span>
          <span className={styles.clockDay}>
            {now
              ? new Intl.DateTimeFormat(locale, {
                  timeZone: clock.timeZone,
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }).format(now)
              : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
