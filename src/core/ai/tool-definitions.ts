import { z } from 'zod'
import type { IntentKey } from './question-matcher'
import type { ToolDefinition } from './conversation'

/**
 * Sposobnosti → alati koje model vidi.
 *
 * Spisak je ZATVOREN i izveden iz istih sposobnosti koje hrane tablu i brif.
 * Nema alata koji piše upit, čita proizvoljnu tabelu ili prima naziv
 * organizacije — organizacija dolazi iz sesije, uzvodno, i model je nikad ne vidi.
 *
 * Uz definiciju stoji i Zod šema, i ona je ta koja odlučuje. JSON shema je
 * MOLBA modelu da pošalje ispravan oblik; Zod je provera da je stvarno poslao.
 * Model koji izmisli polje ili pošalje datum kao broj biva odbijen ovde.
 */

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'datum mora biti u obliku GGGG-MM-DD')

/*
 * Opseg se ograničava na dve godine.
 *
 * Nije zbog performansi nego zbog toga što model ume da traži „od 0001-01-01"
 * kada pitanje glasi „oduvek". Takav upit ne daje uvid nego čekanje, pa se
 * granica kaže naglas umesto da se tiho poseče.
 */
const MAX_RANGE_DAYS = 730

const rangeSchema = z
  .object({ from: dateString, to: dateString })
  .refine((v) => v.from <= v.to, { message: 'from mora biti pre to' })
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= MAX_RANGE_DAYS,
    { message: `opseg ne sme da pređe ${MAX_RANGE_DAYS} dana` },
  )

/** Zod šema ulaza po alatu. Prazan objekat znači „bez parametara". */
export const TOOL_INPUT: Record<IntentKey, z.ZodType> = {
  get_daily_sales: z.object({ date: dateString }),
  get_sales_by_period: rangeSchema,
  get_financial_summary: rangeSchema,
  get_outstanding_invoices: z.object({
    overdueDays: z.number().int().min(0).max(3650).default(0),
  }),
  get_top_debtors: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  get_payables: z.object({ withinDays: z.number().int().min(1).max(365).default(7) }),
  get_headcount: z.object({}),
  get_inventory_alerts: z.object({}),
  get_stock_status: z.object({}),
}

/** Kratak opis ZA MODEL — ne za korisnika. Kaže kada se alat koristi. */
const DESCRIPTION: Record<IntentKey, string> = {
  get_daily_sales: 'Promet za jedan dan. Koristi za pitanja o jučerašnjoj ili današnjoj prodaji.',
  get_sales_by_period:
    'Promet u opsegu datuma, sa poređenjem sa prethodnim jednakim opsegom. Za nedelju, mesec, kvartal.',
  get_financial_summary: 'Prihod, rashod, dobit i marža u opsegu datuma.',
  get_outstanding_invoices:
    'Otvorena potraživanja po starosti duga. `overdueDays` filtrira samo dospelo preko toliko dana.',
  get_top_debtors: 'Kupci koji najviše duguju, po iznosu.',
  get_payables: 'Obaveze prema dobavljačima koje dospevaju u narednih `withinDays` dana.',
  get_headcount: 'Broj zaposlenih, po odeljenjima.',
  get_inventory_alerts:
    'Artikli u riziku: ispod minimuma ili sa pokrivenošću kraćom od roka isporuke.',
  get_stock_status: 'Stanje zaliha i pokrivenost u danima, po artiklu.',
}

/**
 * JSON shema koju model dobija.
 *
 * Piše se ručno, a ne izvodi iz Zod-a: izvedena shema nosi i unutrašnje detalje
 * provere (`refine`, podrazumevane vrednosti) koje model ne ume da pročita, a
 * koje samo troše prostor u svakom pozivu.
 */
const PARAMETERS: Record<IntentKey, Readonly<Record<string, unknown>>> = {
  get_daily_sales: {
    type: 'object',
    properties: { date: { type: 'string', description: 'GGGG-MM-DD' } },
    required: ['date'],
  },
  get_sales_by_period: rangeParameters(),
  get_financial_summary: rangeParameters(),
  get_outstanding_invoices: {
    type: 'object',
    properties: {
      overdueDays: { type: 'integer', minimum: 0, description: 'Samo dospelo preko toliko dana.' },
    },
  },
  get_top_debtors: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
  },
  get_payables: {
    type: 'object',
    properties: { withinDays: { type: 'integer', minimum: 1, maximum: 365 } },
  },
  get_headcount: { type: 'object', properties: {} },
  get_inventory_alerts: { type: 'object', properties: {} },
  get_stock_status: { type: 'object', properties: {} },
}

function rangeParameters(): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'GGGG-MM-DD' },
      to: { type: 'string', description: 'GGGG-MM-DD' },
    },
    required: ['from', 'to'],
  }
}

/**
 * Alati za ovog korisnika.
 *
 * Prima SAMO namere koje su već i uključene i dozvoljene. Filtriranje se ne radi
 * ovde — radi se uzvodno, jednom, istom funkcijom koja hrani i predloge pitanja.
 */
export function toolsFor(intents: readonly IntentKey[]): readonly ToolDefinition[] {
  return intents.map((name) => ({
    name,
    description: DESCRIPTION[name],
    parameters: PARAMETERS[name],
  }))
}

export type ToolInputResult =
  | { readonly ok: true; readonly input: Record<string, unknown> }
  | { readonly ok: false; readonly reason: string }

/**
 * Provera onoga što je model poslao.
 *
 * Ovo je granica: posle nje ulaz ide u sposobnost. Model koji pošalje besmislen
 * datum ili opseg od deset godina biva odbijen sa razlogom koji mu se vraća, pa
 * ume da se ispravi — umesto da sposobnost dobije ulaz koji nije očekivala.
 */
export function parseToolInput(name: IntentKey, args: unknown): ToolInputResult {
  const parsed = TOOL_INPUT[name].safeParse(args ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((i) => `${i.path.join('.') || 'ulaz'}: ${i.message}`).join('; '),
    }
  }
  return { ok: true, input: parsed.data as Record<string, unknown> }
}
