import type { Metadata } from 'next'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { LocaleToggle } from '@/app/locale-toggle'
import { LoginForm } from './login-form'
import styles from './login.module.css'

export const metadata: Metadata = { title: 'Prijava' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [locale, params] = await Promise.all([requestLocale(), searchParams])
  const { t } = createTranslator(locale)

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>{t('app.name')}</span>
          <span className={styles.tagline}>Delta Pro</span>
        </div>

        <LocaleToggle current={locale} label={t('common.language')} />

        <div className={styles.panel}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{t('auth.signIn')}</h1>
            <p className={styles.subtitle}>{t('auth.signInSubtitle')}</p>
          </div>

          <LoginForm
            {...(params.next ? { next: params.next } : {})}
            labels={{
              email: t('auth.email'),
              password: t('auth.password'),
              action: t('auth.signInAction'),
              invalid: t('auth.invalidCredentials'),
              rateLimited: t('error.rate_limited'),
            }}
          />
        </div>

        <p className={styles.footer}>Delta Pro DOO</p>
      </div>
    </main>
  )
}
