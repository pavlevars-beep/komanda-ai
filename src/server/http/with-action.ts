import 'server-only'
import { headers } from 'next/headers'
import { userDb } from '../db/user-client'
import type { Db } from '../db/types'
import { currentUser } from '../auth/current-user'
import { requestId as makeRequestId } from './request-id'
import { checkRateLimit, type RateLimitBucket } from './rate-limit'
import { formString } from './form'
import { logger } from '../logger'
import type { AuthUser } from '@/core/auth/session'
import { writeAudit } from '@/core/audit/writer'
import type { AuditAction } from '@/core/audit/actions'

/**
 * Guard za server akcije.
 *
 * Rute prolaze kroz withWorkspaceAuth / withConsoleAuth. Server akcije su
 * druga vrata u sistem i lako se previde — akcija je „samo funkcija", pa
 * deluje kao da guard nije potreban. Zato ovde stoji isti redosled:
 *
 *   sesija -> pravo pristupa -> ograničenje broja zahteva -> izvršenje
 *   -> revizija -> normalizacija greške
 *
 * Akcija koja ne prođe kroz ovaj omotač ne bi imala nijedan od tih koraka.
 */

export interface ActionContext {
  readonly db: Db
  readonly user: AuthUser
  readonly requestId: string
}

export interface ActionResultBase {
  /** Ključ za prevod poruke o grešci; izostaje kada je akcija uspela. */
  readonly error?: string
  readonly requestId?: string
  /**
   * Koji je od dozvoljenih događaja stvarno nastupio.
   *
   * Koristi se samo kada akcija u konfiguraciji navede više događaja — na
   * primer uključivanje i isključivanje sposobnosti, koji imaju isti tok ali
   * u reviziji ne smeju da izgledaju isto.
   */
  readonly auditAction?: AuditAction
}

export interface ConsoleActionConfig {
  /**
   * Događaj koji se upisuje kada akcija uspe.
   *
   * Može biti i spisak — tada rukovalac bira jedan od njih preko
   * `auditAction`. Spisak i dalje stoji ovde, na mestu poziva: rukovalac bira
   * IZ zatvorenog skupa, ne izmišlja ključ. Vrednost van spiska se odbacuje i
   * upisuje se prvi navedeni, da revizija ne bi ostala bez zapisa.
   */
  readonly audit: AuditAction | readonly [AuditAction, ...AuditAction[]]
  readonly rateLimit: RateLimitBucket
}

function auditActionFor(
  declared: AuditAction | readonly [AuditAction, ...AuditAction[]],
  chosen: AuditAction | undefined,
): AuditAction {
  if (!Array.isArray(declared)) return declared as AuditAction

  const allowed = declared as readonly AuditAction[]
  const fallback = allowed[0] as AuditAction
  return chosen && allowed.includes(chosen) ? chosen : fallback
}

/**
 * Omotava server akciju koju sme da pokrene samo Delta Pro osoblje.
 *
 * Opseg nad organizacijom NE proverava ovaj omotač nego RLS: politike već
 * traže da organizacija bude u app.administrable_org_ids(). Duplirana
 * provera ovde bi bila druga definicija istog pravila, a dve definicije
 * vremenom se raziđu.
 */
export function consoleAction<TState extends ActionResultBase>(
  config: ConsoleActionConfig,
  handler: (ctx: ActionContext, prev: TState, formData: FormData) => Promise<TState>,
): (prev: TState, formData: FormData) => Promise<TState> {
  return async function action(prev: TState, formData: FormData): Promise<TState> {
    const reqId = makeRequestId(await headers())

    try {
      const db = await userDb()
      const user = await currentUser(db)

      if (!user) {
        return { error: 'error.unauthenticated', requestId: reqId } as TState
      }
      if (!user.staffRole) {
        // Nalogu koji nije osoblje se ne objašnjava šta je pokušao da uradi.
        return { error: 'error.not_found.organization', requestId: reqId } as TState
      }

      const limit = checkRateLimit(config.rateLimit, user.id)
      if (!limit.allowed) {
        return { error: 'error.rate_limited', requestId: reqId } as TState
      }

      const organizationId = formString(formData, 'organizationId')
      const result = await handler({ db, user, requestId: reqId }, prev, formData)

      if (!result.error) {
        await writeAudit(db, {
          action: auditActionFor(config.audit, result.auditAction),
          status: 'success',
          actorType: 'staff',
          requestId: reqId,
          ...(organizationId ? { organizationId } : {}),
        })
      }

      return result
    } catch (cause) {
      // Poruka izuzetka često nosi upit ili putanju — ostaje u logu.
      logger.error('Server akcija nije uspela', {
        requestId: reqId,
        component: 'action',
        error: cause instanceof Error ? cause : String(cause),
      })
      return { error: 'error.internal', requestId: reqId } as TState
    }
  }
}

/**
 * Guard za akcije koje pokreće korisnik u svom radnom prostoru
 * (npr. klijentski administrator prekida sesiju pristupa).
 */
export function workspaceAction<TState extends ActionResultBase>(
  config: { rateLimit: RateLimitBucket; audit: AuditAction },
  handler: (ctx: ActionContext, prev: TState, formData: FormData) => Promise<TState>,
): (prev: TState, formData: FormData) => Promise<TState> {
  return async function action(prev: TState, formData: FormData): Promise<TState> {
    const reqId = makeRequestId(await headers())

    try {
      const db = await userDb()
      const user = await currentUser(db)

      if (!user) {
        return { error: 'error.unauthenticated', requestId: reqId } as TState
      }

      const limit = checkRateLimit(config.rateLimit, user.id)
      if (!limit.allowed) {
        return { error: 'error.rate_limited', requestId: reqId } as TState
      }

      const organizationId = formString(formData, 'organizationId')
      const result = await handler({ db, user, requestId: reqId }, prev, formData)

      if (!result.error) {
        await writeAudit(db, {
          action: auditActionFor(config.audit, result.auditAction),
          status: 'success',
          actorType: user.staffRole ? 'staff' : 'user',
          requestId: reqId,
          ...(organizationId ? { organizationId } : {}),
        })
      }

      return result
    } catch (cause) {
      logger.error('Server akcija nije uspela', {
        requestId: reqId,
        component: 'action',
        error: cause instanceof Error ? cause : String(cause),
      })
      return { error: 'error.internal', requestId: reqId } as TState
    }
  }
}
