import 'server-only'
import { env } from './env'

/**
 * Šta je na ovom deploy-u UKLJUČENO.
 *
 * Namerno se NE zove „capabilities": ta reč u ovom kodu već znači imenovane
 * sposobnosti konektora (`core/integrations/capabilities.ts`). Dva značenja
 * iste reči u istom projektu su poziv da se jednog dana uveze pogrešna.
 *
 * Postoji zbog konkretne rupe: promenljive okruženja se unose na Vercel-u, a
 * jedini način da se vidi da li su stigle bio je da neko otvori sagovornika i
 * proba. Kada ne odgovori, pitanje „da li ključ nije stigao ili poziv puca"
 * ostaje bez odgovora bez kopanja po logovima hostinga.
 *
 * Ovde se NE vraća nijedna tajna — samo da li postoji i, gde je bezbedno,
 * vrednost koja tajna nije (naziv modela, domen pošte). To je namerno: prikaz
 * koji bi odao ključ bio bi gori od nepostojanja prikaza.
 */

export type DeployFeatureKey = 'ai' | 'cron' | 'mail'

export interface DeployFeature {
  readonly key: DeployFeatureKey
  /** Radi li sposobnost na ovom deploy-u. */
  readonly on: boolean
  /**
   * Podešeno je pola — uključeno, a nedostaje mu par.
   *
   * Ovo je stanje koje najviše zbunjuje: čovek je uneo jednu promenljivu,
   * video da ništa ne radi i traži grešku u kodu. Zato ima svoje ime.
   */
  readonly partial: boolean
  /** Vrednost koja nije tajna, za prikaz. Prazno kada je nema. */
  readonly detail?: string
  /** Promenljive koje ovoj sposobnosti nedostaju. */
  readonly missing: readonly string[]
}

export function deployFeatures(): readonly DeployFeature[] {
  const config = env()

  const aiOn = config.AI_PROVIDER !== 'none'
  const aiKey = Boolean(config.OPENAI_API_KEY)

  const mailVars: Array<[string, boolean]> = [
    ['MAIL_DOMAIN', Boolean(config.MAIL_DOMAIN)],
    ['MAIL_WEBHOOK_SECRET', Boolean(config.MAIL_WEBHOOK_SECRET)],
  ]
  const mailMissing = mailVars.filter(([, set]) => !set).map(([name]) => name)

  return [
    {
      key: 'ai',
      on: aiOn && aiKey,
      // `AI_PROVIDER=openai` bez ključa obara build, pa se ovo u praksi vidi
      // samo ako je promenljiva izmenjena posle build-a. Ostaje jer je jeftino.
      partial: aiOn && !aiKey,
      ...(aiOn && aiKey ? { detail: config.OPENAI_MODEL } : {}),
      missing: aiOn && !aiKey ? ['OPENAI_API_KEY'] : !aiOn ? ['AI_PROVIDER'] : [],
    },
    {
      key: 'cron',
      on: Boolean(config.CRON_SECRET),
      partial: false,
      missing: config.CRON_SECRET ? [] : ['CRON_SECRET'],
    },
    {
      key: 'mail',
      on: mailMissing.length === 0,
      partial: mailMissing.length === 1,
      ...(mailMissing.length === 0 && config.MAIL_DOMAIN
        ? { detail: config.MAIL_DOMAIN }
        : {}),
      missing: mailMissing,
    },
  ]
}
