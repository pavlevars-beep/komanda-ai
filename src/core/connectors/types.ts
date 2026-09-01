import type { z } from 'zod'
import type { Permission } from '../auth/permissions'
import type { Classification, Provenance } from '../shared/provenance'
import type { Result } from '../shared/result'
import type { Secret } from '../secrets/secret'

/**
 * Konektor izlaže POSLOVNE SPOSOBNOSTI, ne bazu.
 *
 * U ovom interfejsu namerno ne postoji `query(sql)` ni `fetchData(rawQuery)`.
 * Najbrži način da AI odgovara na poslovna pitanja bio bi da generiše SQL nad
 * bazom klijenta — i to je upravo ono što ovde nije moguće: nepredvidivo
 * opterećenje produkcije, rizik od izmene podataka i revizija koja ne može da
 * odgovori na pitanje „šta je tačno pročitano".
 *
 * Model bira KOJU sposobnost da pozove. Sam upit je unapred napisan, prošao
 * kroz pregled koda i verzionisan u repozitorijumu.
 */

export type ConnectorTypeKey =
  | 'demo'
  | 'rest'
  | 'webhook'
  | 'mssql'
  | 'postgres'
  | 'tim_erp'
  | 'ms_system'
  | 'm365'
  | 'n8n'

export type CapabilityMode = 'read' | 'prepare' | 'execute'
export type Environment = 'sandbox' | 'production'

export interface CapabilityDescriptor<TInput = unknown, TOutput = unknown> {
  readonly key: string
  readonly mode: CapabilityMode
  /** Bez ovoga sposobnost ne može da se registruje — nema „javnih" sposobnosti. */
  readonly requiredPermission: Permission
  readonly inputSchema: z.ZodType<TInput>
  readonly outputSchema: z.ZodType<TOutput>
  /** Da li je rezultat činjenica, izračunato, tumačenje ili prognoza. */
  readonly classification: Classification
  /** Posle koliko sekundi se podatak smatra zastarelim. */
  readonly freshnessSlaSeconds?: number
}

/**
 * Kontekst poziva.
 *
 * Sklapa ga ISKLJUČIVO server, iz autentikovane sesije i konfiguracije
 * integracije. Nijedno polje ne dolazi iz tela zahteva, iz upitnog parametra,
 * niti iz argumenata koje pošalje jezički model.
 */
export interface ConnectorContext {
  readonly organizationId: string
  readonly integrationId: string
  readonly userId: string
  readonly permissions: readonly Permission[]
  readonly requestId: string
  readonly environment: Environment
  readonly isDemo: boolean

  /** Konfiguracija bez tajni: bazna adresa, nazivi, vremenska ograničenja. */
  readonly config: Readonly<Record<string, unknown>>

  /**
   * Tajna se dohvata tek kada zatreba, i to lenjo.
   * Sposobnost koja ne priča sa spoljnim sistemom je nikad i ne pozove, pa
   * kredencijal u tom slučaju uopšte ne prođe kroz memoriju procesa.
   */
  readonly secret: () => Promise<Secret | null>

  /** Prekid po isteku vremena; svaka implementacija ga MORA proslediti dalje. */
  readonly signal: AbortSignal
}

export interface CapabilityResult<T = unknown> {
  readonly data: T
  readonly provenance: Provenance
  readonly rowCount?: number
}

export interface ActionResult {
  readonly externalId?: string
  readonly summary: string
  readonly raw?: Readonly<Record<string, unknown>>
}

export interface HealthResult {
  readonly ok: boolean
  readonly latencyMs: number
  readonly errorCode?: string
  /** Već redaktovana poruka — nikad stack trace, nikad connection string. */
  readonly errorMessage?: string
}

export interface Connector {
  readonly type: ConnectorTypeKey

  /**
   * Šta ova vrsta konektora ume — nezavisno od konkretne integracije.
   * Koje su od toga UKLJUČENE za organizaciju odlučuje integration_capabilities.
   */
  getCapabilities(): readonly CapabilityDescriptor[]

  /**
   * Sposobnosti izvedene iz konfiguracije konkretne integracije.
   *
   * Postoji zbog konektora poput REST-a, gde skup sposobnosti zavisi od API-ja
   * klijenta i ne može da se zna unapred. Definicije i dalje piše Delta Pro
   * kroz konzolu i one prolaze kroz RLS — model ih ne sastavlja i ne menja.
   *
   * Runner koristi ovaj metod kada postoji, inače getCapabilities().
   */
  getConfiguredCapabilities?(ctx: Omit<ConnectorContext, 'signal'>): readonly CapabilityDescriptor[]

  testConnection(ctx: ConnectorContext): Promise<HealthResult>

  /** READ i PREPARE. Nikad ne menja stanje u sistemu klijenta. */
  invoke(
    capabilityKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<CapabilityResult>>

  /**
   * EXECUTE — stvarna akcija u sistemu klijenta.
   *
   * Izostavljen kod konektora koji su samo za čitanje. Runner odbija poziv
   * EXECUTE sposobnosti bez odobrenog zahteva, tako da ni implementiran
   * metod ne može da se pokrene mimo tog toka.
   */
  execute?(
    actionKey: string,
    input: unknown,
    ctx: ConnectorContext,
  ): Promise<Result<ActionResult>>
}

/** Greške konektora koje runner ume da razlikuje i prikaže. */
export type ConnectorErrorCode =
  | 'unknown_capability'
  | 'capability_disabled'
  | 'permission_denied'
  | 'invalid_input'
  | 'invalid_output'
  | 'timeout'
  | 'unreachable'
  | 'auth_failed'
  | 'blocked_destination'
  | 'upstream_error'
  | 'execute_requires_approval'
