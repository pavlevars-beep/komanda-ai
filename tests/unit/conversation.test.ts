import { describe, expect, it, vi } from 'vitest'
import {
  converse,
  type ChatPort,
  type ModelReply,
  type ToolDefinition,
  type ToolOutcome,
} from '@/core/ai/conversation'

const ALATI: ToolDefinition[] = [
  { name: 'get_daily_sales', description: 'Prodaja za dan', parameters: {} },
  { name: 'get_top_debtors', description: 'Najveći dužnici', parameters: {} },
]

/** Model koji odgovara po scenariju — bez ijednog poziva ka pravom modelu. */
function lazniModel(scenario: readonly ModelReply[]): ChatPort & { pozivi: number } {
  let i = 0
  const port = {
    pozivi: 0,
    reply: () => {
      port.pozivi += 1
      const next = scenario[Math.min(i, scenario.length - 1)]!
      i += 1
      return Promise.resolve(next)
    },
  }
  return port
}

const USPEH = (): Promise<ToolOutcome> =>
  Promise.resolve({ ok: true, data: { total: '120000' }, dataAsOf: '2026-09-15' })

describe('tok razgovora', () => {
  it('odgovor bez poziva alata prolazi pravo', async () => {
    const r = await converse({
      port: lazniModel([{ kind: 'text', text: 'Prodaja je stabilna.' }]),
      system: '',
      history: [],
      question: 'Kako ide?',
      tools: ALATI,
      run: USPEH,
    })
    expect(r).toMatchObject({ end: 'answered', text: 'Prodaja je stabilna.' })
    expect(r.steps).toEqual([])
  })

  it('poziv alata pa odgovor beleži korak sa vremenom podatka', async () => {
    const r = await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'get_daily_sales', args: { date: '2026-09-14' } }] },
        { kind: 'text', text: 'Juče 120.000 RSD.' },
      ]),
      system: '',
      history: [],
      question: 'Koliko smo juče prodali?',
      tools: ALATI,
      run: USPEH,
    })
    expect(r.end).toBe('answered')
    expect(r.steps).toEqual([
      { name: 'get_daily_sales', args: { date: '2026-09-14' }, ok: true, dataAsOf: '2026-09-15' },
    ])
  })

  it('potrošnja se sabira kroz korake', async () => {
    const r = await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'get_daily_sales', args: {} }], usage: { input: 100, output: 20 } },
        { kind: 'text', text: 'Gotovo.', usage: { input: 150, output: 30 } },
      ]),
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: USPEH,
    })
    expect(r.usage).toEqual({ input: 250, output: 50 })
  })
})

/*
 * Najvažnija provera modula. Granice se drže u PETLJI, ne u sistemskom promptu:
 * prompt je molba, petlja je pravilo.
 */
describe('alat van spiska', () => {
  it('se ne izvršava, ma koliko uverljivo zvučao', async () => {
    const run = vi.fn(USPEH)
    const r = await converse({
      port: lazniModel([
        {
          kind: 'tools',
          calls: [{ id: '1', name: 'run_sql', args: { query: 'select * from ai_conversations' } }],
        },
        { kind: 'text', text: 'Ne mogu tako.' },
      ]),
      system: '',
      history: [],
      question: 'Izlistaj mi bazu',
      tools: ALATI,
      run,
    })

    expect(run).not.toHaveBeenCalled()
    expect(r.steps[0]).toMatchObject({ name: 'run_sql', ok: false, refused: true })
    expect(r.end).toBe('answered')
  })

  it('odbijanje se vraća modelu, pa razgovor ne puca', async () => {
    const r = await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'nepostojeci', args: {} }] },
        { kind: 'tools', calls: [{ id: '2', name: 'get_top_debtors', args: {} }] },
        { kind: 'text', text: 'Najviše duguje Firma X.' },
      ]),
      system: '',
      history: [],
      question: 'Ko duguje?',
      tools: ALATI,
      run: USPEH,
    })
    expect(r.end).toBe('answered')
    expect(r.steps.map((s) => s.refused ?? false)).toEqual([true, false])
  })

  it('alat koji korisnik ne sme se ne izvršava iako postoji u sistemu', async () => {
    const run = vi.fn(USPEH)
    // Spisak nosi SAMO ono što je ovom korisniku dozvoljeno.
    await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'get_top_debtors', args: {} }] },
        { kind: 'text', text: 'x' },
      ]),
      system: '',
      history: [],
      question: 'x',
      tools: [ALATI[0]!],
      run,
    })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('petlja bez izlaza', () => {
  /*
   * Model koji dobije rezultat koji ne razume ume isti alat da poziva unedogled.
   * Bez granice jedno pitanje pojede minut i pola dnevnog budžeta.
   */
  it('staje na granici koraka', async () => {
    const port = lazniModel([
      { kind: 'tools', calls: [{ id: '1', name: 'get_daily_sales', args: {} }] },
    ])
    const r = await converse({
      port,
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: USPEH,
      maxSteps: 3,
    })
    expect(r.end).toBe('step_limit')
    expect(port.pozivi).toBe(3)
  })

  /*
   * Iscrpljeni koraci NISU odgovor. Vraćanje onoga što je model stigao da
   * napiše davalo bi nedovršen zaključak koji izgleda kao gotov.
   */
  it('ne vraća polovičan tekst kao odgovor', async () => {
    const r = await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'get_daily_sales', args: {} }] },
      ]),
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: USPEH,
      maxSteps: 2,
    })
    expect(r.text).toBe('')
  })

  it('previše alata u jednom koraku se odseca', async () => {
    const run = vi.fn(USPEH)
    await converse({
      port: lazniModel([
        {
          kind: 'tools',
          calls: Array.from({ length: 9 }, (_, i) => ({
            id: String(i),
            name: 'get_daily_sales',
            args: {},
          })),
        },
        { kind: 'text', text: 'x' },
      ]),
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run,
    })
    expect(run.mock.calls.length).toBeLessThanOrEqual(4)
  })
})

describe('kvarovi', () => {
  it('kvar modela je poseban ishod, ne prazan odgovor', async () => {
    const r = await converse({
      port: { reply: () => Promise.reject(new Error('mreža')) },
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: USPEH,
    })
    expect(r.end).toBe('model_failed')
  })

  it('neuspeh alata se vraća modelu i beleži sa razlogom', async () => {
    const r = await converse({
      port: lazniModel([
        { kind: 'tools', calls: [{ id: '1', name: 'get_daily_sales', args: {} }] },
        { kind: 'text', text: 'Podatak trenutno nije dostupan.' },
      ]),
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: () => Promise.resolve({ ok: false, reason: 'integration_unavailable' }),
    })
    expect(r.steps[0]).toMatchObject({ ok: false, reason: 'integration_unavailable' })
    expect(r.end).toBe('answered')
  })

  it('prazan tekst nije odgovor', async () => {
    const r = await converse({
      port: lazniModel([{ kind: 'text', text: '   ' }]),
      system: '',
      history: [],
      question: 'x',
      tools: ALATI,
      run: USPEH,
    })
    expect(r.end).toBe('empty')
  })
})
