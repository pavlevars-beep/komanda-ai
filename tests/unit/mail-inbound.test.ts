import { describe, expect, it } from 'vitest'
import {
  isMailToken,
  mailAddress,
  newMailToken,
  tokenFromAddress,
  extractAddress,
} from '@/core/mail/address'
import {
  judgeInboundEmail,
  senderAllowed,
  type InboundEmail,
  type MailboxRule,
} from '@/core/mail/inbound'
import { normalizeSenders } from '@/core/mail/repository'

const PRAVILO: MailboxRule = {
  allowedSenders: ['erp@firma.rs', '@izvestaji.firma.rs'],
  maxBytes: 25 * 1024 * 1024,
  enabled: true,
}

function poruka(over: Partial<InboundEmail> = {}): InboundEmail {
  return {
    to: 'uvoz+0123456789abcdef0123456789abcdef@komanda.ai',
    from: '"ERP Sistem" <erp@firma.rs>',
    subject: 'Dnevni izvoz prodaje',
    spf: 'pass',
    dkim: 'pass',
    attachments: [{ fileName: 'prodaja.xlsx', sizeBytes: 120_000 }],
    ...over,
  }
}

describe('namenska adresa', () => {
  it('token se čita iz plus-adrese', () => {
    const token = newMailToken()
    expect(isMailToken(token)).toBe(true)
    expect(tokenFromAddress(mailAddress(token, 'komanda.ai'))).toBe(token)
  })

  it('adresa u uglastim zagradama se raspakuje', () => {
    expect(tokenFromAddress('Uvoz <uvoz+0123456789abcdef0123456789abcdef@komanda.ai>')).toBe(
      '0123456789abcdef0123456789abcdef',
    )
  })

  it('pogrešan prefiks, kratak token i adresa bez plusa ne prolaze', () => {
    expect(tokenFromAddress('podaci+0123456789abcdef0123456789abcdef@komanda.ai')).toBeNull()
    expect(tokenFromAddress('uvoz+abc@komanda.ai')).toBeNull()
    expect(tokenFromAddress('uvoz@komanda.ai')).toBeNull()
  })

  it('dva različita tokena se ne poklapaju', () => {
    expect(newMailToken()).not.toBe(newMailToken())
  })

  it('nevažeća adresa u zaglavlju daje ništa, ne prazan domen', () => {
    expect(extractAddress('bez majmunske')).toBeNull()
    expect(extractAddress('@firma.rs')).toBeNull()
    expect(extractAddress('erp@')).toBeNull()
  })
})

/*
 * Adresa pošiljaoca se trivijalno lažira. Spisak dozvoljenih bez provere
 * autentičnosti je zaključana brava na otvorenim vratima.
 */
describe('autentičnost pošiljaoca', () => {
  it('bez SPF-a i DKIM-a se ne prima ništa', () => {
    const v = judgeInboundEmail(poruka({ spf: 'none', dkim: 'none' }), PRAVILO)
    expect(v.accepted).toBe(false)
    expect(v).toMatchObject({ reason: 'not_authenticated' })
  })

  it('nepoznat rezultat provere se broji kao neuspeh, ne kao prolaz', () => {
    const v = judgeInboundEmail(poruka({ spf: 'unknown', dkim: 'unknown' }), PRAVILO)
    expect(v).toMatchObject({ accepted: false, reason: 'not_authenticated' })
  })

  it('dovoljan je jedan od dva', () => {
    expect(judgeInboundEmail(poruka({ spf: 'pass', dkim: 'fail' }), PRAVILO).accepted).toBe(true)
    expect(judgeInboundEmail(poruka({ spf: 'fail', dkim: 'pass' }), PRAVILO).accepted).toBe(true)
  })
})

describe('spisak dozvoljenih pošiljalaca', () => {
  it('prazan spisak ne propušta nikoga', () => {
    const v = judgeInboundEmail(poruka(), { ...PRAVILO, allowedSenders: [] })
    expect(v).toMatchObject({ accepted: false, reason: 'sender_not_allowed' })
  })

  it('tačna adresa prolazi bez obzira na ime u zaglavlju', () => {
    expect(senderAllowed('"Neko Nekić" <erp@firma.rs>', PRAVILO.allowedSenders)).toBe(true)
    expect(senderAllowed('ERP@FIRMA.RS', PRAVILO.allowedSenders)).toBe(true)
  })

  it('pravilo za domen prolazi bilo kog pošiljaoca iz tog domena', () => {
    expect(senderAllowed('bilo.ko@izvestaji.firma.rs', PRAVILO.allowedSenders)).toBe(true)
  })

  /*
   * Poređenje domena mora da bude CELO, ne kao završetak. Inače `@firma.rs`
   * propušta i napadača sa sopstvenog domena koji se na to završava.
   */
  it('sličan domen ne prolazi', () => {
    const pravilo = { ...PRAVILO, allowedSenders: ['@firma.rs'] }
    expect(senderAllowed('napadac@zla-firma.rs', pravilo.allowedSenders)).toBe(false)
    expect(senderAllowed('napadac@firma.rs.zlo.com', pravilo.allowedSenders)).toBe(false)
  })

  it('poddomen se ne podrazumeva', () => {
    const pravilo = { ...PRAVILO, allowedSenders: ['@firma.rs'] }
    expect(senderAllowed('neko@posta.firma.rs', pravilo.allowedSenders)).toBe(false)
  })
})

