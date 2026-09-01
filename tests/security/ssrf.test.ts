import { describe, expect, it } from 'vitest'
import {
  guardUrl,
  hostAllowed,
  isBlockedAddress,
  isBlockedHostname,
  isPrivateIpv4,
  isPrivateIpv6,
} from '@/core/connectors/ssrf'

const ALLOW = { allowedHosts: ['api.klijent.rs', '.partner.rs'] }

describe('SSRF — privatni IPv4 opsezi', () => {
  it('blokira petlju i „ovaj host"', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '0.0.0.0', '0.1.2.3']) {
      expect(isPrivateIpv4(ip), ip).toBe(true)
    }
  })

  it('blokira privatne opsege', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      expect(isPrivateIpv4(ip), ip).toBe(true)
    }
  })

  it('blokira link-local, gde živi metadata servis oblaka', () => {
    // Najvrednija meta SSRF napada: kredencijali instance.
    expect(isPrivateIpv4('169.254.169.254')).toBe(true)
    expect(isPrivateIpv4('169.254.0.1')).toBe(true)
  })

  it('blokira CGNAT, opseg za testiranje i multicast', () => {
    for (const ip of ['100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255']) {
      expect(isPrivateIpv4(ip), ip).toBe(true)
    }
  })

  it('propušta javne adrese', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '192.169.0.1']) {
      expect(isPrivateIpv4(ip), ip).toBe(false)
    }
  })
})

describe('SSRF — IPv6', () => {
  it('blokira petlju i lokalne opsege', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1']) {
      expect(isPrivateIpv6(ip), ip).toBe(true)
    }
  })

  it('blokira IPv4 upisan u IPv6', () => {
    // Ista petlja, samo drugačije zapisana.
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIpv6('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false)
  })

  it('propušta javne IPv6 adrese', () => {
    expect(isPrivateIpv6('2001:4860:4860::8888')).toBe(false)
  })
})

describe('SSRF — imena hostova', () => {
  it('blokira localhost i interne sufikse', () => {
    for (const host of [
      'localhost',
      'app.localhost',
      'baza.internal',
      'printer.local',
      'nesto.home.arpa',
      'metadata.google.internal',
    ]) {
      expect(isBlockedHostname(host), host).toBe(true)
    }
  })

  it('blokira brojčane zapise koji se razrešavaju u petlju', () => {
    // Klasična zaobilaznica: 2130706433 == 127.0.0.1
    for (const host of ['2130706433', '0x7f000001', '017700000001', '127.1', '10.0.1']) {
      expect(isBlockedHostname(host), host).toBe(true)
    }
  })

  it('propušta obična javna imena', () => {
    for (const host of ['api.klijent.rs', 'erp.firma.co.rs', 'example.com']) {
      expect(isBlockedHostname(host), host).toBe(false)
    }
  })

  it('ne nasene se na tačku na kraju imena', () => {
    expect(isBlockedHostname('localhost.')).toBe(true)
  })
})

describe('SSRF — allowlist', () => {
  it('traži tačno poklapanje hosta', () => {
    expect(hostAllowed('api.klijent.rs', ALLOW.allowedHosts)).toBe(true)
    expect(hostAllowed('drugi.klijent.rs', ALLOW.allowedHosts)).toBe(false)
  })

  it('unos sa tačkom na početku pokriva poddomene', () => {
    expect(hostAllowed('partner.rs', ALLOW.allowedHosts)).toBe(true)
    expect(hostAllowed('api.partner.rs', ALLOW.allowedHosts)).toBe(true)
    expect(hostAllowed('zlonamerni-partner.rs', ALLOW.allowedHosts)).toBe(false)
  })

  it('prazna lista ne znači „sve je dozvoljeno"', () => {
    expect(hostAllowed('api.klijent.rs', [])).toBe(false)
  })
})

describe('SSRF — provera cele adrese', () => {
  it('propušta dozvoljenu https adresu', () => {
    const r = guardUrl('https://api.klijent.rs/v1/sales', ALLOW)
    expect(r.ok).toBe(true)
  })

  it('odbija http van sandbox-a', () => {
    const r = guardUrl('http://api.klijent.rs/v1', ALLOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.insecureProtocol')
  })

  it('dozvoljava http kada je okruženje sandbox', () => {
    expect(guardUrl('http://api.klijent.rs/v1', { ...ALLOW, allowInsecure: true }).ok).toBe(true)
  })

  it('odbija šeme koje nisu http(s)', () => {
    for (const url of ['file:///etc/passwd', 'gopher://api.klijent.rs', 'ftp://api.klijent.rs']) {
      expect(guardUrl(url, ALLOW).ok, url).toBe(false)
    }
  })

  it('odbija kredencijale upisane u adresu', () => {
    const r = guardUrl('https://korisnik:lozinka@api.klijent.rs/v1', ALLOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.credentialsInUrl')
  })

  it('odbija internu infrastrukturu i kada je na allowlist-u', () => {
    // Zabrana odredišta ima prednost nad dozvolom — pogrešan unos u
    // allowlist ne sme da otvori put ka metadata servisu.
    const r = guardUrl('http://169.254.169.254/latest/meta-data/', {
      allowedHosts: ['169.254.169.254'],
      allowInsecure: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.blockedDestination')
  })

  it('odbija naš sopstveni Supabase na petlji', () => {
    const r = guardUrl('http://127.0.0.1:54321/rest/v1/organizations', {
      allowedHosts: ['127.0.0.1'],
      allowInsecure: true,
    })
    expect(r.ok).toBe(false)
  })

  it('odbija host koji nije na allowlist-u', () => {
    const r = guardUrl('https://zlonamerni.rs/kradja', ALLOW)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.key).toBe('connector.error.hostNotAllowed')
  })

  it('odbija neispravnu adresu bez bacanja izuzetka', () => {
    expect(guardUrl('nije adresa', ALLOW).ok).toBe(false)
    expect(guardUrl('', ALLOW).ok).toBe(false)
  })
})

describe('SSRF — provera razrešene adrese (DNS rebinding)', () => {
  it('blokira ime koje se razrešilo u privatnu adresu', () => {
    // Domen prolazi allowlist, ali njegov A zapis pokazuje na petlju.
    expect(isBlockedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedAddress('169.254.169.254')).toBe(true)
    expect(isBlockedAddress('::1')).toBe(true)
  })

  it('propušta javnu razrešenu adresu', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
  })
})
