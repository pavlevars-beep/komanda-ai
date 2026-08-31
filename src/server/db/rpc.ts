import type { Db } from './types'

/**
 * Jedini prelaz preko netipizovane granice ka PostgREST-u.
 *
 * `db.rpc()` bez generisanih tipova šeme vraća `any`, a `any` se dalje širi
 * kroz kod i tiho gasi proveru tipova. Zato se taj prelaz radi ovde, jednom,
 * i odmah spušta na `unknown` — pozivalac je prinuđen da ga provuče kroz Zod
 * pre nego što ga upotrebi.
 *
 * Kada projekat na Supabase-u postoji, `npm run db:types` generiše tipove i
 * ovaj modul postaje tanji, ali Zod provera ostaje: generisani tipovi ćute
 * kada se šema promeni bez ponovnog generisanja.
 */
export interface RpcResult {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

export async function callRpc(
  db: Db,
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult> {
  const result = await db.rpc(fn, args)
  return {
    data: result.data as unknown,
    error: result.error ? { message: String(result.error.message) } : null,
  }
}
