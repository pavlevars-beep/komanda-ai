import type { Permission } from '../auth/permissions'

/**
 * Prepoznavanje pitanja bez jezičkog modela.
 *
 * Pitanje se preslikava na IMENOVANU SPOSOBNOST konektora, nikad na upit koji
 * je neko sastavio u trenutku. To je isto pravilo koje važi i kada model bude
 * uključen: model sme da BIRA između ponuđenih sposobnosti, ne da piše upit.
 * Zato ovaj modul i postoji odvojeno — kada dođe model, menja se samo ko
 * bira, a sve posle izbora (permisija, validacija, poreklo) ostaje isto.
 *
 * Dva pravila koja oblikuju ceo modul:
 *
 * 1. Kada pitanje nije prepoznato, odgovor je „ne znam" i spisak onoga što
 *    ume — nikad najbliži pogodak. Alat koji na nejasno pitanje odgovori
 *    pogrešnim brojem gori je od alata koji ćuti, jer se broj prepisuje dalje.
 *
 * 2. Prag se ne spušta kada ništa ne prolazi. Dva izjednačena tumačenja se
 *    prijavljuju kao dvosmislenost i traži se preciznije pitanje.
 */

export type IntentKey =
  | 'get_financial_summary'
  | 'get_daily_sales'
  | 'get_sales_by_period'
  | 'get_outstanding_invoices'
  | 'get_top_debtors'
  | 'get_payables'
  | 'get_headcount'
  | 'get_inventory_alerts'

/** Vremenski opseg koji je pitanje pomenulo. Period popunjava server, ne pitanje. */
export type PeriodHint = 'today' | 'yesterday' | 'week' | 'month' | 'previousMonth'

interface Intent {
  readonly key: IntentKey
  readonly permission: Permission
  /**
   * Reči koje same po sebi ukazuju na ovu sposobnost. Bar jedna mora da se
   * pojavi da bi se sposobnost uopšte razmatrala.
   */
  readonly anchors: readonly string[]
  /** Reči koje pojačavaju već pronađen trag, ali same ne znače ništa. */
  readonly support?: readonly string[]
  /**
   * Reči koje isključuju sposobnost i kada je sidro pronađeno. Postoje zbog
   * parova koji dele rečnik: „koliko dugujemo" i „ko nama duguje" imaju isti
   * glagol a suprotno značenje, i zamena bi bila ozbiljna greška.
   */
  readonly veto?: readonly string[]
}

/*
 * Rečnik je latinica bez dijakritika — ulaz se svodi na isti oblik, pa
 * „potraživanja", „potrazivanja" i „ПОТРАЖИВАЊА" pogađaju isti unos.
 */
const INTENTS: readonly Intent[] = [
  {
    key: 'get_financial_summary',
    permission: 'view_financial_data',
    anchors: [
      'prihod', 'rashod', 'dobit', 'profit', 'marza', 'poslovanje', 'bilans',
      'revenue', 'expense', 'expenses', 'margin', 'income', 'p&l',
    ],
    support: ['ukupno', 'koliko', 'total', 'how much'],
  },
  {
    key: 'get_daily_sales',
    permission: 'view_sales',
    anchors: ['prodaja', 'promet', 'prodali', 'sales', 'turnover', 'sold'],
    support: ['danas', 'juce', 'today', 'yesterday'],
    // „prodaja ovog meseca" pripada periodu, ne danu.
    veto: ['nedelj', 'mesec', 'kvartal', 'godin', 'week', 'month', 'quarter', 'year', 'period'],
  },
  {
    key: 'get_sales_by_period',
    permission: 'view_sales',
    anchors: ['prodaja', 'promet', 'prodali', 'sales', 'turnover', 'sold'],
    support: ['nedelj', 'mesec', 'kvartal', 'period', 'week', 'month', 'quarter', 'trend'],
  },
  {
    key: 'get_outstanding_invoices',
    permission: 'view_financial_data',
    anchors: [
      'faktur', 'racun', 'potrazivanj', 'nenaplacen', 'dospel',
      'invoice', 'receivable', 'unpaid', 'outstanding',
    ],
    // Pitanje o dužnicima ide na listu dužnika, ne na listu faktura.
    veto: ['duznik', 'ko duguje', 'ko nam duguje', 'debtor', 'who owes'],
  },
  {
    key: 'get_top_debtors',
    permission: 'view_financial_data',
    anchors: ['duznik', 'duznic', 'duguje', 'debtor', 'owes'],
    support: ['najveci', 'top', 'largest', 'biggest', 'ko ', 'who '],
    /*
     * „dugujemo" sadrži „duguje" kao početak reči, pa bi bez ovoga pitanje o
     * SOPSTVENIM obavezama završilo na listi tuđih dugova. To je zamena koja
     * klijentu pokazuje tuđi dug kao svoju obavezu.
     */
    veto: ['dugujemo', 'we owe', 'dobavljac', 'supplier'],
  },
  {
    key: 'get_payables',
    permission: 'view_financial_data',
    anchors: [
      'obavez', 'dobavljac', 'dugujemo',
      'payable', 'supplier', 'vendor', 'we owe',
    ],
    support: ['dospeva', 'rok', 'due', 'deadline'],
  },
  {
    key: 'get_headcount',
    permission: 'view_customers',
    anchors: [
      'zaposlen', 'radnik', 'radnika', 'ljudi', 'kadar', 'odeljenj',
      'employee', 'headcount', 'staff', 'department',
    ],
    support: ['koliko', 'broj', 'how many', 'number'],
  },
  {
    key: 'get_inventory_alerts',
    permission: 'view_inventory',
    anchors: [
      'zalih', 'magacin', 'skladist', 'artikal', 'artikl', 'stanje robe',
      'inventory', 'stock', 'warehouse', 'item',
    ],
    support: ['nedostaje', 'minimum', 'kriticno', 'low', 'below', 'alert'],
  },
]

