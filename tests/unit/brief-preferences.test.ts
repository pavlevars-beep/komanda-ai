import { describe, expect, it } from 'vitest'
import { briefChoices, resolveBriefSections } from '@/core/brief/preferences'
import type { Permission } from '@/core/auth/permissions'

const SVE: readonly Permission[] = ['view_sales', 'view_financial_data', 'view_inventory']

describe('lični izbor odeljaka brifa', () => {
  it('bez izbora važi redosled po roli', () => {
    expect(resolveBriefSections(null, 'procurement', SVE)).toEqual([
      'stock',
      'payables',
      'sales',
      'receivables',
      'debtors',
    ])
  })

  it('postavljen redosled pobeđuje redosled po roli', () => {
    const sections = resolveBriefSections(
      { order: ['debtors', 'sales'], hidden: [] },
      'procurement',
      SVE,
    )
    expect(sections.slice(0, 2)).toEqual(['debtors', 'sales'])
  })

  /*
   * Odeljak koji korisnik nikad nije video ide na KRAJ, ne ispada. Da se
   * prikazuje samo izabrano, nov odeljak bi zauvek bio nevidljiv baš onima koji
   * proizvod najduže koriste — i niko ne bi prijavio da nedostaje, jer se ne
   * zna da postoji.
   */
  it('odeljak van zapamćenog redosleda ostaje vidljiv, na kraju', () => {
    const sections = resolveBriefSections(
      { order: ['debtors', 'sales'], hidden: [] },
      'procurement',
      SVE,
    )
    expect(sections).toContain('stock')
    expect(sections).toContain('payables')
    expect(sections).toContain('receivables')
    expect(sections).toHaveLength(5)
  })

  it('skriven odeljak se ne prikazuje', () => {
    const sections = resolveBriefSections(
      { order: [], hidden: ['payables', 'stock'] },
      'manager',
      SVE,
    )
    expect(sections).not.toContain('payables')
    expect(sections).not.toContain('stock')
    expect(sections.length).toBe(3)
  })

  it('sve skriveno je dozvoljeno — ostaje odeljak koji se ne podešava', () => {
    const sections = resolveBriefSections(
      { order: [], hidden: ['sales', 'receivables', 'debtors', 'payables', 'stock'] },
      'manager',
      SVE,
    )
    expect(sections).toEqual([])
  })
})

/*
 * Najvažnija invarijanta ovog modula. Prilagođavanje sme samo da preuredi ili
 * skrati spisak — nikad da ga proširi. Da vidljivost zavisi od izbora, postojala
 * bi zaštita koju je dovoljno preurediti da bi popustila.
 */
describe('prilagođavanje nije pristup', () => {
  const BEZ_FINANSIJA: readonly Permission[] = ['view_sales', 'view_inventory']

  it('traženje odeljka bez prava ga ne otkriva', () => {
    const sections = resolveBriefSections(
      { order: ['receivables', 'payables', 'debtors', 'sales'], hidden: [] },
      'manager',
      BEZ_FINANSIJA,
    )
    expect(sections).not.toContain('receivables')
    expect(sections).not.toContain('payables')
    expect(sections).not.toContain('debtors')
    expect(sections).toEqual(['sales', 'stock'])
  })

  it('prazna prava daju prazan brif bez obzira na izbor', () => {
    expect(
      resolveBriefSections({ order: ['sales', 'stock'], hidden: [] }, 'client_owner', []),
    ).toEqual([])
  })

  it('odeljak bez prava se ne nudi ni na ekranu podešavanja', () => {
    const choices = briefChoices(null, 'manager', BEZ_FINANSIJA)
    expect(choices.map((c) => c.section)).toEqual(['sales', 'stock'])
  })
})

describe('ekran podešavanja', () => {
  it('prikazuje i skrivene odeljke, da se skrivanje može poništiti', () => {
    const choices = briefChoices(
      { order: ['stock', 'sales'], hidden: ['sales'] },
      'manager',
      SVE,
    )
    expect(choices).toHaveLength(5)
    expect(choices[0]).toEqual({ section: 'stock', visible: true })
    expect(choices[1]).toEqual({ section: 'sales', visible: false })
  })

  it('redosled na ekranu je isti kao redosled u brifu', () => {
    const preference = { order: ['debtors', 'stock'] as const, hidden: [] }
    const visible = resolveBriefSections(preference, 'finance', SVE)
    const choices = briefChoices(preference, 'finance', SVE)
      .filter((c) => c.visible)
      .map((c) => c.section)
    expect(choices).toEqual(visible)
  })
})
