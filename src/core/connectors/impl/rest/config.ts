import { z } from 'zod'
import { PERMISSIONS } from '../../../auth/permissions'

/**
 * Konfiguracija REST integracije.
 *
 * Sposobnosti se ovde DEKLARIŠU, a ne programiraju. Skup sposobnosti zavisi od
 * API-ja klijenta i ne može se znati unapred, ali definicije piše Delta Pro
 * kroz konzolu — model ih ne sastavlja, ne menja i ne može da doda novu.
 *
 * Ono što se namerno NE dozvoljava:
 *   • proizvoljna putanja u trenutku poziva (putanja je deo definicije)
 *   • metode koje menjaju stanje kod čitajućih sposobnosti
 *   • host van allowlist-a, ma šta pisalo u baznoj adresi
 */

const fieldType = z.enum(['string', 'number', 'boolean', 'date'])

export const restField = z.object({
  /** Naziv polja u našem izlazu. */
  name: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'connector.error.invalidFieldName'),
  /** Putanja u JSON odgovoru, tačkasta notacija: `data.total_amount`. */
  path: z.string().min(1).max(200),
  type: fieldType,
  optional: z.boolean().default(false),
})

export type RestField = z.infer<typeof restField>

export const restCapability = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,60}$/, 'connector.error.invalidCapabilityKey'),
  // Samo čitanje. Akcije koje menjaju stanje idu kroz webhook konektor i tok
  // odobrenja, ne kroz slobodno konfigurisan REST poziv.
  method: z.literal('GET').default('GET'),
  path: z.string().startsWith('/').max(300),
  requiredPermission: z.enum(PERMISSIONS),
  classification: z.enum(['fact', 'calculation', 'interpretation', 'forecast']).default('fact'),
  freshnessSlaSeconds: z.number().int().min(0).max(604800).optional(),
  /** Parametri koje sposobnost prima; ubacuju se kao upitni parametri. */
  params: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
        type: fieldType,
        required: z.boolean().default(true),
      }),
    )
    .max(10)
    .default([]),
  /** Gde u odgovoru počinje niz redova; prazno znači da odgovor nije lista. */
  rowsPath: z.string().max(200).optional(),
  fields: z.array(restField).min(1).max(40),
})

export type RestCapability = z.infer<typeof restCapability>

export const restConfig = z.object({
  baseUrl: z.string().url(),
  /**
   * Hostovi na koje ova integracija sme da se obrati.
   * Prazna lista znači da nijedan nije odobren — odsustvo allowlist-a nikad
   * ne znači „sve je dozvoljeno".
   */
  allowedHosts: z.array(z.string().min(1).max(253)).max(10).default([]),
  authType: z.enum(['none', 'api_key', 'bearer', 'basic']).default('none'),
  /** Naziv zaglavlja za api_key; vrednost dolazi iz Vault-a, nikad odavde. */
  apiKeyHeader: z.string().max(60).default('X-API-Key'),
  timeoutMs: z.number().int().min(1000).max(60000).default(15000),
  capabilities: z.array(restCapability).max(50).default([]),
})

export type RestConfig = z.infer<typeof restConfig>

/** Čita vrednost iz JSON-a po tačkastoj putanji, bez `eval` i bez indeksa. */
export function readPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, source)
}

/** Gradi Zod šemu izlaza iz deklarisanih polja. */
export function outputSchemaFor(capability: RestCapability): z.ZodType {
  const shape: Record<string, z.ZodType> = {}

  for (const field of capability.fields) {
    const base =
      field.type === 'number'
        ? z.number()
        : field.type === 'boolean'
          ? z.boolean()
          : z.string()
    shape[field.name] = field.optional ? base.nullable() : base
  }

  const row = z.object(shape)
  return capability.rowsPath ? z.object({ items: z.array(row) }) : row
}

export function inputSchemaFor(capability: RestCapability): z.ZodType {
  const shape: Record<string, z.ZodType> = {}

  for (const param of capability.params) {
    const base =
      param.type === 'number'
        ? z.coerce.number()
        : param.type === 'boolean'
          ? z.coerce.boolean()
          : param.type === 'date'
            ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
            : z.string().max(200)
    shape[param.name] = param.required ? base : base.optional()
  }

  // Nepoznati parametri se odbacuju, ne prosleđuju — inače bi model mogao da
  // doda upitni parametar koji definicija ne predviđa.
  return z.object(shape).strict()
}
