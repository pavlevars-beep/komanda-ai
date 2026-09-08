'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/ui/primitives/Button'
import { interpolate } from '@/i18n/translator'
import styles from './board.module.css'

/**
 * Automatsko osvežavanje table.
 *
 * „U realnom vremenu" prema poslovnom sistemu znači POVLAČENJE u razmaku, ne
 * gurnuti događaj: ERP ne javlja promenu, njega neko pita. Zato ovde stoji
 * razmak i vidljivo vreme poslednjeg čitanja, umesto obećanja koje pozadina ne
 * može da ispuni.
 *
 * Razlikuju se DVE vremenske oznake, i to namerno: kada je sistem poslednji
 * put pitao (ovde) i na koje se vreme podatak odnosi (uz svaki blok). Kada je
 * izvor spor ili zastao, ta dva se razilaze — a razlika je upravo ono što
 * korisnik mora da vidi.
 *
 * Osvežavanje staje dok je kartica u pozadini. Sat koji radi u nevidljivoj
 * kartici troši i bateriju i ograničenje broja zahteva, bez ijednog čitaoca.
 */
export function AutoRefresh({
  intervalSeconds,
  readAt,
  labels,
}: {
  intervalSeconds: number
  /** ISO vreme poslednjeg čitanja sa servera. */
  readAt: string
  labels: {
    /** Šablon sa {when}. */
    readAt: string
    /** Šablon sa {seconds}. */
    auto: string
    refresh: string
    refreshing: string
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ago, setAgo] = useState<string | null>(null)

  // Relativno vreme se računa na klijentu. Serverski render bi upisao trenutak
  // generisanja i oznaka bi zauvek stajala na „upravo sad".
  useEffect(() => {
    const tick = () => {
      const seconds = Math.max(0, Math.round((Date.now() - Date.parse(readAt)) / 1000))
      setAgo(
        seconds < 60
          ? `${seconds} s`
          : seconds < 3600
            ? `${Math.floor(seconds / 60)} min`
            : `${Math.floor(seconds / 3600)} h`,
      )
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [readAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      startTransition(() => router.refresh())
    }, intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [intervalSeconds, router])

  return (
    <div className={styles.liveBar}>
      <span className={styles.live} aria-live="polite">
        <span className={pending ? styles.dotBusy : styles.dot} aria-hidden="true" />
        {ago === null ? '' : interpolate(labels.readAt, { when: ago })}
      </span>
      <span className={styles.liveMeta}>
        {interpolate(labels.auto, { seconds: intervalSeconds })}
      </span>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? labels.refreshing : labels.refresh}
      </Button>
    </div>
  )
}
