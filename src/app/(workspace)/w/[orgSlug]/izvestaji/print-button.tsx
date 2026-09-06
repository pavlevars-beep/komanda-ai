'use client'

import { Button } from '@/ui/primitives/Button'
import { Icon } from '@/ui/primitives/Icon'

/**
 * Štampa je jedina interakcija na ovoj stranici.
 *
 * Preuzimanje PDF-a bi tražilo generisanje na serveru; štampa pregledača daje
 * isti rezultat, radi svuda i ne uvodi zavisnost koju bi trebalo održavati.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Icon name="note" size={16} />
      {label}
    </Button>
  )
}
