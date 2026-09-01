import type {
  CapabilityDescriptor,
  CapabilityMode,
  CapabilityResult,
  Connector,
  ConnectorContext,
  HealthResult,
} from './types'
import type { Permission } from '../auth/permissions'
import { err, ok, domainError, type DomainError, type Result } from '../shared/result'

/**
 * Sloj koji sprovodi pravila oko svakog poziva konektora.
 *
 * Implementacije konektora se pišu jednostavno — one samo dohvataju podatke.
 * Provera permisija, validacija ulaza i izlaza, vremensko ograničenje i
 * redakcija grešaka žive ovde, na jednom mestu. Zbog toga novi konektor ne
 * može da „zaboravi" bezbednosni korak: on ga i ne piše.
 */

export const DEFAULT_TIMEOUT_MS = 15_000
export const MAX_TIMEOUT_MS = 60_000

/** Sposobnost uključena za konkretnu organizaciju. */
export interface EnabledCapability {
  readonly capabilityKey: string
  readonly mode: CapabilityMode
  readonly requiredPermission: Permission
}

export interface RunInput {
  readonly connector: Connector
  readonly capabilityKey: string
  readonly input: unknown
  readonly ctx: Omit<ConnectorContext, 'signal'>
  /** Šta je Delta Pro uključila za ovu organizaciju. */
  readonly enabled: readonly EnabledCapability[]
  readonly timeoutMs?: number
  /**
   * Identifikator odobrenja. Bez njega EXECUTE sposobnost ne može da se
   * pokrene — ni iz koda, ni iz AI odgovora.
   */
  readonly approvalId?: string
}

function findDescriptor(
  connector: Connector,
  key: string,
  ctx: Omit<ConnectorContext, 'signal'>,
): CapabilityDescriptor | undefined {
  // Konektori sa konfigurabilnim sposobnostima (REST) imaju drugačiji spisak
  // po integraciji; ostali koriste spisak svog tipa.
  const capabilities = connector.getConfiguredCapabilities
    ? connector.getConfiguredCapabilities(ctx)
    : connector.getCapabilities()

  return capabilities.find((c) => c.key === key)
}

/**
 * Poruka greške koja sme da napusti server.
 *
 * Izuzetak iz konektora često nosi celu adresu sa upitnim parametrima,
 * zaglavlje sa tokenom ili connection string. Ovde se zadržava samo vrsta
 * greške; detalj ide u `detail`, koje se nikad ne serijalizuje ka klijentu.
 */
function toDomainError(cause: unknown, fallbackKey: string): DomainError {
  if (cause instanceof Error && cause.name === 'AbortError') {
    return domainError('integration_unavailable', 'connector.error.timeout')
  }

  return domainError('integration_unavailable', fallbackKey, {
    detail: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
  })
}

export async function runCapability(input: RunInput): Promise<Result<CapabilityResult>> {
  const { connector, capabilityKey, ctx } = input

  // 1. Sposobnost mora da postoji u tipu konektora.
  const descriptor = findDescriptor(connector, capabilityKey, ctx)
  if (!descriptor) {
    return err(domainError('not_found', 'connector.error.unknownCapability'))
  }

  // 2. I mora biti uključena baš za ovu organizaciju.
  //    Postojanje sposobnosti u kodu ne znači da je klijent koristi.
  const enabled = input.enabled.find((c) => c.capabilityKey === capabilityKey)
  if (!enabled) {
    return err(domainError('capability_disabled', 'connector.error.capabilityDisabled'))
  }

  /*
   * 3. Permisija se proverava OVDE, ponovo.
   *
   * Pozivalac ju je već proverio kada je sastavljao listu dostupnih alata.
   * Ta provera se ne uzima zdravo za gotovo: između sastavljanja liste i
   * poziva može da protekne ceo razgovor sa modelom, a rola korisnika u
   * međuvremenu da se promeni.
   *
   * Uzima se tražena permisija iz DEFINICIJE sposobnosti, ne iz konfiguracije
   * organizacije — inače bi pogrešan unos u bazi mogao da spusti prag.
   */
  if (!ctx.permissions.includes(descriptor.requiredPermission)) {
    return err(
      domainError('forbidden', 'error.forbidden', {
        meta: { permission: descriptor.requiredPermission },
      }),
    )
  }

  /*
   * 4. EXECUTE nikad ne prolazi bez odobrenja.
   *
   * Ovo je granica između „sistem je nešto pročitao" i „sistem je nešto uradio
   * u tuđem poslovnom sistemu". Model može da predloži akciju; pokrenuti je
   * može samo tok odobrenja.
   */
  if (descriptor.mode === 'execute' && !input.approvalId) {
    return err(domainError('approval_required', 'connector.error.approvalRequired'))
  }

  // 5. Ulaz mora da odgovara šemi sposobnosti.
  const parsedInput = descriptor.inputSchema.safeParse(input.input)
  if (!parsedInput.success) {
    return err(
      domainError('invalid_input', 'connector.error.invalidInput', {
        detail: parsedInput.error.message,
      }),
    )
  }

  // 6. Vremensko ograničenje. Konektor koji visi ne sme da drži zahtev.
  const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const result = await connector.invoke(capabilityKey, parsedInput.data, {
      ...ctx,
      signal: controller.signal,
    })

    if (!result.ok) return result

    // 7. Izlaz se proverava isto kao ulaz.
    //    Spoljni sistem sme da promeni oblik odgovora bez najave; bolje je
    //    prijaviti grešku nego proslediti nešto neočekivano u AI sloj i UI.
    const parsedOutput = descriptor.outputSchema.safeParse(result.value.data)
    if (!parsedOutput.success) {
      return err(
        domainError('integration_unavailable', 'connector.error.invalidOutput', {
          detail: parsedOutput.error.message,
        }),
      )
    }

    return ok({ ...result.value, data: parsedOutput.data })
  } catch (cause) {
    return err(toDomainError(cause, 'connector.error.upstream'))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Provera veze.
 *
 * Vraća `HealthResult` čak i kada konektor baci izuzetak — pad provere je
 * podatak o zdravlju, ne greška aplikacije.
 */
export async function runHealthCheck(
  connector: Connector,
  ctx: Omit<ConnectorContext, 'signal'>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HealthResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, MAX_TIMEOUT_MS))

  try {
    return await connector.testConnection({ ...ctx, signal: controller.signal })
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'AbortError'
    return {
      ok: false,
      latencyMs: Date.now() - started,
      errorCode: isTimeout ? 'timeout' : 'unreachable',
      // Namerno bez poruke iz izuzetka: ona zna da sadrži adresu sa tokenom.
      errorMessage: isTimeout
        ? 'Sistem nije odgovorio u zadatom roku.'
        : 'Veza sa sistemom nije uspostavljena.',
    }
  } finally {
    clearTimeout(timer)
  }
}
