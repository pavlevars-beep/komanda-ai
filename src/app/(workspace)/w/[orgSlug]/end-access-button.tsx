'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/primitives/Button'
import {
  endAccessSessionByClientAction,
  type AccessSessionState,
} from '../../../(console)/console/actions'

/**
 * Dugme kojim administrator klijenta prekida pristup Delta Pro osoblja.
 *
 * Bez njega bi traka bila samo obaveštenje. Ovako klijent ima stvarnu
 * kontrolu nad tim ko mu je u podacima — što je razlika između
 * transparentnosti i pukog prikaza.
 */
export function EndAccessButton({
  sessionId,
  organizationId,
  label,
}: {
  sessionId: string
  organizationId: string
  label: string
}) {
  const [, action, pending] = useActionState<AccessSessionState, FormData>(
    endAccessSessionByClientAction,
    {},
  )

  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <Button type="submit" variant="danger" disabled={pending}>
        {label}
      </Button>
    </form>
  )
}
