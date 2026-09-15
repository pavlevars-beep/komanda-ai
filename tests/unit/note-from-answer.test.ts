import { describe, expect, it } from 'vitest'
import { noteFromAnswer } from '@/core/ai/note-from-answer'
import { NOTE_MAX_LENGTH } from '@/core/notes/limits'

const LABELS = { header: 'Iz razgovora, {when}', questionLabel: 'Pitanje:' }

describe('beleška iz odgovora', () => {
  it('nosi pitanje pa odgovor', () => {
    const note = noteFromAnswer(
      { question: 'Ko nam najviše duguje?', answer: 'Firma X, 1.200.000 RSD.', when: '15.9.2026.' },
      LABELS,
    )
    expect(note).toContain('Iz razgovora, 15.9.2026.')
    expect(note).toContain('Pitanje: Ko nam najviše duguje?')
    expect(note).toContain('Firma X, 1.200.000 RSD.')
    expect(note.indexOf('Pitanje:')).toBeLessThan(note.indexOf('Firma X'))
  })

  it('bez pitanja i dalje daje upotrebljivu belešku', () => {
    const note = noteFromAnswer({ question: null, answer: 'Nešto.', when: 'danas' }, LABELS)
    expect(note).not.toContain('Pitanje:')
    expect(note).toContain('Nešto.')
  })

  it('prazno pitanje se ponaša kao da ga nema', () => {
    const note = noteFromAnswer({ question: '   ', answer: 'Nešto.', when: 'danas' }, LABELS)
    expect(note).not.toContain('Pitanje:')
  })
})

/*
 * Skraćivanje je jedina zamka ovog modula: beleška ima gornju granicu, odgovor
 * je nema.
 */
describe('skraćivanje', () => {
  const dugacak = 'a'.repeat(NOTE_MAX_LENGTH * 2)

  it('nikad ne prelazi granicu beleške', () => {
    const note = noteFromAnswer(
      { question: 'Kratko pitanje?', answer: dugacak, when: 'danas' },
      LABELS,
    )
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH)
  })

  /*
   * Skraćuje se ODGOVOR, ne pitanje. Odsečeno pitanje ostavlja belešku bez
   * povoda; odsečen odgovor i dalje kaže o čemu je reč.
   */
  it('pitanje preživlja skraćivanje celo', () => {
    const note = noteFromAnswer(
      { question: 'Ko nam duguje preko 90 dana?', answer: dugacak, when: 'danas' },
      LABELS,
    )
    expect(note).toContain('Ko nam duguje preko 90 dana?')
    expect(note.endsWith('…')).toBe(true)
  })

  it('kratak odgovor se ne dira', () => {
    const note = noteFromAnswer({ question: 'x?', answer: 'Kratko.', when: 'danas' }, LABELS)
    expect(note.endsWith('Kratko.')).toBe(true)
  })

  it('kada ni zaglavlje ne staje, ostaje sam odgovor u granici', () => {
    const note = noteFromAnswer(
      { question: 'p'.repeat(NOTE_MAX_LENGTH), answer: dugacak, when: 'danas' },
      LABELS,
    )
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_LENGTH)
    expect(note.startsWith('a')).toBe(true)
  })
})
