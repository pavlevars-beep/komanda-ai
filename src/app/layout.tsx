import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import { resolveLocale, INTL_LOCALE } from '@/i18n/config'
import { readThemeCookie } from '@/ui/theme/theme'
import './globals.css'

/**
 * Tema se čita iz kolačića na serveru i upisuje na <html> pre slanja odgovora.
 *
 * Alternativa je bila inline skripta koja pre iscrtavanja čita localStorage,
 * ali ona traži 'unsafe-inline' ili nonce u CSP-u. Ovako nema ni treptaja
 * ni popuštanja politike sadržaja.
 */

/*
 * `latin-ext` je OBAVEZAN podskup: bez njega č, ć, š, ž i đ padaju na rezervni
 * font, pa se u istoj reči mešaju dva pisma. Na srpskom se to vidi u svakoj
 * drugoj reči.
 */
const sans = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-loaded',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-mono-loaded',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Komanda AI', template: '%s · Komanda AI' },
  description: 'Komandni centar poslovanja.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f8f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1113' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])

  const locale = resolveLocale({
    userLocale: cookieStore.get('locale')?.value ?? null,
    acceptLanguage: headerList.get('accept-language'),
  })
  const theme = readThemeCookie(cookieStore.get('theme')?.value)

  return (
    <html
      lang={INTL_LOCALE[locale]}
      // "system" ne postavlja atribut — tada odlučuje prefers-color-scheme.
      {...(theme === 'system' ? {} : { 'data-theme': theme })}
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