describe('izbor priloga', () => {
  it('jedna tabela se prima', () => {
    const v = judgeInboundEmail(poruka(), PRAVILO)
    expect(v).toMatchObject({ accepted: true })
    if (v.accepted) expect(v.attachment.fileName).toBe('prodaja.xlsx')
  })

  it('potpis i logotip uz tabelu ne smetaju', () => {
    const v = judgeInboundEmail(
      poruka({
        attachments: [
          { fileName: 'logo.png', sizeBytes: 8_000 },
          { fileName: 'prodaja.csv', sizeBytes: 50_000 },
          { fileName: 'potpis.jpg', sizeBytes: 4_000 },
        ],
      }),
      PRAVILO,
    )
    expect(v).toMatchObject({ accepted: true })
    if (v.accepted) expect(v.attachment.fileName).toBe('prodaja.csv')
  })

  it('bez ijedne tabele se odbija', () => {
    const v = judgeInboundEmail(
      poruka({ attachments: [{ fileName: 'izvestaj.pdf', sizeBytes: 90_000 }] }),
      PRAVILO,
    )
    expect(v).toMatchObject({ accepted: false, reason: 'no_table' })
  })

  /*
   * Dve tabele se ODBIJAJU, ne pogađaju. Izbor „ona veća" ili „ona prva" bio bi
   * tiho pogađanje koje jednog dana promaši — i tada bi prodaja bila upisana
   * kao zalihe, bez ijedne poruke o grešci.
   */
  it('dve tabele se odbijaju i imenuju', () => {
    const v = judgeInboundEmail(
      poruka({
        attachments: [
          { fileName: 'prodaja.xlsx', sizeBytes: 10_000 },
          { fileName: 'zalihe.xlsx', sizeBytes: 20_000 },
        ],
      }),
      PRAVILO,
    )
    expect(v).toMatchObject({ accepted: false, reason: 'many_tables' })
    if (!v.accepted) {
      expect(v.detail).toContain('prodaja.xlsx')
      expect(v.detail).toContain('zalihe.xlsx')
    }
  })

  it('stari .xls dobija svoju poruku, ne „nečitljiv fajl"', () => {
    const v = judgeInboundEmail(
      poruka({ attachments: [{ fileName: 'prodaja.xls', sizeBytes: 30_000 }] }),
      PRAVILO,
    )
    expect(v).toMatchObject({ accepted: false, reason: 'legacy_xls' })
  })

  it('prevelik prilog se odbija', () => {
    const v = judgeInboundEmail(
      poruka({ attachments: [{ fileName: 'prodaja.xlsx', sizeBytes: 99_000_000 }] }),
      PRAVILO,
    )
    expect(v).toMatchObject({ accepted: false, reason: 'too_large' })
  })
})

describe('isključen prijem', () => {
  it('ne prima ništa, ni od dozvoljenog pošiljaoca', () => {
    const v = judgeInboundEmail(poruka(), { ...PRAVILO, enabled: false })
    expect(v).toMatchObject({ accepted: false, reason: 'disabled' })
  })
})

/*
 * Neispravan unos se PRIJAVLJUJE, ne izbacuje ćutke. Tiho izbacivanje bi
 * značilo da konsultant unese adresu bez domena, vidi da je sačuvano, i mesec
 * dana čeka poruke koje pravilo nikad neće propustiti.
 */
describe('unos dozvoljenih pošiljalaca', () => {
  it('adrese i domeni se svode na mala slova i bez duplikata', () => {
    const r = normalizeSenders(['ERP@Firma.rs', ' erp@firma.rs ', '@Izvestaji.Firma.rs'])
    expect(r.valid).toEqual(['erp@firma.rs', '@izvestaji.firma.rs'])
    expect(r.invalid).toEqual([])
  })

  it('ime uz adresu se raspakuje', () => {
    expect(normalizeSenders(['"ERP" <erp@firma.rs>']).valid).toEqual(['erp@firma.rs'])
  })

  it('adresa bez domena i domen bez tačke se prijavljuju', () => {
    const r = normalizeSenders(['erp@firma', '@firma', 'bez-majmunske'])
    expect(r.valid).toEqual([])
    expect(r.invalid).toEqual(['erp@firma', '@firma', 'bez-majmunske'])
  })

  it('prazni redovi se preskaču bez prijave', () => {
    const r = normalizeSenders(['', '   ', 'erp@firma.rs'])
    expect(r.valid).toEqual(['erp@firma.rs'])
    expect(r.invalid).toEqual([])
  })
})
