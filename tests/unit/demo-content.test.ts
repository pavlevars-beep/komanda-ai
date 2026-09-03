import { describe, expect, it } from 'vitest'
import { buildDemoContent } from '@/core/demo/populate'

const debtors = {
  total: '4200000',
  currency: 'RSD',
  items: [
    { customer: 'Gradnja Plus', amount: '1850000', currency: 'RSD', invoiceCount: 4, oldestOverdueDays: 94 },
    { customer: 'Metalac Trade', amount: '900000', currency: 'RSD', invoiceCount: 2, oldestOverdueDays: 71 },
    { customer: 'Alfa Dom', amount: '120000', currency: 'RSD', invoiceCount: 1, oldestOverdueDays: 12 },
  ],
}

const payables = {
  total: '2100000',
  dueWithin7Days: '450000',
  currency: 'RSD',
  items: [
    { supplier: 'Profil Sistem', amount: '450000', currency: 'RSD', dueDate: '2026-09-05', daysUntilDue: 2 },
    { supplier: 'Stakloplast', amount: '300000', currency: 'RSD', dueDate: '2026-08-28', daysUntilDue: -6 },
    { supplier: 'Logistika BG', amount: '180000', currency: 'RSD', dueDate: '2026-10-10', daysUntilDue: 37 },
  ],
}

const inventory = {
  items: [
    { item: 'Profil PVC 70mm', onHand: 40, minimum: 120, daysOfCover: 2 },
    { item: 'Okov standard', onHand: 300, minimum: 350, daysOfCover: 9 },
    { item: 'Silikon beli', onHand: 500, minimum: 200, daysOfCover: 40 },
  ],
}

const base = { debtors, payables, inventory, defaultLocale: 'sr' as const }

describe('demo sadržaj se izvodi iz podataka, ne izmišlja', () => {
  it('poruka o dužniku nastaje samo za stvarno vraćenog dužnika', () => {
    const built = buildDemoContent(base)
    const debtorAlerts = built.alerts.filter((a) => a.dedupeKey.startsWith('demo:debtor:'))

    expect(debtorAlerts.map((a) => a.dedupeKey)).toEqual([
      'demo:debtor:Gradnja Plus',
      'demo:debtor:Metalac Trade',
    ])
    // Dužnik od 12 dana nije problem naplate i ne dobija poruku.
    expect(built.alerts.some((a) => a.body.sr.includes('Alfa Dom'))).toBe(false)
  })

  it('preko 90 dana je kritično, preko 60 upozorenje', () => {
    const built = buildDemoContent(base)
    const byKey = new Map(built.alerts.map((a) => [a.dedupeKey, a]))

    expect(byKey.get('demo:debtor:Gradnja Plus')?.severity).toBe('critical')
    expect(byKey.get('demo:debtor:Metalac Trade')?.severity).toBe('warning')
  })

  it('već dospela obaveza je kritična, ona koja tek dospeva nije', () => {
    const built = buildDemoContent(base)
    const byKey = new Map(built.alerts.map((a) => [a.dedupeKey, a]))

    expect(byKey.get('demo:payable:Stakloplast:2026-08-28')?.severity).toBe('critical')
    expect(byKey.get('demo:payable:Profil Sistem:2026-09-05')?.severity).toBe('warning')
    // Obaveza za 37 dana nije ni pomenuta.
    expect(built.alerts.some((a) => a.dedupeKey.includes('Logistika'))).toBe(false)
  })

  it('zaliha iznad minimuma ne pravi upozorenje', () => {
    const built = buildDemoContent(base)
    expect(built.alerts.some((a) => a.body.sr.includes('Silikon beli'))).toBe(false)
    expect(built.alerts.some((a) => a.dedupeKey === 'demo:inventory:Profil PVC 70mm')).toBe(true)
  })

  it('telo poruke postoji na oba jezika', () => {
    const built = buildDemoContent(base)
    for (const alert of built.alerts) {
      expect(alert.body.sr.length).toBeGreaterThan(0)
      expect(alert.body.en.length).toBeGreaterThan(0)
      expect(alert.body.sr).not.toBe(alert.body.en)
    }
  })

  it('poruka sadrži ime i broj iz podatka, ne opšte mesto', () => {
    const built = buildDemoContent(base)
    const worst = built.alerts.find((a) => a.dedupeKey === 'demo:debtor:Gradnja Plus')

    expect(worst?.body.sr).toContain('Gradnja Plus')
    expect(worst?.body.sr).toContain('94')
    expect(worst?.title).toContain('94')
  })

  /*
   * Ključ za sprečavanje duplikata mora da bude stabilan između pokretanja —
   * na njemu stoji jedinstveni indeks u bazi. Da sadrži datum ili nasumičan
   * deo, svako pokretanje bi napravilo novi red.
   */
  it('ključ za sprečavanje duplikata je isti pri ponovnom pokretanju', () => {
    const first = buildDemoContent(base)
    const second = buildDemoContent(base)
    expect(first.alerts.map((a) => a.dedupeKey)).toEqual(second.alerts.map((a) => a.dedupeKey))
  })

  it('bez podataka nema nijednog upozorenja', () => {
    const built = buildDemoContent({
      debtors: null,
      payables: null,
      inventory: null,
      defaultLocale: 'sr',
    })
    expect(built.alerts).toEqual([])
    // Opšta beleška o sastanku ostaje — ona ne tvrdi ništa o podacima.
    expect(built.notes.length).toBe(1)
  })

  it('neispravan oblik izvora se ne pretvara u sadržaj', () => {
    const built = buildDemoContent({
      debtors: { items: 'nije niz' },
      payables: 'ni ovo nije objekat',
      inventory: undefined,
      defaultLocale: 'sr',
    })
    expect(built.alerts).toEqual([])
  })
})
