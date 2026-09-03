import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import {
  DEFAULT_BUSINESS_RULES,
  resolveBusinessRules,
  type BusinessRules,
} from './business-rules'

/**
 * Poslovna pravila organizacije.
 *
 * Kada red ne postoji ili je neispravan, vraćaju se podrazumevane vrednosti.
 * Greška ovde NE sme da obori brif: pragovi su podešavanje, a brif je ono
 * zbog čega korisnik otvara stranicu.
 */
export async function businessRulesFor(
  db: Db,
  organizationId: string,
): Promise<BusinessRules> {
  const { data, error } = await db
    .from('organization_business_rules')
    .select('rules')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error || !data) return DEFAULT_BUSINESS_RULES

  const row = data as { rules?: unknown }
  return resolveBusinessRules(row.rules ?? null)
}

/**
 * Upis pragova.
 *
 * Upisuje se SAMO proveren skup. Bez toga bi neispravan red prošao u bazu, a
 * čitanje bi ga tiho zamenilo podrazumevanim — korisnik bi video vrednost koju
 * nije uneo i nikad ne bi saznao zašto.
 */
export async function saveBusinessRules(
  db: Db,
  organizationId: string,
  rules: BusinessRules,
  updatedBy: string,
): Promise<Result<true>> {
  const { error } = await db.from('organization_business_rules').upsert(
    {
      organization_id: organizationId,
      rules,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  )

  if (error) {
    return err(domainError('forbidden', 'rules.error.saveFailed', { detail: error.message }))
  }
  return ok(true)
}
