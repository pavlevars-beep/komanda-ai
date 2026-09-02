import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, messagesFor } from '@/i18n/translator'
import { getConsoleClient } from '@/core/organizations/console-repository'
import { listAvailableTools, listConfiguredCards } from '@/core/dashboard/cards-repository'
import { CardManager } from './card-manager'
import styles from './dashboard.module.css'

/**
 * Podešavanje početne strane klijenta.
 *
 * Karika između „integracija radi" i „klijent vidi broj". Bez nje klijent
 * posle celog onboardinga otvara prazan radni prostor.
 */
export default async function DashboardConfigPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()

  const db = await userDb()
  const user = await currentUser(db)
  if (!user?.staffRole) notFound()

  const locale = await requestLocale(user.locale)
  const { t } = createTranslator(locale)
  const messages = messagesFor(locale, ['error.', 'dashboard.'])

  const [client, cards, tools] = await Promise.all([
    getConsoleClient(db, orgId),
    listConfiguredCards(db, orgId),
    listAvailableTools(db, orgId),
  ])
  if (!client.ok) notFound()

  const formats = {
    number: t('dashboard.format.number'),
    money: t('dashboard.format.money'),
    percent: t('dashboard.format.percent'),
    count: t('dashboard.format.count'),
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href={`/console/clients/${orgId}` as Route} className={styles.crumb}>
          ← {client.value.display_name}
        </Link>
        <h1 className={styles.title}>{t('dashboard.title')}</h1>
        <p className={styles.lede}>{t('dashboard.lede')}</p>
      </header>

      <CardManager
        organizationId={orgId}
        cards={
          cards.ok
            ? cards.value.map((c) => ({
                id: c.id,
                title: c.title[locale] ?? c.ai_tool_key,
                toolKey: c.ai_tool_key,
                format: c.format,
                higherIsBetter: c.higher_is_better,
              }))
            : []
        }
        tools={
          tools.ok
            ? tools.value.map((tool) => ({
                key: tool.key,
                name: tool.name[locale] ?? tool.key,
                integrationName: tool.integrationName,
                classification: tool.classification,
              }))
            : []
        }
        labels={{
          configured: t('dashboard.configured'),
          none: t('dashboard.none'),
          add: t('dashboard.add'),
          tool: t('dashboard.tool'),
          titleSr: t('dashboard.titleSr'),
          titleEn: t('dashboard.titleEn'),
          format: t('dashboard.format'),
          higherIsBetter: t('dashboard.higherIsBetter'),
          higherIsBetterHint: t('dashboard.higherIsBetterHint'),
          submit: t('dashboard.submit'),
          remove: t('dashboard.remove'),
          noTools: t('dashboard.noTools'),
          formats,
          messages,
        }}
      />
    </div>
  )
}
