import type { BusinessRules } from '../rules/business-rules'

/**
 * Šta traži pažnju.
 *
 * Ovo je jezgro proizvoda. Rukovodilac ne treba da pregleda sve; treba da vidi
 * ono što odstupa. Načelo je jedno:
 *
 *   NORMALNO ĆUTI. IZUZETAK TRAŽI PAŽNJU.
 *
 * Modul je namerno čist — bez baze, bez mreže, bez vremena sistema. Prima
 * podatke i pravila, vraća rangiran spisak. Zbog toga je svako pravilo
 * proverljivo, a granica „od kada je ovo problem" vidljiva na jednom mestu
 * umesto razasuta po prikazu.
 *
 * Pragovi NE stoje ovde. Dolaze iz poslovnih pravila klijenta, jer „dospelo"
 * i „kritično" ne znače isto svakoj firmi.
 */

export type AttentionSeverity = 'critical' | 'warning' | 'info'

export type AttentionKind =
  | 'receivables_overdue'
  | 'receivables_large'
  | 'stock_critical'
  | 'stock_low'
  | 'stock_overstock'
  | 'payables_due'
  | 'sales_drop'

export interface AttentionItem {
  readonly kind: AttentionKind
  readonly severity: AttentionSeverity
  /**
   * Vrednosti za poruku. Tekst se sastavlja uzvodno, iz kataloga prevoda —
   * ovaj modul ne zna ni jezik ni format valute.
   */
  readonly params: Readonly<Record<string, string | number>>
  /**
   * Zašto je stavka tu, u brojevima. Odgovara na „zašto ovo vidim?" bez
   * pogađanja — ista pitanja koja rukovodilac postavi prva.
   */
  readonly evidence: readonly { readonly label: string; readonly value: string | number }[]
  /** Kuda vodi klik. Relativno na radni prostor. */
  readonly href?: string
}

export interface AgingBucket {
  readonly fromDays: number
  readonly toDays: number | null
  readonly amount: string
  readonly invoiceCount: number
}

