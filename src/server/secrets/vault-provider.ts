import 'server-only'
import { z } from 'zod'
import type { SecretsProvider } from '@/core/secrets/provider'
import { maskValue, secret, type Secret } from '@/core/secrets/secret'
import { adminDb } from '../db/admin-client'
import { callRpc } from '../db/rpc'
import { logger } from '../logger'

/**
 * Supabase Vault kao skladište kredencijala.
 *
 * Koristi servisnu rolu — jedinu koja sme da dođe do vrednosti tajne. To je
 * namerno i to je jedini razlog zbog kojeg admin klijent uopšte postoji u
 * ovom toku.
 *
 * Autorizacija se NE radi ovde. Pozivalac je već proverio, korisničkim
 * klijentom i kroz RLS, da sme da dira ovu integraciju. Podela je namerna:
 * ovaj modul odgovara na „gde je tajna", a ne na „sme li ovaj korisnik".
 * Kada bi radio oboje, provera bi postojala na dva mesta i vremenom bi se
 * razišle.
 */
export function vaultSecretsProvider(): SecretsProvider {
  return {
    async read(integrationId: string, organizationId: string): Promise<Secret | null> {
      const db = adminDb()

      const { data, error } = await callRpc(db, 'vault_read_integration_secret', {
        p_integration_id: integrationId,
        p_organization_id: organizationId,
      })

      if (error) {
        // Poruka iz baze ostaje u logu; pozivalac dobija samo „nema tajne".
        logger.error('Čitanje kredencijala nije uspelo', {
          component: 'secrets.vault',
          integrationId,
          organizationId,
          detail: error.message,
        })
        return null
      }

      const value = z.string().min(1).safeParse(data)
      return value.success ? secret(value.data) : null
    },

    async store(input): Promise<void> {
      const db = adminDb()

      const { error } = await callRpc(db, 'vault_store_integration_secret', {
        p_integration_id: input.integrationId,
        p_organization_id: input.organizationId,
        p_value: input.value,
        // Naznaka se računa ovde, da vrednost ne bi morala ponovo da se čita
        // samo radi prikaza u konzoli.
        p_hint: maskValue(input.value),
        p_auth_type: input.authType,
        p_expires_at: input.expiresAt ?? null,
      })

      if (error) {
        logger.error('Upis kredencijala nije uspeo', {
          component: 'secrets.vault',
          integrationId: input.integrationId,
          detail: error.message,
        })
        throw new Error('Kredencijal nije sačuvan.')
      }

      logger.info('Kredencijal integracije je sačuvan', {
        component: 'secrets.vault',
        integrationId: input.integrationId,
        organizationId: input.organizationId,
        authType: input.authType,
      })
    },
  }
}
