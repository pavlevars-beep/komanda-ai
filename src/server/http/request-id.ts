import 'server-only'
import { randomUUID } from 'node:crypto'

/**
 * Oznaka zahteva koja povezuje log, revizioni zapis i poruku greške
 * prikazanu korisniku. Kada klijent prijavi problem, ovo je jedini podatak
 * koji treba da nam pošalje.
 */
export function requestId(headers: Headers): string {
  const inbound = headers.get('x-request-id')
  // Vrednost iz zaglavlja dolazi spolja — prihvata se samo bezopasan oblik.
  if (inbound && /^[A-Za-z0-9_-]{8,64}$/.test(inbound)) return inbound
  return randomUUID()
}
