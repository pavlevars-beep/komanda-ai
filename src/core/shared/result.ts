/**
 * Rezultat umesto izuzetka za očekivane ishode.
 *
 * Izuzeci ostaju za ono što je stvarno neočekivano (pad baze, greška u kodu).
 * Odbijen pristup, nepostojeći resurs i neispravan unos nisu neočekivani —
 * oni su deo normalnog toka i moraju se obraditi, a ne uhvatiti.
 */

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok
}

/** Raspakuje rezultat ili baca — koristi se samo tamo gde je greška zaista nemoguća. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw new Error(`Neočekivana greška: ${JSON.stringify(r.error)}`)
}

export type DomainErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'rate_limited'
  | 'integration_unavailable'
  | 'capability_disabled'
  | 'approval_required'
  | 'internal'

export interface DomainError {
  readonly code: DomainErrorCode
  /** Stabilna, mašinski čitljiva oznaka za UI i prevode. */
  readonly key: string
  /** Interni detalj — ide u log, nikad korisniku. */
  readonly detail?: string
  readonly meta?: Readonly<Record<string, unknown>>
}

export function domainError(
  code: DomainErrorCode,
  key: string,
  extra?: { detail?: string; meta?: Record<string, unknown> },
): DomainError {
  return {
    code,
    key,
    ...(extra?.detail !== undefined ? { detail: extra.detail } : {}),
    ...(extra?.meta !== undefined ? { meta: extra.meta } : {}),
  }
}

/**
 * Nepostojeći resurs i tuđi resurs vraćaju ISTU grešku.
 *
 * Ovo je namerno: razlikovanje 403 i 404 potvrđuje postojanje tuđeg zapisa,
 * što je curenje informacije preko granice organizacije.
 */
export const notFound = (resource: string): DomainError =>
  domainError('not_found', `error.not_found.${resource}`)

export const forbidden = (permission: string): DomainError =>
  domainError('forbidden', 'error.forbidden', { meta: { permission } })

export const unauthenticated = (): DomainError =>
  domainError('unauthenticated', 'error.unauthenticated')
