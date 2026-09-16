import { describe, expect, it } from 'vitest'
import {
  AFTER_CALLBACK,
  CALLBACK_PATH,
  recoveryRedirectUrl,
} from '@/app/(auth)/reset-password/redirect-url'
import { isPublicPath } from '@/middleware'

/*
 * Ovaj test postoji zbog jednog izgubljenog popodneva.
 *
 * Supabase je slao ispravan link za promenu lozinke na `localhost:3000`, jer
 * je „Site URL" u njegovom dashboardu ostao na razvojnoj vrednosti. Čovek
 * zaključan iz naloga je dobio „This site can't be reached", i ničemu u kodu
 * to nije bilo vidljivo.
 *
 * Otud `redirectTo`: odredište linka određuje APLIKACIJA, iz APP_URL, a ne
 * polje u tuđem dashboardu.
 */

describe('odredište linka za promenu lozinke', () => {
  it('vodi na okruženje koje je mejl i poslalo', () => {
    expect(recoveryRedirectUrl('https://komanda-ai.vercel.app')).toBe(
      'https://komanda-ai.vercel.app/auth/callback?next=%2Freset-password',
    )
  })

  /*
   * APP_URL se prekopira iz Vercel-a kako dođe — nekad sa završnom kosom
   * crtom. Bez sređivanja bi ispalo `//auth/callback`, što Supabase odbija kao
   * adresu van spiska dozvoljenih.
   */
  it('završna kosa crta ne pravi duplu', () => {
    expect(recoveryRedirectUrl('https://komanda-ai.vercel.app/')).not.toContain('//auth')
    expect(recoveryRedirectUrl('https://komanda-ai.vercel.app/')).toContain('/auth/callback')
  })

  it('radi i u razvoju, na drugom portu', () => {
    expect(recoveryRedirectUrl('http://localhost:3000')).toBe(
      'http://localhost:3000/auth/callback?next=%2Freset-password',
    )
  })

  /*
   * Obe putanje MORAJU da budu javne: do njih se stiže bez sesije, iz mejla.
   * Da nisu, middleware bi čoveka vratio na prijavu i link bi ponovo vodio
   * nigde — isti kvar, drugi uzrok.
   */
  it('obe putanje su javne u middleware-u', () => {
    expect(isPublicPath(CALLBACK_PATH)).toBe(true)
    expect(isPublicPath(AFTER_CALLBACK)).toBe(true)
  })

  it('zaštićena putanja i dalje nije javna', () => {
    // Brana da prethodna tvrdnja ne postane tačna zato što je sve javno.
    expect(isPublicPath('/w/europrofil')).toBe(false)
  })
})
