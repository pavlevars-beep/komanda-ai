import type { DatasetKind } from './mapping'
import type { CadenceState, CadenceVerdict } from './cadence'
import { localParts } from './zone'

/**
 * Tekst upozorenja o tišini.
 *
 * Čista funkcija, bez baze i bez sistemskog sata — poruka koja stiže rukovodiocu
 * u 08:31 mora da se proveri testom, a ne čekanjem da se taj trenutak desi.
 *
 * Poruka odgovara na tri pitanja, tim redom: ŠTA nije stiglo, OD KADA, i ŠTA
 * SADA. Upozorenje bez trećeg dela je samo loša vest.
 */

/*
 * Vrsta podatka stoji kao OZNAKA ispred dvotačke, a rečenica ima stalni subjekat
 * („podatak"). Rečenica oblika „{vrsta} nije stigla" se slaže samo sa „Prodaja":
 * „Zalihe nije stigla" i „Potraživanja nije stigla" su obe pogrešne. Rod i broj
 * se ne mogu složiti kroz šablon, pa se subjekat ne menja.
 */
const KIND_LABEL: Record<DatasetKind, { sr: string; en: string }> = {
  sales: { sr: 'Prodaja', en: 'Sales' },
  receivables: { sr: 'Potraživanja', en: 'Receivables' },
  payables: { sr: 'Obaveze', en: 'Payables' },
  stock: { sr: 'Zalihe', en: 'Stock' },
}

const WEEKDAY: Record<number, { sr: string; en: string }> = {
  1: { sr: 'ponedeljkom', en: 'Monday' },
  2: { sr: 'utorkom', en: 'Tuesday' },
  3: { sr: 'sredom', en: 'Wednesday' },
  4: { sr: 'četvrtkom', en: 'Thursday' },
  5: { sr: 'petkom', en: 'Friday' },
  6: { sr: 'subotom', en: 'Saturday' },
  7: { sr: 'nedeljom', en: 'Sunday' },
}

const WORKWEEK = [1, 2, 3, 4, 5]

/** Datum i vreme na klijentovom satu — ne na satu servera koji je proveravao. */
export function formatLocal(iso: string, timeZone: string): string {
  const p = localParts(new Date(iso).getTime(), timeZone)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(p.day)}.${pad(p.month)}.${p.year}. u ${pad(p.hour)}:${pad(p.minute)}`
}

function describeDays(weekdays: readonly number[]): { sr: string; en: string } {
  const sorted = [...weekdays].sort((a, b) => a - b)

  if (sorted.length === 7) return { sr: 'svakog dana', en: 'every day' }
  if (
    sorted.length === WORKWEEK.length &&
    sorted.every((d, i) => d === WORKWEEK[i])
  ) {
    return { sr: 'radnim danima', en: 'on working days' }
  }

  const named = sorted.map((d) => WEEKDAY[d]).filter((v): v is { sr: string; en: string } => !!v)
  return {
    sr: named.map((v) => v.sr).join(', '),
    en: named.map((v) => v.en).join(', '),
  }
}

export interface SilenceMessageInput {
  readonly kind: DatasetKind
  readonly state: CadenceState
  readonly verdict: CadenceVerdict
  readonly weekdays: readonly number[]
  readonly byTime: string
  readonly timeZone: string
  /** Naziv integracije, kada klijent ima više izvora iste vrste. */
  readonly sourceName?: string | null
}

export interface SilenceMessage {
  readonly severity: 'warning' | 'critical'
  readonly title: { sr: string; en: string }
  readonly body: { sr: string; en: string }
}

export function silenceMessage(input: SilenceMessageInput): SilenceMessage | null {
  const { state, verdict } = input
  if (state !== 'late' && state !== 'missing' && state !== 'never') return null

  const kind = KIND_LABEL[input.kind]
  const days = describeDays(input.weekdays)
  const source = input.sourceName ? ` (${input.sourceName})` : ''
  const zone = input.timeZone

  const expected = {
    sr: `Očekuje se ${days.sr} do ${input.byTime}.`,
    en: `Expected ${days.en} by ${input.byTime}.`,
  }

  const lastArrival = verdict.lastArrivalAt
    ? {
        sr: `Poslednji uvoz: ${formatLocal(verdict.lastArrivalAt, zone)}.`,
        en: `Last import: ${formatLocal(verdict.lastArrivalAt, zone)}.`,
      }
    : null

  if (state === 'never') {
    return {
      severity: 'critical',
      title: {
        sr: `${kind.sr}${source}: podatak nije stigao nijednom`,
        en: `${kind.en}${source}: no data has ever arrived`,
      },
      body: {
        sr: `${expected.sr} Od dogovora nijedan uvoz nije stigao — dotok najverovatnije nije ni uspostavljen. Proveriti sa klijentom ko šalje tabelu i kojim putem.`,
        en: `${expected.en} No import has arrived since the schedule was agreed — the flow is most likely not set up. Check with the client who sends the file and how.`,
      },
    }
  }

  const since = verdict.silentSince ? formatLocal(verdict.silentSince, zone) : ''

  if (state === 'late') {
    return {
      severity: 'warning',
      title: {
        sr: `${kind.sr}${source}: podatak nije stigao za ${since}`,
        en: `${kind.en}${source}: no data arrived for ${since}`,
      },
      body: {
        sr: `${expected.sr}${lastArrival ? ` ${lastArrival.sr}` : ''} Brojevi na tabli su i dalje od prethodnog uvoza. Proveriti da li je izvoz pokrenut.`,
        en: `${expected.en}${lastArrival ? ` ${lastArrival.en}` : ''} Dashboard figures are still from the previous import. Check whether the export ran.`,
      },
    }
  }

  return {
    severity: 'critical',
    title: {
      sr: `${kind.sr}${source}: podatak ne stiže od ${since}`,
      en: `${kind.en}${source}: no data since ${since}`,
    },
    body: {
      sr: `${expected.sr} Propušteno uzastopnih rokova: ${verdict.missedPeriods}.${lastArrival ? ` ${lastArrival.sr}` : ''} Brojevi na tabli su zastareli i ne smeju se koristiti za odluke dok se dotok ne uspostavi.`,
      en: `${expected.en} Consecutive missed deadlines: ${verdict.missedPeriods}.${lastArrival ? ` ${lastArrival.en}` : ''} Dashboard figures are stale and must not be used for decisions until the flow is restored.`,
    },
  }
}

/** Isto upozorenje se ne otvara dvaput — ključ je izvor i vrsta podatka. */
export function silenceDedupeKey(integrationId: string, kind: DatasetKind): string {
  return `import-silence:${integrationId}:${kind}`
}
