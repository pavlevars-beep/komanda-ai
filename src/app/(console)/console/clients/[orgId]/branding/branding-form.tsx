'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { deriveBrandPalette } from '@/core/branding/contrast'
import { saveBrandingAction, type BrandingState } from './actions'
import styles from './branding.module.css'

export interface BrandingLabels {
  readonly workspaceName: string
  readonly primaryColor: string
  readonly welcomeSr: string
  readonly welcomeEn: string
  readonly save: string
  readonly saved: string
  readonly preview: string
  readonly contrastOk: string
  readonly adjusted: string
  readonly message: (key: string) => string
}

export interface BrandingInitial {
  readonly workspaceName: string
  readonly primaryColor: string
  readonly welcomeSr: string
  readonly welcomeEn: string
  readonly organizationName: string
}

const FALLBACK = '#0e6e6b'

/**
 * Ekran za brendiranje sa živim pregledom.
 *
 * Pregled koristi ISTU funkciju za korekciju kontrasta koju server primenjuje
 * pri snimanju. Da su to dva različita proračuna, korisnik bi video jednu
 * boju a klijent dobio drugu — a upravo to je vrsta neslaganja koja se
 * primeti tek kod klijenta.
 */
export function BrandingForm({
  organizationId,
  initial,
  labels,
}: {
  organizationId: string
  initial: BrandingInitial
  labels: BrandingLabels
}) {
  const [state, action, pending] = useActionState<BrandingState, FormData>(saveBrandingAction, {})
  const [color, setColor] = useState(initial.primaryColor || FALLBACK)

  const palette = deriveBrandPalette({ hex: color, scheme: 'light' })
  const colorError = state.fieldErrors?.primaryColor

  return (
    <div className={styles.split}>
      <form action={action} className={styles.card}>
        <input type="hidden" name="organizationId" value={organizationId} />

        <div className={styles.group}>
          <label className={styles.label} htmlFor="workspaceName">
            {labels.workspaceName}
          </label>
          <input
            id="workspaceName"
            name="workspaceName"
            className={styles.input}
            defaultValue={initial.workspaceName}
            maxLength={60}
          />
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="primaryColorHex">
            {labels.primaryColor}
          </label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.swatch}
              value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK}
              onChange={(e) => setColor(e.target.value)}
              aria-label={labels.primaryColor}
            />
            <input
              id="primaryColorHex"
              name="primaryColor"
              className={`${styles.input} ${styles.hex}`}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              maxLength={7}
              aria-invalid={colorError ? true : undefined}
            />
          </div>

          {colorError ? (
            <p className={styles.fieldError} role="alert">
              {labels.message(colorError)}
            </p>
          ) : palette?.adjusted ? (
            <p className={styles.correction}>
              <span className={styles.chip} style={{ background: color }} aria-hidden="true" />
              <span aria-hidden="true">→</span>
              <span
                className={styles.chip}
                style={{ background: palette.brand }}
                aria-hidden="true"
              />
              {labels.adjusted}
            </p>
          ) : palette ? (
            <p className={styles.hint}>{labels.contrastOk}</p>
          ) : null}
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="welcomeSr">
            {labels.welcomeSr}
          </label>
          <textarea
            id="welcomeSr"
            name="welcomeSr"
            className={styles.textarea}
            defaultValue={initial.welcomeSr}
            maxLength={300}
          />
        </div>

        <div className={styles.group}>
          <label className={styles.label} htmlFor="welcomeEn">
            {labels.welcomeEn}
          </label>
          <textarea
            id="welcomeEn"
            name="welcomeEn"
            className={styles.textarea}
            defaultValue={initial.welcomeEn}
            maxLength={300}
          />
        </div>

        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {labels.save}
          </Button>
        </div>

        {state.saved ? (
          <p className={`${styles.message} ${styles.ok}`}>{labels.saved}</p>
        ) : state.error && !colorError ? (
          <p className={`${styles.message} ${styles.bad}`}>{labels.message(state.error)}</p>
        ) : null}
      </form>

      <aside className={`${styles.card} ${styles.previewCard}`}>
        <span className={styles.previewTitle}>{labels.preview}</span>

        <div
          className={styles.preview}
          style={
            palette
              ? ({
                  '--brand': palette.brand,
                  '--brand-ink': palette.brandInk,
                  '--brand-soft': palette.brandSoft,
                  '--brand-contrast': palette.brandContrast,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div className={styles.previewNav}>
            <span className={styles.previewOrg}>{initial.organizationName}</span>
            <span className={styles.previewMeta}>Komanda AI</span>
          </div>

          <div className={styles.previewBody}>
            <span
              className={styles.previewItem}
              style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}
            >
              Početna
            </span>
            <span className={styles.previewLink} style={{ color: 'var(--brand-ink)' }}>
              Pogledaj izveštaj →
            </span>
            <button
              type="button"
              className={styles.previewButton}
              style={{ background: 'var(--brand)', color: 'var(--brand-contrast)' }}
              tabIndex={-1}
            >
              Odobri
            </button>
            <span className={styles.previewText}>
              Tekst u radnom prostoru ostaje čitljiv bez obzira na izabranu boju.
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}
