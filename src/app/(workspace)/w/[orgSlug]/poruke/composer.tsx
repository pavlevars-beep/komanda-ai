'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'
import { interpolate } from '@/i18n/translator'
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX } from '@/core/messages/limits'
import { sendMessageAction, type MessageState } from './actions'
import styles from './messages.module.css'

export interface RoleOption {
  readonly key: string
  readonly label: string
}

/**
 * Sastavljanje poruke.
 *
 * Ishod se prijavljuje sa BROJEM primalaca, a nula posebnom porukom u drugoj
 * boji. „Poslato" bez broja bi izgledalo isto i kada poruka nije stigla
 * nikome — a to je tiho zataškavanje, ne uspeh.
 */
export function MessageComposer({
  orgSlug,
  roles,
  labels,
}: {
  orgSlug: string
  roles: readonly RoleOption[]
  labels: {
    subject: string
    body: string
    recipients: string
    recipientsHint: string
    send: string
    /** Šablon sa {count}. */
    sent: string
    sentNobody: string
    messages: Readonly<Record<string, string>>
  }
}) {
  const [state, action, pending] = useActionState<MessageState, FormData>(sendMessageAction, {})

  return (
    <form action={action} className={styles.composer}>
      <input type="hidden" name="orgSlug" value={orgSlug} />

      <div className={styles.group}>
        <span className={styles.label}>{labels.recipients}</span>
        <div className={styles.roles}>
          {roles.map((role) => (
            <label key={role.key} className={styles.role}>
              <input type="checkbox" name="roles" value={role.key} />
              {role.label}
            </label>
          ))}
        </div>
        <span className={styles.hint}>{labels.recipientsHint}</span>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="message-title">
          {labels.subject}
        </label>
        <input
          id="message-title"
          name="title"
          className={styles.input}
          maxLength={MESSAGE_TITLE_MAX}
          required
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="message-body">
          {labels.body}
        </label>
        <textarea
          id="message-body"
          name="body"
          className={styles.textarea}
          maxLength={MESSAGE_BODY_MAX}
        />
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={pending}>
          <Icon name="send" size={16} />
          {labels.send}
        </Button>

        {state.error ? (
          <span className={styles.error} role="alert">
            {labels.messages[state.error] ?? state.error}
          </span>
        ) : null}

        {state.sentTo !== undefined ? (
          state.sentTo === 0 ? (
            <span className={styles.warn} role="status">
              {labels.sentNobody}
            </span>
          ) : (
            <span className={styles.ok} role="status">
              {interpolate(labels.sent, { count: state.sentTo })}
            </span>
          )
        ) : null}
      </div>
    </form>
  )
}
