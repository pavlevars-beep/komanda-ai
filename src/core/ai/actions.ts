import type { IntentKey } from './question-matcher'
import type { Permission } from '../auth/permissions'

/**
 * Predložena sledeća radnja uz odgovor.
 *
 * Odgovor koji se završava brojem ostavlja rukovodiocu ceo posao — da sam
 * smisli šta sad. Predlog zatvara taj korak.
 *
 * Tri pravila:
 *
 * 1. Predlog VODI na stvaran tok koji postoji. Dugme koje izgleda funkcionalno
 *    a ne radi ništa je gore od izostanka dugmeta, jer se otkrije tek kada
 *    neko na njega računa.
 *
 * 2. Ništa se ne izvršava tiho. Predlog otvara pripremljen obrazac; šalje ga
 *    čovek. Ovo je granica između preporuke i radnje i ona se ne prelazi bez
 *    potvrde.
 *
 * 3. Predlog se ne nudi bez PRAVA da se izvrši. Ponuđena pa odbijena radnja
 *    je gora od neponuđene.
 */

export interface SuggestedAction {
  /** Ključ prevoda za tekst dugmeta. */
  readonly labelKey: string
  /** Putanja u radnom prostoru, bez prefiksa organizacije. */
  readonly href: string
  /** Unapred popunjena polja obrasca na odredištu. */
  readonly prefill?: Readonly<Record<string, string>>
  /** Bez ovog prava se predlog ne prikazuje. */
  readonly requires: Permission
}

/**
 * Radnja za nameru, ili `null` kada nijedna ne pripada.
 *
 * Namerno nema predloga za svaku nameru. Predlog uz „koliko imamo zaposlenih"
 * bio bi popunjavanje prostora — a spisak u kojem je pola stavki bez sadržaja
 * uči korisnika da ga preskoči.
 */
export function suggestedAction(intent: IntentKey): SuggestedAction | null {
  switch (intent) {
    case 'get_top_debtors':
      return {
        labelKey: 'action.requestCollection',
        href: '/poruke',
        prefill: {
          roles: 'sales',
          title: 'action.prefill.collection.title',
          body: 'action.prefill.collection.body',
        },
        requires: 'manage_alerts',
      }

    case 'get_outstanding_invoices':
      return {
        labelKey: 'action.requestInvoiceStatus',
        href: '/poruke',
        prefill: {
          roles: 'finance',
          title: 'action.prefill.invoices.title',
          body: 'action.prefill.invoices.body',
        },
        requires: 'manage_alerts',
      }

    case 'get_payables':
      return {
        labelKey: 'action.planPayments',
        href: '/poruke',
        prefill: {
          roles: 'finance',
          title: 'action.prefill.payables.title',
          body: 'action.prefill.payables.body',
        },
        requires: 'manage_alerts',
      }

    case 'get_inventory_alerts':
    case 'get_stock_status':
      return {
        labelKey: 'action.requestPurchase',
        href: '/poruke',
        prefill: {
          roles: 'manager',
          title: 'action.prefill.stock.title',
          body: 'action.prefill.stock.body',
        },
        requires: 'manage_alerts',
      }

    default:
      return null
  }
}

/** Predlog koji ovaj korisnik sme da izvrši, ili `null`. */
export function actionFor(
  intent: IntentKey,
  permissions: readonly Permission[],
): SuggestedAction | null {
  const action = suggestedAction(intent)
  if (!action) return null
  return permissions.includes(action.requires) ? action : null
}
