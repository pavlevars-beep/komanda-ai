/**
 * Pravljenje adrese radnog prostora iz naziva firme.
 *
 * Srpski nazivi redovno sadrže dijakritike, a oni u URL-u postaju procentni
 * zapis (`%C4%8D`) koji je nečitljiv i lomi se pri kopiranju. Zato se prvo
 * preslovljavaju u latinicu bez znakova — „Čačak Trade" postaje „cacak-trade",
 * a ne „%C4%8Ca%C4%8Dak-trade".
 *
 * Preslovljavanje je namerno ručno, a ne kroz Unicode normalizaciju: „đ" i „ž"
 * nisu slova sa dijakritikom u NFD smislu, pa bi ih `normalize('NFD')` propustio.
 */

const TRANSLITERATION: Record<string, string> = {
  č: 'c',
  ć: 'c',
  š: 's',
  ž: 'z',
  đ: 'dj',
  Č: 'c',
  Ć: 'c',
  Š: 's',
  Ž: 'z',
  Đ: 'dj',
}

export const SLUG_MIN = 3
export const SLUG_MAX = 50

export function slugify(input: string): string {
  const transliterated = [...input.trim()]
    .map((ch) => TRANSLITERATION[ch] ?? ch)
    .join('')
    // Preostali dijakritici iz drugih jezika (é, ü, ā…) se skidaju.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}

/** Ista pravila koja sprovodi CHECK ograničenje na organizations.slug. */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(value)
}
