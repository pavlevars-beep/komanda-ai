import { describe, expect, it } from 'vitest'
import { addCardInput, listAvailableTools } from '@/core/dashboard/cards-repository'

const ORG = '00000000-0000-0000-0000-00000000d002'
const INTEGRATION = '00000000-0000-0000-0000-00000000e001'

/**
 * Dvojnik baze: vraća zadate redove po tabeli.
 *
 * `listAvailableTools` čita tri tabele, pa dvojnik mora da razlikuje koja se
 * traži — inače test ne bi mogao da proveri baš spajanje, a to je ono što ovde
 * odlučuje šta konsultant sme da doda.
 */
function fakeDb(rows: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: rows[table] ?? [], error: null }),
      }
      return q
    },
  } as never
}

const TOOLS = [
  {
    key: 'get_daily_sales',
    name: { sr: 'Prodaja za dan', en: 'Daily sales' },
    capability_key: 'get_daily_sales',
    required_permission: 'view_sales',
    classification: 'fact',
  },
  {
    key: 'get_outstanding_invoices',
    name: { sr: 'Dospela potraživanja', en: 'Outstanding invoices' },
    capability_key: 'get_outstanding_invoices',
    required_permission: 'view_financial_data',
    classification: 'fact',
  },
  {
    // Alat bez sposobnosti — nema odakle da povuče vrednost.
    key: 'summarize_period',
    name: { sr: 'Sažetak', en: 'Summary' },
    capability_key: null,
    required_permission: 'view_sales',
    classification: 'interpretation',
  },
]

describe('mere koje se smeju staviti na početnu', () => {
  it('nudi samo one koje neka UKLJUČENA integracija stvarno daje', async () => {
    // Ovo je jezgro: kartica bez izvora na klijentovoj početnoj piše
    // „nedostupno", a to izgleda kao kvar, ne kao podešavanje.
    const r = await listAvailableTools(
      fakeDb({
        integration_capabilities: [
          { integration_id: INTEGRATION, capability_key: 'get_daily_sales' },
        ],
        ai_tools: TOOLS,
        integrations: [{ id: INTEGRATION, name: 'Demo ERP' }],
      }),
      ORG,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.map((t) => t.key)).toEqual(['get_daily_sales'])
    expect(r.value[0]?.integrationName).toBe('Demo ERP')
  })

  it('bez ijedne uključene sposobnosti ne nudi ništa', async () => {
    const r = await listAvailableTools(
      fakeDb({ integration_capabilities: [], ai_tools: TOOLS, integrations: [] }),
      ORG,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual([])
  })

  it('alat bez sposobnosti se ne nudi ni kada sposobnosti postoje', async () => {
    const r = await listAvailableTools(
      fakeDb({
        integration_capabilities: [
          { integration_id: INTEGRATION, capability_key: 'get_daily_sales' },
          { integration_id: INTEGRATION, capability_key: 'get_outstanding_invoices' },
        ],
        ai_tools: TOOLS,
        integrations: [{ id: INTEGRATION, name: 'Demo ERP' }],
      }),
      ORG,
    )
    if (!r.ok) throw new Error('očekivan uspeh')
    expect(r.value.map((t) => t.key)).not.toContain('summarize_period')
  })
})

describe('unos kartice', () => {
  const base = {
    organizationId: ORG,
    aiToolKey: 'get_daily_sales',
    titleSr: 'Prodaja danas',
    titleEn: 'Sales today',
    format: 'money',
    higherIsBetter: true,
  }

  it('traži naslov na OBA jezika', () => {
    // Baza to i zahteva (dashboard_cards_title_bilingual), pa je bolje da
    // korisnik dobije poruku nego greška ograničenja.
    expect(addCardInput.safeParse({ ...base, titleEn: '' }).success).toBe(false)
    expect(addCardInput.safeParse({ ...base, titleSr: '' }).success).toBe(false)
    expect(addCardInput.safeParse(base).success).toBe(true)
  })

  it('odbija nepoznat format', () => {
    expect(addCardInput.safeParse({ ...base, format: 'gauge' }).success).toBe(false)
  })

  it('smer promene se prenosi tačno kako je izabran', () => {
    // Za dospela potraživanja rast je loša vest; zeleno +18% bi obmanulo.
    const parsed = addCardInput.safeParse({ ...base, higherIsBetter: false })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.higherIsBetter).toBe(false)
  })
})
