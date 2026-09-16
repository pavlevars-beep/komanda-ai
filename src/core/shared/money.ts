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

export interface MoneyParts {
  /** Iznos bez valute, oblikovan po jeziku. */
  readonly value: string
  /** Sama oznaka valute („RSD", „€"). */
  readonly unit: string
}

/**
 * Isti iznos, rastavljen na brojku i oznaku valute.
 *
 * Postoji zato što kartica prikazuje to dvoje u dve veličine: krupna brojka,
 * sitna valuta. Bez rastavljanja „RSD" u punoj veličini otme trećinu kartice i
 * gurne iznos u drugi red.
 *
 * Rastavljanje ide kroz `formatToParts`, NE kroz sečenje gotove niske. Dva
 * razloga: u nekim jezicima valuta stoji ispred broja, a i brojka mora da
 * ostane ista kao ona koju daje `formatMoney` — inače isti podatak na dva mesta
 * jednog dana ispadne različit.
 */
export function splitMoney(
  amount: string | number,
  currency: string,
  locale: string,
  maximumFractionDigits = 0,
): MoneyParts {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).formatToParts(Number(amount))

  return {
    value: parts
      .filter((part) => part.type !== 'currency')
      .map((part) => part.value)
      .join('')
      .trim(),
    unit: parts
      .filter((part) => part.type === 'currency')
      .map((part) => part.value)
      .join(''),
  }
}
