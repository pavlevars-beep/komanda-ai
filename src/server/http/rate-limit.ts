import 'server-only'

/**
 * Ograničavanje broja zahteva.
 *
 * Implementacija je u memoriji procesa i time NAMERNO privremena: na više
 * instanci svaka broji za sebe. Interfejs je takav da se zamena deljenim
 * brojačem (Upstash, Redis) svodi na jedan modul.
 *
 * Ipak nije kozmetika — čak i po instanci zaustavlja pogađanje lozinki i
 * ponavljanje skupih poziva (AI, test veze) iz jedne sesije.
 */

export type RateLimitBucket = 'read' | 'write' | 'auth' | 'ai' | 'connector_test'

interface Rule {
  readonly limit: number
  readonly windowMs: number
}

const RULES: Record<RateLimitBucket, Rule> = {
  read: { limit: 300, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 300_000 },
  ai: { limit: 20, windowMs: 60_000 },
  connector_test: { limit: 10, windowMs: 60_000 },
}

interface Counter {
  count: number
  resetAt: number
}

const counters = new Map<string, Counter>()

export interface RateLimitResult {
  readonly allowed: boolean
  readonly remaining: number
  readonly resetAt: number
}

export function checkRateLimit(bucket: RateLimitBucket, identity: string): RateLimitResult {
  const rule = RULES[bucket]
  const key = `${bucket}:${identity}`
  const now = Date.now()

  const existing = counters.get(key)
  if (!existing || existing.resetAt <= now) {
    const fresh: Counter = { count: 1, resetAt: now + rule.windowMs }
    counters.set(key, fresh)
    sweep(now)
    return { allowed: true, remaining: rule.limit - 1, resetAt: fresh.resetAt }
  }

  existing.count += 1
  return {
    allowed: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    resetAt: existing.resetAt,
  }
}

/** Povremeno čišćenje, da mapa ne raste neograničeno. */
let lastSweep = 0
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key)
  }
}

/** Samo za testove. */
export function resetRateLimits(): void {
  counters.clear()
}
