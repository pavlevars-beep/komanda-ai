import 'server-only'
import { NextResponse } from 'next/server'
import type { DomainError, DomainErrorCode } from '@/core/shared/result'
import { logger } from '../logger'

/**
 * Pretvaranje domenske greške u HTTP odgovor.
 *
 * Klijent dobija: stabilan kod, ključ za prevod i oznaku zahteva.
 * Klijent NE dobija: poruku iz baze, stack trace, naziv tabele, SQL,
 * niti bilo šta iz `detail` polja — to ide isključivo u log.
 */

const STATUS: Record<DomainErrorCode, number> = {
  unauthenticated: 401,
  // Nepostojeći i tuđi resurs vraćaju isti status. Razlika bi potvrdila
  // postojanje tuđeg zapisa i time procurila informaciju preko granice tenanta.
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  conflict: 409,
  rate_limited: 429,
  integration_unavailable: 503,
  capability_disabled: 409,
  approval_required: 409,
  internal: 500,
}

export interface ErrorBody {
  readonly error: {
    readonly code: DomainErrorCode
    readonly key: string
    readonly requestId: string
  }
}

export function errorResponse(error: DomainError, requestId: string): NextResponse<ErrorBody> {
  const status = STATUS[error.code]

  // Detalj se beleži, ali ne napušta server.
  if (status >= 500) {
    logger.error('Zahtev nije uspeo', {
      requestId,
      code: error.code,
      key: error.key,
      detail: error.detail,
    })
  } else {
    logger.info('Zahtev odbijen', { requestId, code: error.code, key: error.key })
  }

  return NextResponse.json(
    { error: { code: error.code, key: error.key, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  )
}

/**
 * Neočekivan izuzetak. Nikad ne izlazi napolje sa svojim sadržajem —
 * poruka izuzetka često nosi upit, putanju ili kredencijal.
 */
export function unexpectedResponse(cause: unknown, requestId: string): NextResponse<ErrorBody> {
  logger.error('Neuhvaćena greška', {
    requestId,
    error: cause instanceof Error ? cause : String(cause),
  })

  return NextResponse.json(
    { error: { code: 'internal' as const, key: 'error.internal', requestId } },
    { status: 500, headers: { 'x-request-id': requestId } },
  )
}
