import type { Permission } from '../auth/permissions'

/**
 * Šta koju ulogu prvo zanima.
 *
 * Nabavka i direktor gledaju isti brif, ali ne istim redom. Nabavci su zalihe
 * prva stvar ujutru; direktoru je prodaja. Isti spisak u istom redosledu za
 * sve znači da polovina korisnika svaki dan skroluje pored onoga što ih ne
 * zanima — a to je tačno ono trenje koje proizvod treba da ukloni.
 *
 * Redosled NIJE pristup. Odeljak koji korisnik ne sme da vidi ne uklanja se
 * ovde nego pravima i RLS-om, uzvodno. Da se vidljivost odlučuje redosledom,
 * postojala bi zaštita koju je dovoljno preurediti da bi popustila.
 */

export type BriefSection = 'sales' | 'receivables' | 'debtors' | 'payables' | 'stock'

/** Prava bez kojih odeljak nema šta da prikaže. */
const SECTION_PERMISSION: Record<BriefSection, Permission> = {
  sales: 'view_sales',
  receivables: 'view_financial_data',
  debtors: 'view_financial_data',
  payables: 'view_financial_data',
  stock: 'view_inventory',
}

/**
 * Redosled po roli.
 *
 * Rola koja nije na spisku dobija redosled za direktora. To je namerno šire, a
 * ne uže: nepoznata rola je najčešće nova rola klijenta, i bolje je da vidi
 * previše nego da joj nešto tiho nedostaje. Prava i dalje uklanjaju sve što
 * ne sme da vidi.
 */
const ORDER_BY_ROLE: Record<string, readonly BriefSection[]> = {
  client_owner: ['sales', 'receivables', 'payables', 'debtors', 'stock'],
  client_admin: ['sales', 'receivables', 'payables', 'debtors', 'stock'],
  manager: ['sales', 'receivables', 'debtors', 'stock', 'payables'],
  sales: ['sales', 'debtors', 'receivables', 'stock', 'payables'],
  finance: ['receivables', 'payables', 'debtors', 'sales', 'stock'],
  procurement: ['stock', 'payables', 'sales', 'receivables', 'debtors'],
  employee: ['sales', 'stock', 'receivables', 'debtors', 'payables'],
  viewer: ['sales', 'receivables', 'debtors', 'payables', 'stock'],
}

const DEFAULT_ORDER = ORDER_BY_ROLE.client_owner!

/**
 * Odeljci brifa, redom, za ovog korisnika.
 *
 * Osoblje Delta Pro u sesiji pristupa nema rolu u klijentovoj organizaciji i
 * dobija pun redosled — ono gleda ceo brif radi dijagnostike, ne radi
 * svakodnevnog rada.
 */
export function briefSections(
  memberRole: string | null,
  permissions: readonly Permission[],
): readonly BriefSection[] {
  const order = (memberRole && ORDER_BY_ROLE[memberRole]) || DEFAULT_ORDER
  return order.filter((section) => permissions.includes(SECTION_PERMISSION[section]))
}
