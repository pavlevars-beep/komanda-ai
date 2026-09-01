import { err, ok, domainError, type Result } from '../shared/result'

/**
 * Zaštita odlaznih poziva od zloupotrebe (SSRF).
 *
 * Konsultant unosi adresu integracije kroz formular. Bez provere, ta adresa
 * može da pokaže na nešto što nije klijentov sistem nego naša sopstvena
 * infrastruktura:
 *
 *   http://169.254.169.254/latest/meta-data/iam/security-credentials/
 *     → kredencijali instance u oblaku
 *   http://127.0.0.1:54321/rest/v1/organizations
 *     → naš Supabase, zaobilazeći ceo model izolacije
 *   http://10.0.0.5:6379
 *     → interni servisi u privatnoj mreži
 *
 * Zato adresa prolazi kroz proveru pre svakog poziva, a ne samo pri snimanju:
 * DNS zapis se može promeniti između ta dva trenutka (DNS rebinding).
 */

// ---------------------------------------------------------------------------
// IPv4
// ---------------------------------------------------------------------------

const DOTTED_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function parseIpv4(host: string): [number, number, number, number] | null {
  const m = DOTTED_IPV4.exec(host)
  if (!m) return null

  const parts = [m[1], m[2], m[3], m[4]].map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null

  return parts as [number, number, number, number]
}

export function isPrivateIpv4(host: string): boolean {
  const ip = parseIpv4(host)
  if (!ip) return false

  const [a, b] = ip

  if (a === 0) return true // 0.0.0.0/8 — "ovaj host"
  if (a === 10) return true // privatni opseg
  if (a === 127) return true // petlja
  if (a === 169 && b === 254) return true // link-local; ovde živi metadata servis
  if (a === 172 && b >= 16 && b <= 31) return true // privatni opseg
  if (a === 192 && b === 168) return true // privatni opseg
  if (a === 192 && b === 0) return true // 192.0.0.0/24 — IETF protokoli
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true // opseg za testiranje
  if (a >= 224) return true // multicast i rezervisano

  return false
}

// ---------------------------------------------------------------------------
// IPv6
// ---------------------------------------------------------------------------

export function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')

  if (h === '::1' || h === '::') return true

  // IPv4 upisan u IPv6 (::ffff:127.0.0.1) — proverava se ugrađena adresa,
  // inače bi petlja prošla samo zato što je zapisana drugačije.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h)
  if (mapped?.[1]) return isPrivateIpv4(mapped[1])

  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true // fc00::/7 — jedinstvene lokalne
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true // fe80::/10 — link-local
  if (/^ff[0-9a-f]{2}:/.test(h)) return true // multicast

  return false
}

// ---------------------------------------------------------------------------
// Imena hostova
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'nsupdate',
])

/** Sufiksi koji po definiciji vode u internu mrežu. */
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa']

/**
 * Host koji nije ni ispravna IPv4 adresa ni valjano DNS ime.
 *
 * Ovde se hvataju zapisi koji izgledaju bezopasno a razrešavaju se u petlju:
 *   http://2130706433/    (decimalno)
 *   http://0x7f000001/    (heksadecimalno)
 *   http://017700000001/  (oktalno)
 *
 * Umesto da se svaki zapis dešifruje, odbija se sve što nije dotted IPv4 ili
 * ime sa slovnim vršnim domenom. Lista dozvoljenih oblika je kraća i sigurnija
 * od liste zabranjenih.
 */
export function isSuspiciousHostFormat(host: string): boolean {
  if (host.startsWith('[')) return false // IPv6 se proverava zasebno
  if (parseIpv4(host)) return false // ispravna dotted IPv4

  // Sve cifre, heksadecimalni ili oktalni zapis broja.
  if (/^\d+$/.test(host)) return true
  if (/^0x[0-9a-f]+$/i.test(host)) return true
  if (/^0\d+$/.test(host)) return true

  // Nepotpuni oblici tipa 127.1 ili 10.0.1
  if (/^\d+(\.\d+){1,2}$/.test(host)) return true

  // Valjano DNS ime mora da ima tačku i slovni vršni domen.
  return !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(host)
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().trim().replace(/\.$/, '')

  if (BLOCKED_HOSTNAMES.has(h)) return true
  if (BLOCKED_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true
  if (isPrivateIpv4(h)) return true
  if (isPrivateIpv6(h)) return true
  if (isSuspiciousHostFormat(h)) return true

  return false
}

// ---------------------------------------------------------------------------
// Provera cele adrese
// ---------------------------------------------------------------------------

export interface GuardOptions {
  /**
   * Dozvoljeni hostovi za ovu integraciju. Prazna lista znači da nijedan nije
   * odobren — odsustvo allowlist-a nikad ne znači „sve je dozvoljeno".
   */
  readonly allowedHosts: readonly string[]
  /** U sandbox okruženju se dozvoljava http, radi lokalnog razvoja. */
  readonly allowInsecure?: boolean
}

/** Host se poklapa tačno, ili kao poddomen unosa oblika `.primer.rs`. */
export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')

  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase().trim().replace(/\.$/, '')
    if (allowed === '') return false
    if (allowed.startsWith('.')) return h === allowed.slice(1) || h.endsWith(allowed)
    return h === allowed
  })
}

export function guardUrl(rawUrl: string, options: GuardOptions): Result<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return err(domainError('invalid_input', 'connector.error.invalidUrl'))
  }

  const allowedProtocols = options.allowInsecure ? ['https:', 'http:'] : ['https:']
  if (!allowedProtocols.includes(url.protocol)) {
    return err(domainError('invalid_input', 'connector.error.insecureProtocol'))
  }

  // Kredencijali u adresi se tiho šalju uz svaki poziv i završe u logovima.
  if (url.username !== '' || url.password !== '') {
    return err(domainError('invalid_input', 'connector.error.credentialsInUrl'))
  }

  if (isBlockedHostname(url.hostname)) {
    return err(domainError('forbidden', 'connector.error.blockedDestination'))
  }

  if (!hostAllowed(url.hostname, options.allowedHosts)) {
    return err(domainError('forbidden', 'connector.error.hostNotAllowed'))
  }

  return ok(url)
}

/**
 * Provera IP adrese na koju se ime stvarno razrešilo.
 *
 * Poziva se POSLE razrešavanja DNS-a, neposredno pre slanja zahteva. Bez toga
 * ostaje rupa: napadač registruje domen koji prolazi allowlist, a njegov DNS
 * zapis pokazuje na 127.0.0.1.
 */
export function isBlockedAddress(address: string): boolean {
  return isPrivateIpv4(address) || isPrivateIpv6(address)
}
