import { cookies, headers } from 'next/headers'
import { resolveLocale } from '@/i18n/config'
import { createTranslator } from '@/i18n/translator'
import styles from './no-access.module.css'

/**
 * Korisnik je prijavljen, ali nema nijedno aktivno članstvo.
 *
 * Ovo se dešava posle opoziva pristupa ili pre prihvatanja pozivnice.
 * Prazan ekran bi ostavio utisak kvara, pa se stanje imenuje.
 */
export default async function NoAccessPage() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  const locale = resolveLocale({
    userLocale: cookieStore.get('locale')?.value ?? null,
    acceptLanguage: headerList.get('accept-language'),
  })
  const { t } = createTranslator(locale)

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.title}>{t('state.forbidden.title')}</h1>
        <p className={styles.body}>{t('state.forbidden.body')}</p>
      </div>
    </main>
  )
}
