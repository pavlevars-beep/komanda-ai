import type { Secret } from './secret'

/**
 * Apstrakcija skladišta tajni.
 *
 * MVP koristi Supabase Vault. Interfejs postoji da bi prelazak na AWS KMS ili
 * HashiCorp Vault — kada ga prvi enterprise klijent zatraži ugovorom — bio
 * zamena jednog modula, a ne prepravka svake integracije.
 *
 * Namerno NE postoji `list()` ni `getAll()`. Tajna se dohvata pojedinačno, po
 * poznatoj integraciji, jer nema legitimnog razloga da se sve odjednom nađu u
 * memoriji jednog procesa.
 */
export interface SecretsProvider {
  /** Vraća `null` kada kredencijal nije podešen — to nije greška, već stanje. */
  read(integrationId: string, organizationId: string): Promise<Secret | null>

  store(input: {
    integrationId: string
    organizationId: string
    value: string
    authType: string
    expiresAt?: string
  }): Promise<void>
}
