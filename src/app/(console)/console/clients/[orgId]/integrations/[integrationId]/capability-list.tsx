'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { setCapabilityAction, type IntegrationState } from '../actions'
import styles from '../integrations.module.css'

/** Prevod iz rečnika; nepoznat ključ se prikazuje kao takav, ne kao prazno. */
function translate(messages: Readonly<Record<string, string>>, key: string): string {
  return messages[key] ?? key
}

export interface CapabilityRow {
  readonly capabilityKey: string
  readonly mode: 'read' | 'prepare' | 'execute'
  readonly requiredPermission: string
  readonly enabled: boolean
  /** Da li je konektor u kodu i dalje nudi. */
  readonly declared: boolean
}

export interface CapabilityLabels {
  readonly enable: string
  readonly disable: string
  readonly enabled: string
  readonly disabled: string
  /** Rečnik po režimu; funkcija ne može da pređe granicu ka klijentu. */
  readonly mode: Readonly<Record<'read' | 'prepare' | 'execute', string>>
  readonly permission: string
  readonly unknown: string
  readonly unknownHint: string
  readonly executeHint: string
  /**
   * Rečnik prevoda, ne funkcija.
   *
   * Akcija vraća KLJUČ poruke tek pri izvršavanju, pa prevod mora da se desi
   * ovde. Funkcija `(key) => t(key)` ne može da pređe granicu server→klijent —
   * React je odbija pri serijalizaciji i ceo render pukne.
   */
  readonly messages: Readonly<Record<string, string>>
}

const MODE_TONE: Record<CapabilityRow['mode'], Tone> = {
  read: 'neutral',
  prepare: 'info',
  // EXECUTE menja stanje u sistemu klijenta i vizuelno se razlikuje od
  // čitanja. Boja nije ukras — ona je jedini znak pre nego što neko klikne.
  execute: 'warn',
}

/**
 * Uključivanje pojedinačnih sposobnosti.
 *
 * Spisak dolazi iz konektora u kodu, ne iz baze, pa u njemu ne može da se
 * pojavi prekidač za nešto što runner ne bi izvršio. Obrnut slučaj — red u
 * bazi za sposobnost koje u kodu više nema — NE skriva se: prikazuje se kao
 * nepoznata, sa jedinom mogućom radnjom, isključivanjem.
 */
export function CapabilityList({
  organizationId,
  integrationId,
  capabilities,
  labels,
}: {
  organizationId: string
  integrationId: string
  capabilities: readonly CapabilityRow[]
  labels: CapabilityLabels
}) {
  const [state, action, pending] = useActionState<IntegrationState, FormData>(
    setCapabilityAction,
    {},
  )

  return (
    <>
      <ul className={styles.capabilityList}>
        {capabilities.map((c) => (
          <li key={c.capabilityKey} className={styles.capability}>
            <div className={styles.capabilityInfo}>
              <span className={styles.capabilityKey}>{c.capabilityKey}</span>
              <span className={styles.capabilityMeta}>
                {c.declared ? (
                  <StatusBadge tone={MODE_TONE[c.mode]} label={labels.mode[c.mode]} />
                ) : (
                  <StatusBadge tone="critical" label={labels.unknown} />
                )}
                <span className={styles.hint}>
                  {labels.permission}: {c.requiredPermission}
                </span>
              </span>
              {!c.declared ? (
                <p className={styles.hint}>{labels.unknownHint}</p>
              ) : c.mode === 'execute' ? (
                <p className={styles.hint}>{labels.executeHint}</p>
              ) : null}
            </div>

            <form action={action} className={styles.capabilityAction}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="integrationId" value={integrationId} />
              <input type="hidden" name="capabilityKey" value={c.capabilityKey} />
              {/*
                Šalje se samo željeno stanje. Režim i tražena permisija se na
                serveru čitaju iz deklaracije sposobnosti — forma ne može da
                ih spusti.
              */}
              <input type="hidden" name="enabled" value={c.enabled ? 'off' : 'on'} />

              <span className={styles.capabilityState} aria-live="off">
                {c.enabled ? labels.enabled : labels.disabled}
              </span>
              <Button
                type="submit"
                variant={c.enabled ? 'secondary' : 'primary'}
                disabled={pending || (!c.declared && !c.enabled)}
              >
                {c.enabled ? labels.disable : labels.enable}
              </Button>
            </form>
          </li>
        ))}
      </ul>

      {state.error ? (
        <p className={`${styles.message} ${styles.bad}`} role="alert">
          {translate(labels.messages, state.error)}
        </p>
      ) : null}
    </>
  )
}
