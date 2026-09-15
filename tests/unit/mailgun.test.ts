import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachmentFieldNames,
  authResultsFrom,
  normalizeMailgun,
  parseMessageHeaders,
  verifyMailgunSignature,
} from '@/core/mail/mailgun'

const KLJUC = 'kljuc-za-potpisivanje-webhookova-0123456789'
const TOKEN = 'a'.repeat(50)

function potpis(timestamp: string, token = TOKEN, key = KLJUC): string {
  return createHmac('sha256', key).update(timestamp + token).digest('hex')
}

const SADA = new Date('2026-09-15T12:00:00Z')
const TS = String(Math.floor(SADA.getTime() / 1000))

describe('potpis Mailgun-a', () => {
  it('ispravan potpis prolazi', () => {
    expect(
      verifyMailgunSignature({ timestamp: TS, token: TOKEN, signature: potpis(TS) }, KLJUC, SADA),
    ).toBe(true)
  })

  it('pogrešan ključ ne prolazi', () => {
    expect(
      verifyMailgunSignature(
        { timestamp: TS, token: TOKEN, signature: potpis(TS, TOKEN, 'drugi-kljuc-koji-nije-nas') },
        KLJUC,
        SADA,
      ),
    ).toBe(false)
  })

  it('izmenjen token obara potpis', () => {
    expect(
      verifyMailgunSignature(
        { timestamp: TS, token: 'b'.repeat(50), signature: potpis(TS) },
        KLJUC,
        SADA,
      ),
    ).toBe(false)
  })

  /*
   * Potpis dokazuje KO je poslao, ne i KADA. Bez ograničenja starosti bi jednom
   * snimljen zahtev važio zauvek i mogao da se ponavlja godinu dana kasnije.
   */
  it('star zahtev se odbija iako je potpis ispravan', () => {
    const star = String(Math.floor(SADA.getTime() / 1000) - 3600)
    expect(
      verifyMailgunSignature(
        { timestamp: star, token: TOKEN, signature: potpis(star) },
        KLJUC,
        SADA,
      ),
    ).toBe(false)
  })

  it('zahtev iz budućnosti se takođe odbija', () => {
    const budući = String(Math.floor(SADA.getTime() / 1000) + 3600)
    expect(
      verifyMailgunSignature(
        { timestamp: budući, token: TOKEN, signature: potpis(budući) },
        KLJUC,
        SADA,
      ),
    ).toBe(false)
  })

  it('besmislen oblik polja ne ruši proveru', () => {
    expect(
      verifyMailgunSignature({ timestamp: 'juče', token: TOKEN, signature: potpis(TS) }, KLJUC, SADA),
    ).toBe(false)
    expect(
      verifyMailgunSignature({ timestamp: TS, token: TOKEN, signature: 'kratko' }, KLJUC, SADA),
    ).toBe(false)
  })
})

describe('zaglavlja poruke', () => {
  it('parovi se čitaju iz JSON niza', () => {
    const h = parseMessageHeaders('[["Subject","Izvoz"],["X-Mailgun-Spf","Pass"]]')
    expect(h.get('subject')).toBe('Izvoz')
    expect(h.get('x-mailgun-spf')).toBe('Pass')
  })

  it('pokvaren JSON daje prazno, ne izuzetak', () => {
    expect(parseMessageHeaders('{nije json').size).toBe(0)
    expect(parseMessageHeaders(null).size).toBe(0)
  })

  it('ponovljeno zaglavlje zadržava prvo pojavljivanje', () => {
    const h = parseMessageHeaders('[["Received","poslednji"],["Received","raniji"]]')
    expect(h.get('received')).toBe('poslednji')
  })
})

/*
 * Nazivi dobavljačevih zaglavlja se s vremena na vreme menjaju. Čitaju se DVA
 * izvora — Mailgun-ova zaglavlja i standardni Authentication-Results — pa
 * promena naziva ne obara prijem.
 */
