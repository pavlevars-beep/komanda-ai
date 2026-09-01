import type { DashboardCard } from './loader'

/**
 * Formatiranje vrednosti kartice.
 *
 * Radi se na serveru, sa lokalom organizacije, da bi vrednost bila ista u
 * HTML-u koji stigne i posle hidracije. Kada bi formatiranje bilo u browseru,
 * server i klijent bi mogli da se raziđu na razdvajaču hiljada.
 *
 * Veliki brojevi se skraćuju (2,4 mil.) jer je poenta kartice da se pročita u
 * jednom pogledu. Pun iznos se vidi u izveštaju, gde i pripada.
 */

const COMPACT_THRESHOLD = 100_000

export function formatCardValue(card: DashboardCard, intlLocale: string): string | undefined {
  if (card.value === undefined) return undefined

  const numeric = Number(card.value)
  if (!Number.isFinite(numeric)) return card.value

  if (card.format === 'money') {
    const currency = card.currency ?? 'RSD'
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      // Iznosi u dinarima brzo pređu milion; skraćivanje čuva čitljivost.
      ...(Math.abs(numeric) >= COMPACT_THRESHOLD
        ? { notation: 'compact' as const, maximumFractionDigits: 1 }
        : { maximumFractionDigits: 0 }),
    }).format(numeric)
  }

  if (card.format === 'percent') {
    return new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(numeric / 100)
  }

  return new Intl.NumberFormat(intlLocale, {
    ...(Math.abs(numeric) >= COMPACT_THRESHOLD
      ? { notation: 'compact' as const, maximumFractionDigits: 1 }
      : {}),
  }).format(numeric)
}

/** Promena se uvek prikazuje sa znakom — bez njega se ne vidi smer. */
export function formatChange(
  changePercent: number | undefined,
  intlLocale: string,
): string | undefined {
  if (changePercent === undefined) return undefined
  return new Intl.NumberFormat(intlLocale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(changePercent / 100)
}
