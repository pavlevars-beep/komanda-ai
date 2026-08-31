/**
 * Provera odredišta preusmeravanja.
 *
 * Parametar `next` dolazi iz URL-a, dakle od napadača. Bez provere,
 * `/login?next=https://tudji-sajt.rs` pretvara našu prijavu u odskočnu dasku
 * za phishing: korisnik vidi našu adresu, prijavi se, i završi negde drugde.
 *
 * Prihvata se samo apsolutna putanja unutar aplikacije. Odbija se sve što
 * može da se protumači kao druga adresa:
 *   //evil.rs        — bez šeme, ali vodi na drugi host
 *   /\evil.rs        — neki pregledači ovo normalizuju u //
 *   https://evil.rs  — očigledan slučaj
 *   /path?x=1#y      — upit i fragment se ne prosleđuju
 */
export function safeInternalPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value.includes('\\') || value.includes('\n') || value.includes('\r')) return fallback
  if (!/^\/[A-Za-z0-9/_-]*$/.test(value)) return fallback
  return value
}
