'use client'

import { interpolate } from '@/i18n/translator'
import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { inviteMemberAction, type MemberState } from './actions'
import styles from './detail.module.css'

/** Prevod iz rečnika; nepoznat ključ se prikazuje kao takav, ne kao prazno. */
function translate(messages: Readonly<Record<string, string>>, key: string): string {
  return messages[key] ?? key
}

export interface InviteLabels {
  readonly title: string
  readonly email: string
  readonly role: string
  readonly submit: string
  /** Šabloni sa {email}; funkcija ne može da pređe granicu ka klijentu. */
  readonly sent: string
  readonly added: string
  readonly hint: string
  /**
   * Rečnik prevoda, ne funkcija.
   *
   * Akcija vraća KLJUČ poruke tek pri izvršavanju, pa prevod mora da se desi
   * ovde. Funkcija `(key) => t(key)` ne može da pređe granicu server→klijent —
   * React je odbija pri serijalizaciji i ceo render pukne.
   */
  readonly messages: Readonly<Record<string, string>>
}

export interface RoleOption {
  readonly key: string
  readonly name: string
}

/**
 * Pozivanje korisnika.
 *
 * Šalje se e-adresa i KLJUČ role — nikad identifikator. Server ga razrešava
 * među rolama koje ta organizacija sme da dodeli, pa izmenjen zahtev ne može
 * da podmetne platformsku rolu.
 *
 * Ishod se razlikuje namerno: „pozivnica poslata" i „postojeći nalog dodat"
 * nisu ista stvar. U drugom slučaju osoba ne dobija e-poruku jer nalog već
 * ima, a konsultant to mora da zna da ne bi čekao odgovor koji ne stiže.
 */
export function InviteForm({
  organizationId,
  roles,
  labels,
}: {
  organizationId: string
  roles: readonly RoleOption[]
  labels: InviteLabels
}) {
  const [state, action, pending] = useActionState<MemberState, FormData>(inviteMemberAction, {})

  return (
    <form action={action} className={styles.inviteForm}>
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className={styles.inviteRow}>
        <label className={styles.inviteField}>
          <span className={styles.inviteLabel}>{labels.email}</span>
          <input
            type="email"
            name="email"
            className={styles.inviteInput}
            autoComplete="off"
            required
            maxLength={254}
            aria-invalid={state.fieldErrors?.['email'] ? true : undefined}
          />
        </label>

        <label className={styles.inviteField}>
          <span className={styles.inviteLabel}>{labels.role}</span>
          <select name="roleKey" className={styles.inviteInput} required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" variant="primary" disabled={pending || roles.length === 0}>
          {labels.submit}
        </Button>
      </div>

      <p className={styles.inviteHint}>{labels.hint}</p>

      {state.invited ? (
        <p className={`${styles.inviteMessage} ${styles.inviteOk}`} role="status">
          {state.invited.accountCreated
            ? interpolate(labels.sent, { email: state.invited.email })
            : interpolate(labels.added, { email: state.invited.email })}
        </p>
      ) : state.error ? (
        <p className={`${styles.inviteMessage} ${styles.inviteBad}`} role="alert">
          {translate(labels.messages, state.fieldErrors?.['email'] ?? state.error)}
        </p>
      ) : null}
    </form>
  )
}
