import type { AttentionItem, AttentionKind } from '../brief/attention'
import type { IntentKey } from './question-matcher'

/**
 * Predlozi pitanja.
 *
 * Ovo je ono što rukovodilac ionako namerava da pita, ponuđeno pre nego što
 * počne da kuca. Prazno polje za unos traži da čovek sam smisli pitanje, a
 * najveći deo vrednosti je u pitanjima kojih se ne bi setio.
 *
 * Predlozi se IZVODE IZ PODATAKA, ne iz modela. Kada potraživanja pređu prag,
 * prvo pitanje je ko najviše duguje — to se zna bez ijednog poziva ka modelu,
 * pa su predlozi trenutni, besplatni i uvek tačni.
 *
 * Čista funkcija: bez baze, bez mreže, bez sistemskog sata.
 */

export interface Suggestion {
  /** Stabilna oznaka, za prevod i za merenje šta se stvarno koristi. */
  readonly key: string
  readonly intent: IntentKey
  /** Da li predlog dolazi iz nečega što trenutno traži pažnju. */
  readonly grounded: boolean
  readonly params: Readonly<Record<string, string | number>>
}

/**
 * Šta koja stavka pažnje pokreće kao pitanje.
 *
 * Jedna stavka → jedno pitanje. Tri dospela računa ne daju tri predloga nego
 * jedan: spisak od deset predloga je meni, a meni se ne čita nego preskače.
 */
const QUESTION_FOR: Record<AttentionKind, { key: string; intent: IntentKey }> = {
  receivables_overdue: { key: 'overdueDebtors', intent: 'get_top_debtors' },
  receivables_large: { key: 'largestDebtor', intent: 'get_top_debtors' },
  stock_critical: { key: 'stockRunningOut', intent: 'get_inventory_alerts' },
  stock_low: { key: 'stockRunningOut', intent: 'get_inventory_alerts' },
  stock_overstock: { key: 'stockSitting', intent: 'get_stock_status' },
  payables_due: { key: 'payablesDue', intent: 'get_payables' },
  sales_drop: { key: 'salesDrop', intent: 'get_sales_by_period' },
}

/**
 * Pitanja koja se nude kada ništa ne gori.
 *
 * Redosled je namerno ovakav: prodaja pa naplata pa zalihe. To je redosled
 * kojim rukovodilac i inače gleda, kada ga ništa ne prekine.
 */
const ROUTINE: readonly { key: string; intent: IntentKey }[] = [
  { key: 'salesYesterday', intent: 'get_daily_sales' },
  { key: 'salesMonth', intent: 'get_sales_by_period' },
  { key: 'whoOwesUs', intent: 'get_top_debtors' },
  { key: 'financialSummary', intent: 'get_financial_summary' },
  { key: 'stockRisk', intent: 'get_inventory_alerts' },
  { key: 'payablesWeek', intent: 'get_payables' },
]

/** Koliko predloga staje pre nego što prestanu da budu predlozi. */
const LIMIT = 4

export interface SuggestInput {
  readonly attention: readonly AttentionItem[]
  /** Namere na koje se STVARNO može odgovoriti — prava i uključene sposobnosti. */
  readonly answerable: readonly IntentKey[]
  readonly limit?: number
}

export function suggestQuestions(input: SuggestInput): readonly Suggestion[] {
  const limit = input.limit ?? LIMIT
  const answerable = new Set(input.answerable)
  const out: Suggestion[] = []
  const used = new Set<string>()

  const add = (
    key: string,
    intent: IntentKey,
    grounded: boolean,
    params: Readonly<Record<string, string | number>> = {},
  ): void => {
    /*
     * Predlog na koji se ne može odgovoriti se NE nudi.
     *
     * Ponuđeno pitanje je obećanje. Kada se na njega dobije „ne mogu da
     * odgovorim", korisnik ne zaključi da nema prava nego da alat ne radi — i
     * prestane da proba i ono što radi.
     */
    if (!answerable.has(intent)) return
    if (used.has(key) || out.length >= limit) return

    used.add(key)
    out.push({ key, intent, grounded, params })
  }

  // Stavke koje traže pažnju idu PRVE: to je pitanje koje rukovodilac ionako
  // ima, a redosled ozbiljnosti je već odlučen u motoru pažnje.
  for (const item of input.attention) {
    const mapped = QUESTION_FOR[item.kind]
    if (mapped) add(mapped.key, mapped.intent, true, item.params)
  }

  for (const routine of ROUTINE) add(routine.key, routine.intent, false)

  return out
}
