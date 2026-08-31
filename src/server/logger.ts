import 'server-only'
import { env } from './env'

/**
 * Logger sa obaveznom redakcijom tajni.
 *
 * Pravilo: nijedan zapis ne sme da sadrži lozinku, token, ključ ni connection
 * string — ni slučajno, ni kroz ugnežden objekat, ni kroz poruku greške.
 * Redakcija je rekurzivna i radi po nazivu ključa, a ne po sadržaju, jer se
 * na naziv može osloniti a na oblik vrednosti ne.
 */

const REDACTED = '[REDACTED]'

/** Nazivi ključeva čija se vrednost nikad ne ispisuje. */
const FORBIDDEN_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'client_secret',
  'private_key',
  'connection_string',
  'connectionstring',
  'dsn',
  'service_role',
  'anon_key',
  'vault_secret_id',
  'cookie',
  'set-cookie',
]

/** Oblici koji izgledaju kao tajna i kad ključ nije sumnjiv. */
const SECRET_SHAPES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi,
  /\b(?:postgres|postgresql|mysql|mssql):\/\/[^\s"']+/gi,
]

function isForbiddenKey(key: string): boolean {
  const k = key.toLowerCase()
  return FORBIDDEN_KEYS.some((f) => k === f || k.includes(f))
}

function scrubString(value: string): string {
  return SECRET_SHAPES.reduce((acc, re) => acc.replace(re, REDACTED), value)
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[dubina prekoračena]'
  if (value === null || value === undefined) return value

  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      // Stack trace se namerno ne ispisuje u produkciji.
      ...(env().NODE_ENV === 'production' ? {} : { stack: value.stack }),
    }
  }

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isForbiddenKey(k) ? REDACTED : redact(v, depth + 1)
    }
    return out
  }

  return '[neserijalizovano]'
}

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LogContext {
  requestId?: string
  organizationId?: string
  userId?: string
  component?: string
  [key: string]: unknown
}

function emit(level: Level, message: string, context?: LogContext): void {
  if (ORDER[level] < ORDER[env().LOG_LEVEL]) return

  const record = {
    level,
    time: new Date().toISOString(),
    message: scrubString(message),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  }

  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),

  /** Podlogger sa fiksnim kontekstom — koristi se po zahtevu. */
  child(base: LogContext) {
    return {
      debug: (m: string, c?: LogContext) => emit('debug', m, { ...base, ...c }),
      info: (m: string, c?: LogContext) => emit('info', m, { ...base, ...c }),
      warn: (m: string, c?: LogContext) => emit('warn', m, { ...base, ...c }),
      error: (m: string, c?: LogContext) => emit('error', m, { ...base, ...c }),
    }
  },
}
