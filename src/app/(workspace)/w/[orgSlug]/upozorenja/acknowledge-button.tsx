'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import { acknowledgeAlertAction, type AlertState } from './actions'

export function AcknowledgeButton({
  orgSlug,
  alertId,
  label,
}: {
  orgSlug: string
  alertId: string
  label: string
}) {
  const [, action, pending] = useActionState<AlertState, FormData>(acknowledgeAlertAction, {})

  return (
    <form action={action}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="alertId" value={alertId} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {label}
      </Button>
    </form>
  )
}
