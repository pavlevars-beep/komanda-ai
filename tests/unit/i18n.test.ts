import { describe, expect, it } from 'vitest'
import { resolveLocale } from '@/i18n/config'
import { createTranslator } from '@/i18n/translator'
import { sr } from '@/i18n/messages/sr'
import { en } from '@/i18n/messages/en'

describe('lokalizacija', () => {
  it('engleski katalog pokriva svaki ključ iz srpskog', () => {
    const missing = Object.keys(sr).filter((k) => !(k in en))
    expect(missing).toEqual([])
  })

  it('nijedna poruka nije prazna', () => {
    for (const [key, value] of Object.entries({ ...sr, ...en })) {
      expect(value.trim(), `prazna poruka: ${key}`).not.toBe('')
    }
  })

  it('poštuje redosled izbora jezika', () => {
    expect(resolveLocale({ userLocale: 'en', organizationLocale: 'sr' })).toBe('en')
    expect(resolveLocale({ organizationLocale: 'en' })).toBe('en')
    expect(resolveLocale({ acceptLanguage: 'en-GB,en;q=0.9' })).toBe('en')
    expect(resolveLocale({ acceptLanguage: 'de-DE,de;q=0.9' })).toBe('sr')
    expect(resolveLocale({})).toBe('sr')
  })

  it('umeće parametre', () => {
    const t = createTranslator('sr')
    expect(t.t('impersonation.reason', { reason: 'dijagnostika' })).toBe('Razlog: dijagnostika')
  })

  it('ostavlja nepoznat parametar netaknutim umesto da ispiše undefined', () => {
    const t = createTranslator('sr')
    expect(t.t('common.updatedAt')).toBe('Ažurirano {time}')
  })
})
