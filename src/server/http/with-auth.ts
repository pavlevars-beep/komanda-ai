import 'server-only'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { userDb } from '../db/user-client'
import type { Db } from '../db/types'
import { currentUser } from '../auth/current-user'
import { requestId as makeRequestId } from './request-id'
import { checkRateLimit, type RateLimitBucket } from './rate-limit'
import { errorResponse, unexpectedResponse } from './errors'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import type { OrgContext } from '@/core/tenancy/org-context'
import { hasPermission } from '@/core/tenancy/org-context'
import type { Permission } from '@/core/auth/permissions'
import type { AuthUser } from '@/core/auth/session'
import { writeAudit } from '@/core/audit/writer'
import type { AuditAction } from '@/core/audit/actions'
import { domainError, forbidden, notFound, unauthenticated } from '@/core/shared/result'

/**
 * Jedini ulaz u zaštićene rute.
 *
 * Redosled je fiksan i nijedan handler ga ne može preskočiti:
 *   sesija -> organizacija SA SERVERA -> permisija -> ograničenje broja
 *   zahteva -> izvršenje -> revizija -> normalizacija greške
 *
 * Ključna stvar: `permission` je OBAVEZAN u konfiguraciji. Ruta bez
 * deklarisane permisije ne može ni da se napiše, pa nema "zaboravljene
 * provere" — najčešćeg načina na koji ovakvi sistemi procure.
 */

export interface WorkspaceHandlerArgs {
  readonly org: OrgContext
  readonly db: Db
  readonly user: AuthUser
  readonly request: NextRequest
}

export interface WorkspaceRouteConfig {
  /** Obavezno. Bez permisije ruta ne postoji. */
  readonly permission: Permission
  readonly rateLimit: RateLimitBucket
  /** Ako je zadato, uspešan poziv se upisuje u revizioni trag. */
  readonly audit?: AuditAction
}

type RouteParams = { params: Promise<{ orgSlug: string }> }

export function withWorkspaceAuth(
  config: WorkspaceRouteConfig,
  handler: (args: WorkspaceHandlerArgs) => Promise<Response>,
) {
  return async function route(request: NextRequest, context: RouteParams): Promise<Response> {
    const reqId = makeRequestId(request.headers)

    try {
      const db = await userDb()

      const user = await currentUser(db)
      if (!user) return errorResponse(unauthenticated(), reqId)

      // Ograničenje se proverava po korisniku, pre skupljih koraka.
      const limit = checkRateLimit(config.rateLimit, user.id)
      if (!limit.allowed) {
        await writeAudit(db, {
          action: 'security.rate_limited',
          status: 'denied',
          actorType: user.staffRole ? 'staff' : 'user',
          requestId: reqId,
          reason: config.rateLimit,
        })
        return errorResponse(domainError('rate_limited', 'error.rate_limited'), reqId)
      }

      // Slug iz putanje je samo pokazivač; pripadnost potvrđuje baza.
      const { orgSlug } = await context.params
      if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(orgSlug)) {
        return errorResponse(notFound('organization'), reqId)
      }

      const resolved = await resolveOrgContext(db, {
        slug: orgSlug,
        userId: user.id,
        userName: user.fullName,
        requestId: reqId,
      })
      if (!resolved.ok) return errorResponse(resolved.error, reqId)

      const org = resolved.value

      if (!hasPermission(org, config.permission)) {
        await writeAudit(db, {
          action: 'security.permission_denied',
          status: 'denied',
          actorType: org.staff ? 'staff' : 'user',
          requestId: reqId,
          organizationId: org.organizationId,
          reason: config.permission,
        })
        return errorResponse(forbidden(config.permission), reqId)
      }

      const response = await handler({ org, db, user, request })

      if (config.audit) {
        await writeAudit(db, {
          action: config.audit,
          status: 'success',
          actorType: org.staff ? 'staff' : 'user',
          requestId: reqId,
          organizationId: org.organizationId,
        })
      }

      response.headers.set('x-request-id', reqId)
      return response
    } catch (cause) {
      return unexpectedResponse(cause, reqId)
    }
  }
}

/**
 * Rute Delta Pro konzole.
 *
 * Traži aktivan nalog osoblja. Konzola radi sa konfiguracijom, ne sa
 * poslovnim podacima — za njih i osoblje mora da pokrene sesiju pristupa.
 */
export interface ConsoleHandlerArgs {
  readonly db: Db
  readonly user: AuthUser
  readonly requestId: string
  readonly request: NextRequest
}

export function withConsoleAuth(
  config: { rateLimit: RateLimitBucket; audit?: AuditAction },
  handler: (args: ConsoleHandlerArgs) => Promise<Response>,
) {
  return async function route(request: NextRequest): Promise<Response> {
    const reqId = makeRequestId(request.headers)

    try {
      const db = await userDb()

      const user = await currentUser(db)
      if (!user) return errorResponse(unauthenticated(), reqId)

      // Naloge koji nisu osoblje konzola tretira kao da ne postoji.
      if (!user.staffRole) return errorResponse(notFound('organization'), reqId)

      const limit = checkRateLimit(config.rateLimit, user.id)
      if (!limit.allowed) {
        return errorResponse(domainError('rate_limited', 'error.rate_limited'), reqId)
      }

      const response = await handler({ db, user, requestId: reqId, request })

      if (config.audit) {
        await writeAudit(db, {
          action: config.audit,
          status: 'success',
          actorType: 'staff',
          requestId: reqId,
        })
      }

      response.headers.set('x-request-id', reqId)
      return response
    } catch (cause) {
      return unexpectedResponse(cause, reqId)
    }
  }
}

/** Pomoćno: JSON odgovor sa zabranom keširanja osetljivih podataka. */
export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store, private',
    },
  })
}