describe('rezultat SPF-a i DKIM-a', () => {
  it('čita se iz Mailgun-ovih zaglavlja', () => {
    const h = parseMessageHeaders(
      '[["X-Mailgun-Spf","Pass"],["X-Mailgun-Dkim-Check-Result","Pass"]]',
    )
    expect(authResultsFrom(h)).toEqual({ spf: 'pass', dkim: 'pass' })
  })

  it('čita se i iz standardnog Authentication-Results', () => {
    const h = parseMessageHeaders(
      '[["Authentication-Results","mx.mailgun.org; spf=pass smtp.mailfrom=firma.rs; dkim=fail"]]',
    )
    expect(authResultsFrom(h)).toEqual({ spf: 'pass', dkim: 'fail' })
  })

  it('Mailgun-ovo zaglavlje ima prednost kada postoje oba', () => {
    const h = parseMessageHeaders(
      '[["X-Mailgun-Spf","Fail"],["Authentication-Results","spf=pass; dkim=pass"]]',
    )
    expect(authResultsFrom(h).spf).toBe('fail')
  })

  it('softfail je neuspeh, neutral nije prolaz', () => {
    expect(authResultsFrom(parseMessageHeaders('[["X-Mailgun-Spf","SoftFail"]]')).spf).toBe('fail')
    expect(authResultsFrom(parseMessageHeaders('[["X-Mailgun-Spf","Neutral"]]')).spf).toBe('none')
  })

  /*
   * Kada se ne nađe nijedan izvor — `unknown`, a pravila to računaju kao
   * neuspeh. Provera koja propušta kada ne zna nije provera.
   */
  it('bez ijednog izvora ostaje nepoznato, ne prolaz', () => {
    expect(authResultsFrom(parseMessageHeaders('[["Subject","Izvoz"]]'))).toEqual({
      spf: 'unknown',
      dkim: 'unknown',
    })
  })
})

describe('prevod u naš oblik poruke', () => {
  const polja = {
    recipient: 'uvoz+0123456789abcdef0123456789abcdef@uvoz.komanda.ai',
    sender: 'bounce+xyz@firma.rs',
    from: '"ERP Sistem" <erp@firma.rs>',
    subject: 'Dnevni izvoz',
    messageHeaders: '[["X-Mailgun-Spf","Pass"],["X-Mailgun-Dkim-Check-Result","Pass"]]',
  }

  it('primalac dolazi iz isporuke, ne iz zaglavlja To', () => {
    const n = normalizeMailgun(polja)
    expect(n?.to).toBe(polja.recipient)
  })

  /*
   * Za pošiljaoca je obrnuto: uzima se `From:`, jer je to ono što čovek vidi i
   * što konsultant upisuje u spisak dozvoljenih. Koverta je rezerva.
   */
  it('pošiljalac je zaglavlje From, sa kovertom kao rezervom', () => {
    expect(normalizeMailgun(polja)?.from).toBe('"ERP Sistem" <erp@firma.rs>')
    expect(normalizeMailgun({ ...polja, from: null })?.from).toBe('bounce+xyz@firma.rs')
  })

  it('bez primaoca ili pošiljaoca nema poruke', () => {
    expect(normalizeMailgun({ ...polja, recipient: null })).toBeNull()
    expect(normalizeMailgun({ ...polja, from: null, sender: null })).toBeNull()
  })

  it('poruka bez zaglavlja dobija nepoznatu autentičnost', () => {
    const n = normalizeMailgun({ ...polja, messageHeaders: null })
    expect(n).toMatchObject({ spf: 'unknown', dkim: 'unknown' })
  })
})

describe('nazivi polja sa prilozima', () => {
  it('broje se od jedan', () => {
    expect(attachmentFieldNames(2)).toEqual(['attachment-1', 'attachment-2'])
  })

  it('besmislen broj ne pravi beskonačan niz', () => {
    expect(attachmentFieldNames(Number.NaN)).toEqual([])
    expect(attachmentFieldNames(-5)).toEqual([])
    expect(attachmentFieldNames(1000)).toHaveLength(20)
  })
})
