import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
import styles from './no-access.module.css'

/**
 * Korisnik je prijavljen, ali nema nijedno aktivno članstvo.
 *
 * Ovo se dešava posle opoziva pristupa ili pre prihvatanja pozivnice.
 * Prazan ekran bi ostavio utisak kvara, pa se stanje imenuje.
 */
export default async function NoAccessPage() {
  const locale = await requestLocale()
  const { t } = createTranslator(locale)

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.title}>{t('state.forbidden.title')}</h1>
        <p className={styles.body}>{t('state.forbidden.body')}</p>
        <LocaleToggle current={locale} label={t('common.language')} />
      </div>
    </main>
  )
}
