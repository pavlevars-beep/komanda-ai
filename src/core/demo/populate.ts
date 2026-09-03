import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import { err, ok, domainError, type Result } from '../shared/result'
import { createTranslator } from '@/i18n/translator'
import { INTL_LOCALE, LOCALES, type Locale } from '@/i18n/config'

/**
 * Punjenje radnog prostora demo sadržajem.
 *
 * Postoji zbog jednog konkretnog problema: klijent na prazan ekran ne može da
 * kaže da li alat radi. Kartice bez upozorenja, bez poruka i bez beleški
 * izgledaju kao nedovršen proizvod čak i kada svaki deo radi.
 *
 * Tri pravila:
 *
 * 1. Sadržaj se IZVODI iz stvarnog odgovora konektora, ne izmišlja. Poruka
 *    „kontaktirajte X jer kasni 94 dana" nastaje samo ako je konektor stvarno
 *    vratio dužnika sa 94 dana. Inače bi na ekranu stajala rečenica koju
 *    nijedan podatak ne potvrđuje — a to je tačno ono što ovaj proizvod ne sme.
 *
 * 2. Radi ISKLJUČIVO nad organizacijom označenom kao demo. Provera je ovde, a
 *    ne u UI-ju, jer je UI najlakše zaobići.
 *
 * 3. Idempotentno je. Isti dužnik ne dobija drugo upozorenje pri ponovnom
 *    pokretanju — `dedupe_key` to sprečava na nivou baze.
 */

const POPULATE_TIMEOUT_MS = 10_000

/** Prag posle kojeg dugovanje prestaje da bude kašnjenje i postaje problem naplate. */
const CRITICAL_OVERDUE_DAYS = 90
const WARNING_OVERDUE_DAYS = 60
/** Obaveza unutar ovog roka traži da neko proveri raspoloživa sredstva. */
const PAYABLE_SOON_DAYS = 7

interface DemoAlert {
  readonly dedupeKey: string
  readonly severity: 'info' | 'warning' | 'critical'
  readonly title: string
  readonly body: Record<Locale, string>
}

interface Built {
  readonly alerts: readonly DemoAlert[]
  readonly notes: readonly string[]
}

function money(amount: string, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount))
}

