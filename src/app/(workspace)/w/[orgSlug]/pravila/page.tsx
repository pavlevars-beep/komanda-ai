import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor, type MessageKey } from '@/i18n/translator'
import { businessRulesFor } from '@/core/rules/repository'
import { Icon } from '@/ui/primitives/Icon'
import { RulesForm, type RuleGroup } from './rules-form'
import styles from './rules.module.css'

export default async function RulesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const reqId = makeRequestId(await headers())

  const db = await userDb()
  const user = await currentUser(db)
  if (!user) notFound()

  const resolved = await resolveOrgContext(db, {
    slug: orgSlug,
    userId: user.id,
    userName: user.fullName,
    requestId: reqId,
  })
  if (!resolved.ok) notFound()

  const org = resolved.value
  const locale = await requestLocale(user.locale ?? org.locale)
  const { t } = createTranslator(locale)

  const rules = await businessRulesFor(db, org.organizationId)
  const canEdit = org.permissions.includes('manage_alerts')

  /** Naziv polja daje i oznaku i objašnjenje — dva ključa po istoj šemi. */
  const field = (name: keyof typeof rules) => ({
    name,
    label: t(`rules.${name}` as MessageKey),
    hint: t(`rules.${name}.hint` as MessageKey),
    value: String(rules[name]),
  })

  const groups: RuleGroup[] = [
    {
      title: t('rules.group.receivables'),
      fields: [
        field('receivableWarningDays'),
        field('receivableCriticalDays'),
        field('largeReceivableAmount'),
      ],
    },
    {
      title: t('rules.group.stock'),
      fields: [field('stockWarningDays'), field('stockCriticalDays'), field('stockOverstockDays')],
    },
    {
      title: t('rules.group.payables'),
      fields: [field('payableHorizonDays'), field('largePayableAmount')],
    },
    {
      title: t('rules.group.sales'),
      fields: [field('salesDropPercent')],
    },
    {
      title: t('rules.group.comparison'),
      fields: [
        {
          name: 'defaultComparison',
          label: t('rules.defaultComparison'),
          // Izbor iz zatvorenog skupa nema šta da objasni preko same oznake.
          hint: '',
          value: rules.defaultComparison,
          options: [
            {
              value: 'previous_year_same_period',
              label: t('rules.defaultComparison.previous_year_same_period'),
            },
            {
              value: 'previous_period',
              label: t('rules.defaultComparison.previous_period'),
            },
          ],
        },
        field('forecastHistoryYears'),
      ],
    },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="settings" size={22} />
          {t('rules.title')}
        </h1>
        <p className={styles.lede}>{t('rules.lede')}</p>
      </header>

      {canEdit ? (
        <RulesForm
          orgSlug={org.organizationSlug}
          groups={groups}
          labels={{
            save: t('rules.save'),
            saved: t('rules.saved'),
            messages: messagesFor(locale, ['error.', 'rules.error.']),
          }}
        />
      ) : (
        <>
          <p className={styles.readOnly}>{t('rules.readOnly')}</p>

          {/*
            Bez prava na izmenu vrednosti se i dalje PRIKAZUJU. Upozorenje
            „preko 90 dana" bez uvida u to odakle je 90 ostaje broj koji
            korisnik ne može da proveri.
          */}
          {groups.map((group) => (
            <section key={group.title} className={styles.group}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
              <div className={styles.fields}>
                {group.fields.map((f) => (
                  <div key={f.name} className={styles.field}>
                    <span className={styles.label}>{f.label}</span>
                    <span className={styles.input}>
                      {f.options?.find((o) => o.value === f.value)?.label ?? f.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
