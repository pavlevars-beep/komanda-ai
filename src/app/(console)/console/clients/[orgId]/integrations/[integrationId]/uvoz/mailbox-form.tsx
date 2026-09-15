'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { StatusBadge } from '@/ui/patterns/StatusBadge'
import { saveMailbox, type MailboxState } from './actions'
import styles from './import.module.css'

export interface MailboxLabels {
  readonly address: string
  readonly addressHint: string
  readonly notConfigured: string
  readonly needsMapping: string
  readonly senders: string
  readonly sendersHint: string
  readonly enabled: string
  readonly save: string
  readonly saved: string
  readonly remove: string
  readonly none: string
  readonly on: string
  readonly off: string
  readonly messages: Readonly<Record<string, string>>
}

export interface MailboxValue {
  readonly address: string | null
  readonly senders: readonly string[]
  readonly enabled: boolean
}

/**
 * Namensko sanduče za jednu vrstu podatka.
 *
 * Adresa se prikazuje kao TEKST koji se može označiti i kopirati, ne kao polje
 * za unos: ona se ne menja ručno, a polje bi pozivalo da se u njega kuca.
 *
 * Kada prijem nije podešen na nivou sistema, to se KAŽE. Adresa koja izgleda
 * spremna a ne može da primi poruku je tačno ono što ovaj proizvod ne sme —
 * nešto što izgleda kao funkcija a nije.
 */
export function MailboxForm({
  organizationId,
  integrationId,
  kind,
  kindLabel,
  value,
  systemReady,
  hasMapping,
  labels,
}: {
  organizationId: string
  integrationId: string
  kind: string
  kindLabel: string
  value: MailboxValue | null
  systemReady: boolean
  hasMapping: boolean
  labels: MailboxLabels
}) {
  const [state, action, pending] = useActionState<MailboxState, FormData>(saveMailbox, {})

  return (
    <form action={action} className={styles.card}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="integrationId" value={integrationId} />
      <input type="hidden" name="kind" value={kind} />

      <div className={styles.cadenceHead}>
        <span className={styles.label}>{kindLabel}</span>
        {value ? (
          <StatusBadge
            tone={value.enabled && systemReady ? 'ok' : 'neutral'}
            label={value.enabled && systemReady ? labels.on : labels.off}
          />
        ) : (
          <span className={styles.hint}>{labels.none}</span>
        )}
      </div>

      {value?.address ? (
        <div className={styles.group}>
          <span className={styles.label}>{labels.address}</span>
          <code className={styles.address}>{value.address}</code>
          <span className={styles.hint}>{labels.addressHint}</span>
        </div>
      ) : null}

      {/*
        Oba uslova stoje kao JEDAN blok. Razmaknuti pasusi se čitaju kao dve
        nepovezane vesti, a oba govore istu stvar: zašto adresa još ne radi.

        Pravilo o mapiranju se kaže PRE nego što se sanduče uključi, ne posle
        prve odbijene poruke. Konsultant koji to sazna iz dnevnika već je rekao
        klijentu da podesi ERP, pa mu sada mora javiti da sačeka.
      */}
      {!systemReady || !hasMapping ? (
        <div className={styles.hints}>
          {!systemReady ? <p className={styles.warn}>{labels.notConfigured}</p> : null}
          {!hasMapping ? <p className={styles.warn}>{labels.needsMapping}</p> : null}
        </div>
      ) : null}

      <div className={styles.group}>
        <label className={styles.label} htmlFor={`senders-${kind}`}>
          {labels.senders}
        </label>
        <textarea
          id={`senders-${kind}`}
          name="senders"
          rows={3}
          className={styles.textarea}
          defaultValue={(value?.senders ?? []).join('\n')}
          placeholder={'erp@firma.rs\n@izvestaji.firma.rs'}
        />
        <span className={styles.hint}>{labels.sendersHint}</span>
      </div>

      <label className={styles.checkRow}>
        <input type="checkbox" name="enabled" value="1" defaultChecked={value?.enabled ?? false} />
        <span>{labels.enabled}</span>
      </label>

      <div className={styles.actions}>
        <Button type="submit" disabled={pending}>
          {labels.save}
        </Button>
        {value ? (
          <Button type="submit" name="remove" value="1" variant="ghost" disabled={pending}>
            {labels.remove}
          </Button>
        ) : null}

        {state.error ? (
          <span className={styles.error} role="alert">
            {labels.messages[state.error] ?? state.error}
            {state.detail ? <span className={styles.detail}> {state.detail}</span> : null}
          </span>
        ) : state.saved ? (
          <span className={styles.ok} role="status">
            {labels.saved}
          </span>
        ) : null}
      </div>
    </form>
  )
}
