import type { Db } from '@/server/db/types'
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
