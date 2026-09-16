import type { Metadata } from 'next'
import Link from 'next/link'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { userDb } from '@/server/db/user-client'
import { LocaleToggle } from '@/app/locale-toggle'
import { RequestForm, SetPasswordForm } from './reset-forms'
import styles from '../login/login.module.css'

export const metadata: Metadata = { title: 'Nova lozinka' }

/**
 * Jedna stranica, dva stanja — i to NIJE štednja na fajlovima.
 *
 * Postojanje sesije je jedina razlika između „traži mi mejl" i „postavi novu
 * lozinku", jer sesiju ovde daje isključivo link iz mejla, kroz
 * `/auth/callback`. Da su ovo dve rute, druga bi morala da bude javna da bi se
 * do nje stiglo — a javna stranica za postavljanje lozinke je tačno ono što ne
 * sme da postoji.
 *
 * Ovako pitanje „sme li ovaj čovek da menja lozinku" ima jedan odgovor na
 * jednom mestu: ima li sesiju.
 */
export default async function ResetPasswordPage() {
  const locale = await requestLocale()
  const { t } = createTranslator(locale)

  const db = await userDb()
  const {
    data: { user },
  } = await db.auth.getUser()

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
            <h1 className={styles.title}>
              {user ? t('auth.reset.setTitle') : t('auth.reset.askTitle')}
            </h1>
            <p className={styles.subtitle}>
              {user ? t('auth.reset.setSubtitle') : t('auth.reset.askSubtitle')}
            </p>
          </div>

          {user ? (
            <SetPasswordForm
              labels={{
                password: t('auth.reset.newPassword'),
                confirm: t('auth.reset.confirmPassword'),
                action: t('auth.reset.setAction'),
                tooShort: t('auth.reset.tooShort'),
                mismatch: t('auth.reset.mismatch'),
                noSession: t('auth.reset.noSession'),
                rejected: t('auth.reset.rejected'),
              }}
            />
          ) : (
            <RequestForm
              labels={{
                email: t('auth.email'),
                action: t('auth.reset.askAction'),
                sent: t('auth.reset.sent'),
                rateLimited: t('error.rate_limited'),
                invalid: t('auth.reset.invalidEmail'),
              }}
            />
          )}

          <Link href="/login" className={styles.quietLink}>
            {t('auth.reset.backToSignIn')}
          </Link>
        </div>

        <p className={styles.footer}>Delta Pro DOO</p>
      </div>
    </main>
  )
}