export interface AttentionInput {
  readonly rules: BusinessRules
  readonly receivables?: {
    readonly total: string
    readonly overdue: string
    readonly currency: string
    readonly buckets: readonly AgingBucket[]
  }
  readonly debtors?: readonly {
    readonly customer: string
    readonly amount: string
    readonly currency: string
    readonly oldestOverdueDays: number
  }[]
  readonly stock?: readonly {
    readonly item: string
    readonly onHand: number
    readonly minimum: number
    readonly averageDailySales: number
    readonly daysOfCover: number
    readonly leadTimeDays: number
  }[]
  readonly payables?: readonly {
    readonly supplier: string
    readonly amount: string
    readonly currency: string
    readonly dueDate: string
    readonly daysUntilDue: number
  }[]
  readonly sales?: {
    readonly currency: string
    readonly last7Days: { readonly total: string; readonly changePercent: number }
    readonly monthToDate: { readonly total: string; readonly changePercent: number }
  }
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function num(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Potraživanja starija od praga.
 *
 * Uzimaju se opsezi čija DONJA granica dostiže prag, pa promena praga u
 * podešavanjima stvarno menja šta se prijavljuje. Fiksirani opseg „preko 90"
 * bi ignorisao klijenta koji smatra da je 60 već ozbiljno.
 */
function receivablesItems(input: AttentionInput): AttentionItem[] {
  const { receivables, rules } = input
  if (!receivables) return []

  const items: AttentionItem[] = []

  const atOrOver = (days: number) =>
    receivables.buckets.filter((b) => b.fromDays >= days)

  const critical = atOrOver(rules.receivableCriticalDays)
  const criticalAmount = critical.reduce((sum, b) => sum + num(b.amount), 0)
  const criticalCount = critical.reduce((sum, b) => sum + b.invoiceCount, 0)

  if (criticalAmount > 0) {
    items.push({
      kind: 'receivables_overdue',
      severity: 'critical',
      params: {
        amount: criticalAmount,
        currency: receivables.currency,
        days: rules.receivableCriticalDays,
        count: criticalCount,
      },
      evidence: [
        { label: 'evidence.overdueAmount', value: criticalAmount },
        { label: 'evidence.invoiceCount', value: criticalCount },
        { label: 'evidence.threshold', value: rules.receivableCriticalDays },
      ],
      href: '/potrazivanja',
    })
  }

  // Srednji opseg: preko praga upozorenja, ali ispod kritičnog. Bez izuzimanja
  // kritičnog dela isti novac bi se prijavio dvaput, u dve težine.
  const warning = receivables.buckets.filter(
    (b) => b.fromDays >= rules.receivableWarningDays && b.fromDays < rules.receivableCriticalDays,
  )
  const warningAmount = warning.reduce((sum, b) => sum + num(b.amount), 0)

  if (warningAmount > 0) {
    items.push({
      kind: 'receivables_overdue',
      severity: 'warning',
      params: {
        amount: warningAmount,
        currency: receivables.currency,
        days: rules.receivableWarningDays,
        count: warning.reduce((sum, b) => sum + b.invoiceCount, 0),
      },
      evidence: [
        { label: 'evidence.overdueAmount', value: warningAmount },
        { label: 'evidence.threshold', value: rules.receivableWarningDays },
      ],
      href: '/potrazivanja',
    })
  }

  return items
}

/** Pojedinačno veliki dužnik — traži pažnju i kada ukupno kašnjenje nije alarmantno. */
function debtorItems(input: AttentionInput): AttentionItem[] {
  const { debtors, rules } = input
  if (!debtors) return []

  return debtors
    .filter(
      (d) =>
        num(d.amount) >= rules.largeReceivableAmount &&
        d.oldestOverdueDays >= rules.receivableWarningDays,
    )
    .map((d) => ({
      kind: 'receivables_large' as const,
      severity:
        d.oldestOverdueDays >= rules.receivableCriticalDays
          ? ('critical' as const)
          : ('warning' as const),
      params: {
        name: d.customer,
        amount: num(d.amount),
        currency: d.currency,
        days: d.oldestOverdueDays,
      },
      evidence: [
        { label: 'evidence.amount', value: num(d.amount) },
        { label: 'evidence.overdueDays', value: d.oldestOverdueDays },
      ],
      href: '/potrazivanja',
    }))
}

/**
 * Zalihe po POKRIVENOSTI, ne po stanju.
 *
 * Pet komada artikla koji se prodaje dvaput godišnje nije problem; pet stotina
 * komada artikla koji ide osamnaest dnevno možda jeste. Po samom stanju
 * izgleda obrnuto — zato se ovde nikad ne poredi gola količina.
 *
 * Artikal bez potrošnje se preskače. Deljenje nulom bi dalo beskonačnu
 * pokrivenost, a „zaliha traje beskonačno" nije uvid nego artefakt računa.
 */
function stockItems(input: AttentionInput): AttentionItem[] {
  const { stock, rules } = input
  if (!stock) return []

  const items: AttentionItem[] = []

  for (const s of stock) {
    if (s.averageDailySales <= 0) continue

    const base = {
      params: {
        name: s.item,
        days: s.daysOfCover,
        onHand: s.onHand,
        perDay: s.averageDailySales,
        leadTime: s.leadTimeDays,
      },
      evidence: [
        { label: 'evidence.onHand', value: s.onHand },
        { label: 'evidence.dailyDemand', value: s.averageDailySales },
        { label: 'evidence.coverage', value: s.daysOfCover },
        { label: 'evidence.leadTime', value: s.leadTimeDays },
      ],
      href: '/zalihe',
    }

    if (s.daysOfCover <= rules.stockCriticalDays) {
      items.push({ kind: 'stock_critical', severity: 'critical', ...base })
      continue
    }

    /*
     * Zaliha koja se troši pre nego što stigne isporuka je kritična i kada je
     * pokrivenost iznad praga. Ovo je razlika između „malo je ostalo" i „neće
     * stići na vreme" — druga je jedina koja se ne može popraviti kasnije.
     */
    if (s.daysOfCover < s.leadTimeDays) {
      items.push({ kind: 'stock_critical', severity: 'critical', ...base })
      continue
    }

    if (s.daysOfCover <= rules.stockWarningDays) {
      items.push({ kind: 'stock_low', severity: 'warning', ...base })
      continue
    }

    if (s.daysOfCover >= rules.stockOverstockDays) {
      // Prekomerna zaliha je zarobljen novac, ne hitnost — otud `info`.
      items.push({ kind: 'stock_overstock', severity: 'info', ...base })
    }
  }

  return items
}

function payableItems(input: AttentionInput): AttentionItem[] {
  const { payables, rules } = input
  if (!payables) return []

  const soon = payables.filter((p) => p.daysUntilDue <= rules.payableHorizonDays)
  if (soon.length === 0) return []

  const overdue = soon.filter((p) => p.daysUntilDue < 0)

  const items: AttentionItem[] = []

  if (overdue.length > 0) {
    const overdueAmount = overdue.reduce((sum, p) => sum + num(p.amount), 0)
    items.push({
      kind: 'payables_due',
      severity: 'critical',
      params: {
        amount: overdueAmount,
        currency: overdue[0]!.currency,
        count: overdue.length,
        days: 0,
      },
      evidence: [
        { label: 'evidence.amount', value: overdueAmount },
        { label: 'evidence.count', value: overdue.length },
      ],
      href: '/obaveze',
    })
  }

  const upcoming = soon.filter((p) => p.daysUntilDue >= 0)
  if (upcoming.length > 0) {
    const upcomingAmount = upcoming.reduce((sum, p) => sum + num(p.amount), 0)
    const severity: AttentionSeverity =
      upcomingAmount >= rules.largePayableAmount ? 'warning' : 'info'

    items.push({
      kind: 'payables_due',
      severity,
      params: {
        amount: upcomingAmount,
        currency: upcoming[0]!.currency,
        count: upcoming.length,
        days: rules.payableHorizonDays,
      },
      evidence: [
        { label: 'evidence.amount', value: upcomingAmount },
        { label: 'evidence.count', value: upcoming.length },
        { label: 'evidence.horizon', value: rules.payableHorizonDays },
      ],
      href: '/obaveze',
    })
  }

  return items
}

function salesItems(input: AttentionInput): AttentionItem[] {
  const { sales, rules } = input
  if (!sales) return []

  const items: AttentionItem[] = []

  for (const [period, data] of [
    ['month', sales.monthToDate],
    ['week', sales.last7Days],
  ] as const) {
    if (data.changePercent <= rules.salesDropPercent) {
      items.push({
        kind: 'sales_drop',
        severity: data.changePercent <= rules.salesDropPercent * 2 ? 'critical' : 'warning',
        params: {
          period,
          percent: data.changePercent,
          amount: num(data.total),
          currency: sales.currency,
        },
        evidence: [
          { label: 'evidence.change', value: data.changePercent },
          { label: 'evidence.threshold', value: rules.salesDropPercent },
        ],
        href: '/pitanja',
      })
    }
  }

  return items
}

/**
 * Rangiran spisak onoga što traži pažnju.
 *
 * Redosled je po TEŽINI, ne po redosledu pravila. Kritično uvek stoji iznad
 * upozorenja, jer se spisak čita odozgo i često samo odozgo.
 *
 * Prazan spisak je ispravan ishod i prikazuje se kao takav. „Ništa ne traži
 * pažnju" je vest, ne odsustvo vesti.
 */
export function whatNeedsAttention(input: AttentionInput): readonly AttentionItem[] {
  return [
    ...receivablesItems(input),
    ...debtorItems(input),
    ...stockItems(input),
    ...payableItems(input),
    ...salesItems(input),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
