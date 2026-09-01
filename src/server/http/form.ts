import 'server-only'

/**
 * Čitanje polja iz forme.
 *
 * `FormData.get()` vraća `string | File | null`. Bez ove provere, polje u
 * koje je poslat fajl završi kao `[object File]` — u revizionom tragu, u
 * upitu ka bazi, ili u poruci korisniku. Napadaču je dovoljno da promeni
 * `enctype` forme.
 */
export function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' ? value : undefined
}

/** Isto, ali vraća `null` za prazan string — pogodno za opciona polja. */
export function formStringOrNull(formData: FormData, key: string): string | null {
  const value = formString(formData, key)
  return value === undefined || value.trim() === '' ? null : value
}
