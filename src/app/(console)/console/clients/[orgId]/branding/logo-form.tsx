'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import { LOGO_MAX_BYTES } from '@/core/branding/limits'
import { removeLogoAction, uploadLogoAction, type LogoState } from './actions'
import styles from './branding.module.css'

/**
 * Otpremanje logotipa.
 *
 * Postojeći logotip se prikazuje na ŠAHOVSKOJ podlozi. Providna pozadina je
 * kod logotipa pravilo a ne izuzetak, pa bela podloga skriva upravo onu grešku
 * koju treba videti — beli logotip na beloj podlozi izgleda kao da fajl
 * nedostaje.
 */
export function LogoForm({
  organizationId,
  currentUrl,
  labels,
}: {
  organizationId: string
  currentUrl: string | null
  labels: {
    title: string
    hint: string
    upload: string
    replace: string
    remove: string
    none: string
    saved: string
    messages: Readonly<Record<string, string>>
  }
}) {
  const [uploadState, upload, uploading] = useActionState<LogoState, FormData>(
    uploadLogoAction,
    {},
  )
  const [removeState, remove, removing] = useActionState<LogoState, FormData>(
    removeLogoAction,
    {},
  )

  const error = uploadState.error ?? removeState.error

  return (
    <section className={styles.logoPanel}>
      <div className={styles.group}>
        <span className={styles.label}>{labels.title}</span>
        <span className={styles.hint}>{labels.hint}</span>
      </div>

      {currentUrl ? (
        <div className={styles.logoPreview}>
          {/* Namerno <img>, ne next/image: adresa je na tuđem domenu skladišta
              i menja se po klijentu, pa bi optimizator tražio spisak domena
              koji se održava ručno i tiho obara slike kada se ne ažurira. */}
          <img src={currentUrl} alt="" className={styles.logoImage} />
        </div>
      ) : (
        <p className={styles.hint}>{labels.none}</p>
      )}

      <form action={upload} className={styles.logoActions}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <input
          type="file"
          name="logo"
          className={styles.file}
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          required
        />
        <Button type="submit" disabled={uploading}>
          <Icon name="upload" size={16} />
          {currentUrl ? labels.replace : labels.upload}
        </Button>
      </form>

      {currentUrl ? (
        <form action={remove}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <Button type="submit" variant="ghost" disabled={removing}>
            <Icon name="trash" size={16} />
            {labels.remove}
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className={styles.fieldError} role="alert">
          {labels.messages[error] ?? error}
        </p>
      ) : null}

      {uploadState.uploaded ? (
        <p className={styles.ok} role="status">
          {labels.saved}
        </p>
      ) : null}

      <span className={styles.hint}>
        {Math.round(LOGO_MAX_BYTES / 1024 / 1024)} MB
      </span>
    </section>
  )
}
