/**
 * Primena poslovnih kontekstnih događaja na istorijsko poređenje.
 *
 * Ovo je razlika između sistema koji zna ŠTA SE DOGODILO i sistema koji zna i
 * ŠTA JE FIRMA OZNAČILA KAO IZUZETNO.
 *
 * Konkretan slučaj: firma je imala veliki jednokratni projekat u martu i
 * aprilu 2025. Bez konteksta, mart 2026. prijavljuje pad od 40% — a nikakvog
 * pada nema; poređenje ide sa nečim što se ne ponavlja. Rukovodilac koji na
 * to reaguje rešava problem koji ne postoji.
 *
 * Dva pravila koja ceo modul drže poštenim:
 *
 * 1. Izvorni broj se NIKAD ne menja. Prikazuje se i on i osnovica, jedno pored
 *    drugog. Ispravljena istorija je istorija koju niko ne može da proveri.
 *
 * 2. Isključenje iz osnovice se UVEK vidi. Poređenje sa tiho izmenjenom
 *    osnovicom je gore od poređenja bez konteksta, jer izgleda isto a nije.
 */

export interface ContextEvent {
  readonly id: string
  readonly kind: string
  readonly title: string
  /** ISO datum, uključujući. */
  readonly startsOn: string
  /** ISO datum, uključujući. `null` znači da još traje. */
  readonly endsOn: string | null
  /** Procenjeni uticaj na prihod; predznak nosi smer. */
  readonly revenueImpact: number | null
  readonly excludeFromBaseline: boolean
  readonly keepInTotals: boolean
  readonly excludeFromForecast: boolean
  readonly annotateComparison: boolean
}

export interface MonthValue {
  /** `YYYY-MM`. */
  readonly month: string
  readonly total: string
}

export interface AnnotatedMonth {
  readonly month: string
  /** Vrednost iz izvora, nepromenjena. */
  readonly total: number
  /**
   * Vrednost za poređenje. Jednaka izvornoj kada nijedan događaj ne dira ovaj
   * mesec, ili kada procena uticaja nije uneta.
   */
  readonly baseline: number
  /** Događaji koji se preklapaju sa ovim mesecom. */
  readonly events: readonly ContextEvent[]
  /** Da li se osnovica razlikuje od izvorne vrednosti. */
  readonly adjusted: boolean
}

/** Poslednji dan meseca `YYYY-MM`, kao ISO datum. */
function monthBounds(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number)
  // Dan 0 sledećeg meseca je poslednji dan ovog — tako se prestupna godina
  // rešava sama, bez posebnog slučaja za februar.
  const last = new Date(Date.UTC(year ?? 0, m ?? 1, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

/** Da li se događaj preklapa sa mesecom. Otvoren kraj traje do danas. */
export function overlapsMonth(event: ContextEvent, month: string): boolean {
  const { from, to } = monthBounds(month)
  const end = event.endsOn ?? '9999-12-31'
  return event.startsOn <= to && end >= from
}

/**
 * Koliko meseci događaj pokriva.
 *
 * Uticaj se ravnomerno raspoređuje po mesecima trajanja. To je gruba
 * pretpostavka i takva je i označena — ali je jedina koja se može izvesti bez
 * podataka o rasporedu unutar perioda. Alternativa, da se ceo uticaj oduzme
 * od prvog meseca, napravila bi rupu u jednom mesecu i nedirnute ostale, što
 * je vidljivo pogrešno.
 */
function monthsSpanned(event: ContextEvent, months: readonly string[]): number {
  return months.filter((m) => overlapsMonth(event, m)).length
}

/**
 * Meseci sa osnovicom i napomenama.
 *
 * `events` se filtrira po tome da li se preklapaju sa mesecom; `revenueImpact`
 * se raspoređuje po mesecima koje događaj pokriva UNUTAR posmatranog niza.
 * Deo perioda van niza se ne oduzima — inače bi mesec na ivici dobio uticaj
 * koji mu ne pripada.
 */
export function annotateMonths(
  months: readonly MonthValue[],
  events: readonly ContextEvent[],
): readonly AnnotatedMonth[] {
  const keys = months.map((m) => m.month)

  return months.map((m) => {
    const overlapping = events.filter((e) => overlapsMonth(e, m.month))
    const total = Number(m.total)

    let baseline = total
    for (const event of overlapping) {
      if (!event.excludeFromBaseline || event.revenueImpact === null) continue
      const span = monthsSpanned(event, keys)
      if (span === 0) continue
      baseline -= event.revenueImpact / span
    }

    return {
      month: m.month,
      total: Number.isFinite(total) ? total : 0,
      // Osnovica ne sme da padne ispod nule: procena uticaja veća od stvarnog
      // prihoda je greška u unosu, a negativna osnovica bi dala besmislen
      // procenat promene umesto vidljive greške.
      baseline: Math.max(0, Number.isFinite(baseline) ? baseline : total),
      events: overlapping,
      adjusted: Math.round(baseline) !== Math.round(total),
    }
  })
}

export interface Comparison {
  readonly current: AnnotatedMonth
  readonly previous: AnnotatedMonth | undefined
  /** Promena po izvornim vrednostima. */
  readonly rawChangePercent: number | undefined
  /** Promena po osnovici, kada se razlikuje od izvorne. */
  readonly adjustedChangePercent: number | undefined
  /**
   * Da li poređenje traži napomenu — jedan od dva meseca nosi događaj koji je
   * označen za napomenu.
   */
  readonly needsNote: boolean
}

function percent(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/**
 * Poređenje meseca sa istim mesecom prethodne godine.
 *
 * Vraća OBA procenta kada se razlikuju. Prikazivanje samo prilagođenog krije
 * od korisnika da je poređenje dirano; prikazivanje samo izvornog vraća nas na
 * lažni pad. Oba, jedno pored drugog, jedina su verzija koja se može
 * proveriti.
 */
export function compareYearOverYear(
  annotated: readonly AnnotatedMonth[],
  month: string,
): Comparison | null {
  const current = annotated.find((m) => m.month === month)
  if (!current) return null

  const [year, m] = month.split('-')
  const previousMonth = `${Number(year) - 1}-${m}`
  const previous = annotated.find((x) => x.month === previousMonth)

  const raw = previous ? percent(current.total, previous.total) : undefined
  const adjusted = previous ? percent(current.baseline, previous.baseline) : undefined

  return {
    current,
    previous,
    rawChangePercent: raw,
    adjustedChangePercent: adjusted !== raw ? adjusted : undefined,
    needsNote: [current, previous]
      .filter((x): x is AnnotatedMonth => x !== undefined)
      .some((x) => x.events.some((e) => e.annotateComparison)),
  }
}

/**
 * Meseci koji se ne smeju koristiti kao osnova za prognozu.
 *
 * Izdvojeno od osnovice namerno: firma može da želi da izuzetan mesec ostane u
 * poređenju (da se vidi šta se dogodilo) a da ne uđe u predviđanje sledećeg
 * decembra. To su dve različite odluke i tako se i unose.
 */
export function forecastExclusions(
  annotated: readonly AnnotatedMonth[],
): readonly string[] {
  return annotated
    .filter((m) => m.events.some((e) => e.excludeFromForecast))
    .map((m) => m.month)
}
