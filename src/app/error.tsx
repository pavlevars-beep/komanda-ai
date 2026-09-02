'use client'

import { useEffect } from 'react'
import styles from './error.module.css'

/**
 * Granica greške za ceo proizvod.
 *
 * Bez nje Next prikaže sopstvenu poruku na engleskom, nestilizovanu — što je
 * korisnik i video: „Application error: a server-side exception has occurred".
 * Za proizvod koji se prodaje kao ozbiljan poslovni alat to je loš trenutak da
 * se pukne maska.
 *
 * Tekst je dvojezičan namerno: granica greške ne može da zna izabrani jezik
 * jer se izvršava kada je render već pao.
 *
 * `digest` se PRIKAZUJE. To je jedini trag koji spaja ono što korisnik vidi sa
 * zapisom u logu; bez njega prijava kvara glasi „nešto ne radi".
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Poruka na serveru je već zabeležena; ovde se beleži da ju je korisnik video.
    console.error('Render je pao', error.digest ?? '(bez oznake)')
  }, [error])

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.title}>Došlo je do greške</h1>
        <p className={styles.body}>
          Stranica nije mogla da se učita. Pokušajte ponovo; ako se ponovi,
          pošaljite oznaku ispod.
        </p>
        <p className={styles.bodyEn} lang="en">
          Something went wrong while loading this page. Try again; if it repeats,
          send the reference below.
        </p>

        {error.digest ? (
          <p className={styles.digest}>
            <span className={styles.digestLabel}>Oznaka / Reference</span>
            <code className={styles.digestValue}>{error.digest}</code>
          </p>
        ) : null}

        <button type="button" className={styles.retry} onClick={reset}>
          Pokušaj ponovo · Try again
        </button>
      </div>
    </main>
  )
}
