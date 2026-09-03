import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator, type MessageKey } from '@/i18n/translator'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { askableIntents } from '@/core/ai/ask'
import { suggestionKey } from '@/core/ai/answer'
import { latestConversation, listMessages } from '@/core/ai/repository'
import { StatusBadge, type Tone } from '@/ui/patterns/StatusBadge'
import { AskForm } from './ask-form'
import styles from './ask.module.css'

const CLASSIFICATION_TONE: Record<string, Tone> = {
  fact: 'neutral',
  calculation: 'neutral',
  interpretation: 'warn',
  forecast: 'warn',
}

/** Oblik koji `ask` upisuje u `provenance` uz odgovor. */
interface StoredProvenance {
  classification?: string
  sources?: { label?: string; isDemo?: boolean }[]
  freshness?: { asOf?: string }
  facts?: { label: string; value: string; warn?: boolean }[]
  unanswered?: string
}

export default async function AskPage({ params }: { params: Promise<{ orgSlug: string }> }) {
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
  const { t, formatDate } = createTranslator(locale)

  initialiseConnectors()
  const source = await primaryIntegration(db, org.organizationId)

  const [intents, conversation] = await Promise.all([
    askableIntents(db, org, source.integrationId),
    latestConversation(db, org.organizationId, user.id),
  ])

  const messages =
    conversation.ok && conversation.value
      ? await listMessages(db, conversation.value.id)
      : { ok: true as const, value: [] }

  const turns = messages.ok ? messages.value : []

  // Prevodi se šalju kao GOTOV TEKST. Klijentska komponenta ne sme da dobije
  // funkciju `t` — React je odbija pri serijalizaciji, i to je već jednom
  // oborilo celu stranicu.
  const errorTexts: Record<string, string> = {
    'ask.error.empty': t('ask.error.empty'),
    'ask.error.tooLong': t('ask.error.tooLong'),
    'ask.error.notAllowed': t('ask.error.notAllowed'),
    'error.rate_limited': t('error.rate_limited'),
    'error.internal': t('error.internal'),
    'error.unauthenticated': t('error.unauthenticated'),
    'error.not_found.organization': t('error.not_found.organization'),
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('ask.title')}</h1>
        <p className={styles.lede}>{t('ask.lede')}</p>
      </header>

      {turns.length === 0 ? (
        <p className={styles.empty}>{t('ask.empty')}</p>
      ) : (
        <ol className={styles.thread}>
          {turns.map((message) => {
            if (message.role === 'user') {
              return (
                <li key={message.id} className={styles.turn}>
                  <span className={styles.role}>{t('ask.you')}</span>
                  <p className={styles.question}>{message.content}</p>
                </li>
              )
            }

            const p = message.provenance as StoredProvenance
            const unanswered = p.unanswered
            const facts = p.facts ?? []
            const src = p.sources?.[0]

            return (
              <li key={message.id} className={styles.turn}>
                <span className={styles.role}>{t('ask.assistant')}</span>
                <div
                  className={`${styles.answer} ${unanswered ? styles.unanswered : ''}`.trim()}
                >
                  <p className={styles.answerText}>
                    {unanswered
                      ? t(`ask.reason.${unanswered}` as MessageKey)
                      : (message.content ?? '')}
                  </p>

                  {facts.length > 0 ? (
                    <dl className={styles.facts}>
                      {facts.map((f) => (
                        <div key={`${f.label}-${f.value}`} className={styles.fact}>
                          <dt className={styles.factLabel}>{f.label}</dt>
                          <dd
                            className={`${styles.factValue} ${f.warn ? styles.factWarn : ''}`.trim()}
                          >
                            {f.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <div className={styles.meta}>
                    {unanswered ? (
                      <StatusBadge tone="warn" label={t('ask.notAnswered')} />
                    ) : (
                      <>
                        {p.classification ? (
                          <StatusBadge
                            tone={CLASSIFICATION_TONE[p.classification] ?? 'neutral'}
                            label={t(`classification.${p.classification}` as MessageKey)}
                          />
                        ) : null}
                        {src?.label ? <span>{src.label}</span> : null}
                        {src?.isDemo ? (
                          <StatusBadge tone="info" label={t('common.demoData')} />
                        ) : null}
                        {p.freshness?.asOf ? (
                          <span>
                            {t('ask.asOf', {
                              when: formatDate(p.freshness.asOf, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }),
                            })}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <AskForm
        orgSlug={org.organizationSlug}
        placeholder={t('ask.placeholder')}
        sendLabel={t('ask.send')}
        suggestionsLabel={
          intents.length > 0 ? t('ask.suggestions') : t('ask.suggestions.none')
        }
        suggestions={intents.map((i) => t(suggestionKey(i)))}
        errors={errorTexts}
      />
    </div>
  )
}