const PERIOD_WORDS: readonly (readonly [PeriodHint, readonly string[]])[] = [
  ['yesterday', ['juce', 'yesterday']],
  ['previousMonth', ['prosli mesec', 'proslog meseca', 'prethodni mesec', 'last month', 'previous month']],
  ['month', ['mesec', 'mesecu', 'meseca', '30 dana', 'month', '30 days']],
  ['week', ['nedelj', 'sedmic', '7 dana', 'week', '7 days']],
  ['today', ['danas', 'today']],
]

const CYRILLIC: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
}

/**
 * Svođenje ulaza na oblik u kojem se poredi.
 *
 * Ćirilica se preslovljava, dijakritici se skidaju. Bez toga bi isti korisnik
 * dobio odgovor ili „ne razumem" u zavisnosti od rasporeda tastature.
 */
export function normalizeQuestion(input: string): string {
  const lowered = input.toLowerCase()
  const latin = [...lowered].map((ch) => CYRILLIC[ch] ?? ch).join('')

  return latin
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'dj')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectPeriod(normalized: string): PeriodHint | undefined {
  for (const [hint, words] of PERIOD_WORDS) {
    if (words.some((w) => normalized.includes(w))) return hint
  }
  return undefined
}

export type MatchOutcome =
  | { readonly kind: 'matched'; readonly intent: IntentKey; readonly period?: PeriodHint }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly IntentKey[] }
  | { readonly kind: 'unmatched' }
  | { readonly kind: 'no_permission'; readonly intent: IntentKey; readonly permission: Permission }

function score(intent: Intent, normalized: string): number {
  if (intent.veto?.some((w) => normalized.includes(w))) return 0

  const anchors = intent.anchors.filter((w) => normalized.includes(w)).length
  if (anchors === 0) return 0

  const support = (intent.support ?? []).filter((w) => normalized.includes(w)).length
  // Sidro nosi težinu; potpora samo razdvaja izjednačene kandidate.
  return anchors * 10 + support
}

/**
 * Koje sposobnosti korisnik sme da pita, među onima koje su i uključene.
 *
 * Prolazi kroz oba filtera jer su različiti: permisija je pravo korisnika,
 * uključenost je odluka konsultanta. Pitanje koje prolazi jedan a pada na
 * drugom ne sme da se ponudi kao predlog.
 */
export function answerableIntents(
  permissions: readonly Permission[],
  enabledCapabilities: readonly string[],
): readonly IntentKey[] {
  return INTENTS.filter(
    (i) => permissions.includes(i.permission) && enabledCapabilities.includes(i.key),
  ).map((i) => i.key)
}

export function intentPermission(key: IntentKey): Permission {
  const intent = INTENTS.find((i) => i.key === key)
  if (!intent) throw new Error(`Nepoznata namera: ${key}`)
  return intent.permission
}

/**
 * Pitanje → sposobnost.
 *
 * `enabledCapabilities` sužava izbor na ono što je stvarno uključeno za ovu
 * organizaciju. Bez tog sužavanja bi se pitanje prepoznalo, pa tek runner
 * odbio poziv — a korisnik bi dobio grešku umesto rečenice „to još nije
 * povezano".
 */
export function matchQuestion(
  question: string,
  permissions: readonly Permission[],
  enabledCapabilities: readonly string[],
): MatchOutcome {
  const normalized = normalizeQuestion(question)
  if (normalized.length < 2) return { kind: 'unmatched' }

  const scored = INTENTS.map((intent) => ({ intent, value: score(intent, normalized) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  if (scored.length === 0) return { kind: 'unmatched' }

  const best = scored[0]!
  const tied = scored.filter((s) => s.value === best.value)

  if (tied.length > 1) {
    return { kind: 'ambiguous', candidates: tied.map((s) => s.intent.key) }
  }

  /*
   * Kada najbolje tumačenje nije uključeno, odgovora NEMA — ne prelazi se na
   * sledeće po oceni.
   *
   * Prelazak je zvučao uslužno dok test nije pokazao šta znači: „prodaja ove
   * nedelje" bi, ako je periodična prodaja isključena a dnevna nije, dobila
   * DANAŠNJI broj kao odgovor na pitanje o nedelji. Broj bi bio tačan, a
   * odgovor pogrešan — i ništa na ekranu to ne bi odalo.
   */
  if (!enabledCapabilities.includes(best.intent.key)) return { kind: 'unmatched' }

  return decide(best.intent, normalized, permissions)
}

function decide(
  intent: Intent,
  normalized: string,
  permissions: readonly Permission[],
): MatchOutcome {
  if (!permissions.includes(intent.permission)) {
    return { kind: 'no_permission', intent: intent.key, permission: intent.permission }
  }

  const period = detectPeriod(normalized)
  return period ? { kind: 'matched', intent: intent.key, period } : { kind: 'matched', intent: intent.key }
}
