'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { workspaceAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { requestId as makeRequestId } from '@/server/http/request-id'
import { resolveOrgContext } from '@/core/tenancy/workspace-repository'
import { requestLocale } from '@/server/http/locale'
import { createTranslator } from '@/i18n/translator'
import { INTL_LOCALE } from '@/i18n/config'
import { initialiseConnectors } from '@/core/connectors'
import { primaryIntegration } from '@/core/dashboard/loader'
import { ask } from '@/core/ai/ask'
import { chat } from '@/core/ai/chat'
import { openAiPort } from '@/server/ai/openai-port'
import { businessRulesFor } from '@/core/rules/repository'
import { answerWithQuestion, latestConversation, listMessages } from '@/core/ai/repository'
import { noteFromAnswer } from '@/core/ai/note-from-answer'
import { addNote } from '@/core/notes/repository'
import { uuid } from '@/core/shared/uuid'
import type { Db } from '@/server/db/types'

/** Gornja granica dužine pitanja; duži tekst nije pitanje nego nalepljen dokument. */
const MAX_QUESTION_LENGTH = 500

export interface AskState extends ActionResultBase {
  readonly answered?: boolean
  /**
   * Poslednji odgovor, da bi traka mogla da ga prikaže na licu mesta.
   *
   * Čita se iz razgovora POSLE poziva, isto za oba režima. Vraćanje teksta koji
   * je akcija sastavila značilo bi dva puta do istog odgovora — jedan za traku,
   * drugi za stranicu — i ta dva bi vremenom počela da se razlikuju.
   */
  readonly answer?: { readonly id: string; readonly text: string }
}

/**
 * Postavljanje pitanja iz radnog prostora.
 *
 * Organizacija se razrešava iz SLUG-a u putanji preko iste funkcije koju
 * koristi i stranica — identifikator iz forme se ne uzima kao dokaz
 * pripadnosti. Ovo je jedno od mesta gde bi „samo prosledi organizationId"
 * značilo da pitanje može da se postavi nad tuđim podacima.
 */
export const askAction = workspaceAction<AskState>(
  { rateLimit: 'write', audit: 'ai.question_asked' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const question = (formString(formData, 'question') ?? '').trim()

    if (!slug) return { error: 'error.not_found.organization' }
    if (question.length === 0) return { error: 'ask.error.empty' }
    if (question.length > MAX_QUESTION_LENGTH) return { error: 'ask.error.tooLong' }

    const reqId = makeRequestId(await headers())

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: reqId,
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const org = resolved.value
    const locale = await requestLocale(user.locale ?? org.locale)
    const { t, formatNumber, formatDate } = createTranslator(locale)

    initialiseConnectors()
    const source = await primaryIntegration(db, org.organizationId)

    /*
     * DVA REŽIMA, ISTI PRISTUP PODACIMA.
     *
     * Sa podešenim modelom razgovor planira: bira alate, poziva ih više puta,
     * poredi i sastavlja odgovor. Bez modela radi deterministički — jedno
     * pitanje, jedna sposobnost, isti odgovor kao do sada.
     *
     * Razlika je u PLANIRANJU, ne u pristupu: oba režima biraju iz istog spiska
     * sposobnosti, uz istu proveru prava. Zato nepodešen model ne otvara nikakav
     * ekran koji bi inače bio zatvoren, niti ga zatvara.
     *
     * Oba upisuju u ISTI razgovor, pa stranica ne mora da zna koji je radio.
     */
    const port = openAiPort()

    if (port) {
      const rules = await businessRulesFor(db, org.organizationId)
      await chat(db, org, {
        port,
        question,
        integrationId: source.integrationId,
        connectorType: source.connectorType,
        locale,
        rules,
        organizationName: org.organizationName,
        currency: org.currency,
      })

      revalidatePath(`/w/${slug}/pitanja`)
      return { answered: true, ...(await lastAnswer(db, org.organizationId, user.id)) }
    }

    const result = await ask(db, org, {
      question,
      integrationId: source.integrationId,
      connectorType: source.connectorType,
      locale,
      format: {
        t,
        money: (amount, currency) =>
          new Intl.NumberFormat(INTL_LOCALE[locale], {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
          }).format(Number(amount)),
        number: (value) => formatNumber(value),
        percent: (value) =>
          new Intl.NumberFormat(INTL_LOCALE[locale], {
            style: 'percent',
            maximumFractionDigits: 1,
            signDisplay: 'exceptZero',
          }).format(value / 100),
        date: (value) => formatDate(`${value}T00:00:00Z`, { dateStyle: 'medium' }),
      },
    })

    // Neuspeh se NE vraća kao greška akcije: pitanje i objašnjenje zašto
    // odgovora nema već stoje u razgovoru, a stranica ih prikazuje. Crvena
    // traka povrh toga izgledala bi kao kvar, a nije — sistem je odgovorio,
    // samo ne brojem.
    revalidatePath(`/w/${slug}/pitanja`)
    return { answered: result.ok, ...(await lastAnswer(db, org.organizationId, user.id)) }
  },
)

/** Poslednji odgovor u tekućem razgovoru, ili ništa kada ga nema. */
async function lastAnswer(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<{ answer?: { id: string; text: string } }> {
  const conversation = await latestConversation(db, organizationId, userId)
  if (!conversation.ok || !conversation.value) return {}

  const messages = await listMessages(db, conversation.value.id, 40)
  if (!messages.ok) return {}

  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const message = messages.value[i]!
    if (message.role === 'assistant' && message.content && message.content.trim() !== '') {
      return { answer: { id: message.id, text: message.content } }
    }
  }

  return {}
}

export interface SaveNoteState extends ActionResultBase {
  readonly saved?: boolean
}

/**
 * Čuvanje odgovora kao beleške.
 *
 * Tekst se čita IZ BAZE po identifikatoru poruke, nikad iz obrasca. Tekst
 * poslat iz pregledača nije dokaz da je sistem to rekao, a beleška koja tvrdi
 * da je odgovor mora da bude ono što je odgovor stvarno bio.
 *
 * RLS propušta samo poruke iz sopstvenog razgovora, pa tuđi odgovor ne može da
 * se sačuva ni kada se pogodi identifikator.
 */
export const saveAnswerAsNote = workspaceAction<SaveNoteState>(
  { rateLimit: 'write', audit: 'note.created' },
  async ({ db, user }, _prev, formData) => {
    const slug = formString(formData, 'orgSlug')
    const messageId = uuid().safeParse(formString(formData, 'messageId'))
    if (!slug || !messageId.success) return { error: 'error.invalid_input' }

    const resolved = await resolveOrgContext(db, {
      slug,
      userId: user.id,
      userName: user.fullName,
      requestId: makeRequestId(await headers()),
    })
    if (!resolved.ok) return { error: 'error.not_found.organization' }

    const org = resolved.value
    const source = await answerWithQuestion(db, org.organizationId, messageId.data)
    if (!source) return { error: 'ask.error.noAnswer' }

    const locale = await requestLocale(user.locale ?? org.locale)
    const { t, formatDate } = createTranslator(locale)

    const body = noteFromAnswer(
      {
        question: source.question,
        answer: source.answer,
        when: formatDate(source.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
      },
      { header: t('ask.note.header', { when: '{when}' }), questionLabel: t('ask.note.question') },
    )

    const created = await addNote(db, org.organizationId, user.id, body)
    if (!created.ok) return { error: created.error.key }

    revalidatePath(`/w/${slug}/pitanja`)
    revalidatePath(`/w/${slug}/beleske`)
    return { saved: true }
  },
)