function day(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

/** Isti tekst na oba jezika — telo upozorenja se čuva dvojezično. */
function bilingual(build: (locale: Locale) => string): Record<Locale, string> {
  const out = {} as Record<Locale, string>
  for (const locale of LOCALES) out[locale] = build(locale)
  return out
}

async function capability(
  db: Db,
  ctx: OrgContext,
  integrationId: string,
  connectorType: string,
  key: string,
): Promise<unknown> {
  const connector = getConnector(connectorType)
  if (!connector) return null

  const enabled = await listEnabledCapabilities(db, ctx.organizationId, integrationId)
  if (!enabled.ok) return null

  const result = await runCapability({
    connector,
    capabilityKey: key,
    input: {},
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: POPULATE_TIMEOUT_MS,
    ctx: {
      organizationId: ctx.organizationId,
      integrationId,
      userId: ctx.userId,
      permissions: ctx.permissions,
      requestId: ctx.requestId,
      environment: 'sandbox',
      isDemo: true,
      config: {},
      secret: () => Promise.resolve(null),
    },
  })

  return result.ok ? result.value.data : null
}

interface DebtorItem {
  customer: string
  amount: string
  currency: string
  oldestOverdueDays: number
}
interface PayableItem {
  supplier: string
  amount: string
  currency: string
  dueDate: string
  daysUntilDue: number
}
interface InventoryItem {
  item: string
  onHand: number
  minimum: number
  daysOfCover: number
}

function asArray<T>(data: unknown, field: string): T[] {
  if (data === null || typeof data !== 'object') return []
  const value = (data as Record<string, unknown>)[field]
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Sastavljanje upozorenja i beleški iz odgovora konektora.
 *
 * Izdvojeno iz upisa da bi moglo da se testira bez baze — pravila o tome šta
 * je kritično a šta samo vredno pomena su poslovna odluka i moraju da budu
 * proverljiva.
 */
export function buildDemoContent(input: {
  readonly debtors: unknown
  readonly payables: unknown
  readonly inventory: unknown
  readonly defaultLocale: Locale
}): Built {
  const alerts: DemoAlert[] = []
  const notes: string[] = []

  const title = (locale: Locale) => createTranslator(locale).t

  const debtors = asArray<DebtorItem>(input.debtors, 'items')
  for (const d of debtors) {
    if (d.oldestOverdueDays < WARNING_OVERDUE_DAYS) continue

    const critical = d.oldestOverdueDays >= CRITICAL_OVERDUE_DAYS
    alerts.push({
      dedupeKey: `demo:debtor:${d.customer}`,
      severity: critical ? 'critical' : 'warning',
      title: title(input.defaultLocale)('demo.alert.debtor.title', {
        days: d.oldestOverdueDays,
      }),
      body: bilingual((locale) =>
        title(locale)('demo.alert.debtor.body', {
          name: d.customer,
          amount: money(d.amount, d.currency, locale),
          days: d.oldestOverdueDays,
        }),
      ),
    })
  }

  const payables = asArray<PayableItem>(input.payables, 'items')
  for (const p of payables) {
    if (p.daysUntilDue > PAYABLE_SOON_DAYS) continue

    alerts.push({
      dedupeKey: `demo:payable:${p.supplier}:${p.dueDate}`,
      // Već dospela obaveza je druga vrsta problema od one koja tek dospeva.
      severity: p.daysUntilDue < 0 ? 'critical' : 'warning',
      title: title(input.defaultLocale)('demo.alert.payable.title'),
      body: bilingual((locale) =>
        title(locale)('demo.alert.payable.body', {
          name: p.supplier,
          amount: money(p.amount, p.currency, locale),
          date: day(p.dueDate, locale),
        }),
      ),
    })
  }

  const inventory = asArray<InventoryItem>(input.inventory, 'items')
  for (const i of inventory) {
    if (i.onHand >= i.minimum) continue

    alerts.push({
      dedupeKey: `demo:inventory:${i.item}`,
      severity: i.daysOfCover <= 3 ? 'critical' : 'warning',
      title: title(input.defaultLocale)('demo.alert.inventory.title'),
      body: bilingual((locale) =>
        title(locale)('demo.alert.inventory.body', {
          name: i.item,
          onHand: i.onHand,
          minimum: i.minimum,
          days: i.daysOfCover,
        }),
      ),
    })
  }

  // Beleške prate ono što upozorenja pokazuju — konsultantov komentar uz
  // brojeve, ne nezavisan tekst.
  const t = title(input.defaultLocale)
  const worst = debtors[0]
  if (worst) {
    notes.push(
      t('demo.note.collection', {
        name: worst.customer,
        days: worst.oldestOverdueDays,
      }),
    )
  }
  if (inventory.length > 0) {
    notes.push(t('demo.note.inventory', { count: inventory.length }))
  }
  notes.push(t('demo.note.weekly'))

  return { alerts, notes }
}

export interface PopulateResult {
  readonly alerts: number
  readonly notes: number
}

export async function populateDemoContent(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  isDemoOrganization: boolean,
): Promise<Result<PopulateResult>> {
  // Provera je ovde, ne u UI-ju. Demo sadržaj nad stvarnim klijentom bio bi
  // izmišljen podatak u sistemu kojem ljudi veruju.
  if (!isDemoOrganization) {
    return err(domainError('forbidden', 'demo.error.notDemoOrganization'))
  }
  if (!integrationId || !connectorType) {
    return err(domainError('not_found', 'demo.error.noIntegration'))
  }

  const [debtors, payables, inventory] = await Promise.all([
    capability(db, ctx, integrationId, connectorType, 'get_top_debtors'),
    capability(db, ctx, integrationId, connectorType, 'get_payables'),
    capability(db, ctx, integrationId, connectorType, 'get_inventory_alerts'),
  ])

  if (debtors === null && payables === null && inventory === null) {
    return err(domainError('integration_unavailable', 'demo.error.noData'))
  }

  const built = buildDemoContent({
    debtors,
    payables,
    inventory,
    defaultLocale: ctx.locale,
  })

  // `dedupe_key` uz jedinstveni indeks nad otvorenim upozorenjima znači da
  // ponovno pokretanje ne pravi duplikate — zato `ignoreDuplicates`.
  const { error: alertError, count } = await db.from('alerts').upsert(
    built.alerts.map((a) => ({
      organization_id: ctx.organizationId,
      severity: a.severity,
      title: a.title,
      body: a.body,
      source: 'rule',
      status: 'new',
      dedupe_key: a.dedupeKey,
      context: { generated: 'demo' },
    })),
    { onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true, count: 'exact' },
  )

  if (alertError) {
    return err(
      domainError('forbidden', 'demo.error.cannotWrite', { detail: alertError.message }),
    )
  }

  const { error: noteError } = await db.from('notes').insert(
    built.notes.map((body) => ({
      organization_id: ctx.organizationId,
      author_id: ctx.userId,
      body,
    })),
  )

  if (noteError) {
    return err(domainError('forbidden', 'demo.error.cannotWrite', { detail: noteError.message }))
  }

  return ok({ alerts: count ?? built.alerts.length, notes: built.notes.length })
}
