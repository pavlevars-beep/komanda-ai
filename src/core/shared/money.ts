/**
 * Novac se nikad ne predstavlja brojem sa pokretnim zarezom.
 * Iznos je string decimalne vrednosti (kako ga vraća Postgres numeric),
 * a valuta je uvek eksplicitna — nikad podrazumevana u kodu.
 */

export interface Money {
  readonly amount: string
  readonly currency: string
}

export function money(amount: string | number, currency: string): Money {
  return { amount: typeof amount === 'number' ? amount.toFixed(4) : amount, currency }
}

export function formatMoney(value: Money, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    maximumFractionDigits: 2,
  }).format(Number(value.amount))
}
