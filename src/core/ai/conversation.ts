import type { IntentKey } from './question-matcher'

/**
 * Vođenje razgovora sa modelom koji poziva imenovane alate.
 *
 * Model NE piše upite nad bazom klijenta. On bira između imenovanih sposobnosti
 * koje su već uključene i već dozvoljene ovom korisniku — isti spisak koji hrani
 * i tablu i brif. Zbog toga razgovor ne može da dobije podatak koji kartica ne
 * bi smela da prikaže.
 *
 * Granice se drže u OVOJ petlji, ne u sistemskom promptu. Prompt je molba;
 * petlja je pravilo. Model koji zatraži alat van spiska biva odbijen ovde, bez
 * obzira na to šta prompt kaže i šta je model „razumeo".
 *
 * Modul je čist: model i izvršavanje alata stižu kao portovi, pa se ponašanje
 * — uključujući pokušaj zabranjenog poziva — proverava testom sa lažnim
 * modelom, bez ijednog poziva ka pravom.
 */

export interface TokenUsage {
  readonly input: number
  readonly output: number
}

export interface ToolDefinition {
  readonly name: IntentKey
  readonly description: string
  /** JSON shema ulaza, onako kako je model očekuje. */
  readonly parameters: Readonly<Record<string, unknown>>
}

/** Poziv alata onako kako ga model traži — naziv je NEPROVEREN niz znakova. */
export interface ModelToolCall {
  readonly id: string
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
}

export type ModelReply =
  | { readonly kind: 'text'; readonly text: string; readonly usage?: TokenUsage }
  | { readonly kind: 'tools'; readonly calls: readonly ModelToolCall[]; readonly usage?: TokenUsage }

export type Turn =
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string }
  | {
      readonly role: 'tool'
      readonly callId: string
      readonly name: string
      readonly content: string
    }
  | { readonly role: 'assistant_tools'; readonly calls: readonly ModelToolCall[] }

export interface ChatPort {
  reply(input: {
    readonly system: string
    readonly turns: readonly Turn[]
    readonly tools: readonly ToolDefinition[]
  }): Promise<ModelReply>
}

export type ToolOutcome =
  | { readonly ok: true; readonly data: unknown; readonly dataAsOf?: string | null }
  | { readonly ok: false; readonly reason: string }

export type ToolRunner = (call: {
  readonly name: IntentKey
  readonly args: Readonly<Record<string, unknown>>
}) => Promise<ToolOutcome>

export interface ConversationStep {
  readonly name: string
  readonly args: Readonly<Record<string, unknown>>
  readonly ok: boolean
  readonly reason?: string
  readonly dataAsOf?: string | null
  /** Da li je poziv odbijen zato što alat nije na spisku dozvoljenih. */
  readonly refused?: boolean
}

export type ConversationEnd = 'answered' | 'step_limit' | 'empty' | 'model_failed'

export interface ConversationResult {
  readonly end: ConversationEnd
  readonly text: string
  readonly steps: readonly ConversationStep[]
  readonly usage: TokenUsage
}

/**
 * Najviše koraka po pitanju.
 *
 * Ograničenje nije zbog cene nego zbog toga što petlja bez izlaza postoji.
 * Model koji dobije rezultat koji ne razume ume da isti alat pozove ponovo, pa
 * ponovo — bez granice, jedno pitanje pojede minut i pola dnevnog budžeta.
 */
const MAX_STEPS = 6

/** Koliko alata sme u jednom koraku; više je skoro uvek zabuna modela. */
const MAX_CALLS_PER_STEP = 4

export interface ConverseInput {
  readonly port: ChatPort
  readonly system: string
  /** Prethodni tok razgovora, bez novog pitanja. */
  readonly history: readonly Turn[]
  readonly question: string
  readonly tools: readonly ToolDefinition[]
  readonly run: ToolRunner
  readonly maxSteps?: number
}

export async function converse(input: ConverseInput): Promise<ConversationResult> {
  const allowed = new Map(input.tools.map((t) => [t.name as string, t]))
  const maxSteps = input.maxSteps ?? MAX_STEPS

  const turns: Turn[] = [...input.history, { role: 'user', content: input.question }]
  const steps: ConversationStep[] = []
  const usage = { input: 0, output: 0 }

  for (let step = 0; step < maxSteps; step += 1) {
    let reply: ModelReply
    try {
      reply = await input.port.reply({
        system: input.system,
        turns,
        tools: input.tools,
      })
    } catch {
      // Kvar modela nije kvar podatka. Vraća se kao poseban ishod da bi UI mogao
      // da kaže „pokušajte ponovo" umesto da tvrdi da odgovora nema.
      return { end: 'model_failed', text: '', steps, usage }
    }

    if (reply.usage) {
      usage.input += reply.usage.input
      usage.output += reply.usage.output
    }

    if (reply.kind === 'text') {
      const text = reply.text.trim()
      return { end: text === '' ? 'empty' : 'answered', text, steps, usage }
    }

    if (reply.calls.length === 0) return { end: 'empty', text: '', steps, usage }

    turns.push({ role: 'assistant_tools', calls: reply.calls })

    for (const call of reply.calls.slice(0, MAX_CALLS_PER_STEP)) {
      const definition = allowed.get(call.name)

      /*
       * Alat van spiska se ODBIJA i odbijanje se vraća modelu kao rezultat.
       *
       * Ne baca se izuzetak i ne prekida razgovor: model koji je promašio naziv
       * najčešće ume da se ispravi kada mu se kaže. Ali izvršavanja nema, pa
       * izmišljen naziv alata ne može da dođe do podataka — bez obzira na to
       * koliko uverljivo zvuči.
       */
      if (!definition) {
        steps.push({ name: call.name, args: call.args, ok: false, refused: true })
        turns.push({
          role: 'tool',
          callId: call.id,
          name: call.name,
          content: JSON.stringify({ error: 'unknown_tool', allowed: [...allowed.keys()] }),
        })
        continue
      }

      const outcome = await input.run({ name: definition.name, args: call.args })

      steps.push(
        outcome.ok
          ? {
              name: call.name,
              args: call.args,
              ok: true,
              ...(outcome.dataAsOf !== undefined ? { dataAsOf: outcome.dataAsOf } : {}),
            }
          : { name: call.name, args: call.args, ok: false, reason: outcome.reason },
      )

      turns.push({
        role: 'tool',
        callId: call.id,
        name: call.name,
        content: outcome.ok
          ? JSON.stringify(outcome.data)
          : JSON.stringify({ error: outcome.reason }),
      })
    }
  }

  /*
   * Iscrpljeni koraci NISU odgovor.
   *
   * Vraćanje poslednjeg teksta koji je model stigao da napiše davalo bi
   * nedovršen zaključak koji izgleda kao gotov. Bolje je reći da odgovor nije
   * sastavljen nego ponuditi pola njega.
   */
  return { end: 'step_limit', text: '', steps, usage }
}
