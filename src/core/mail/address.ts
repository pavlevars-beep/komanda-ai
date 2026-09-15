import { randomBytes } from 'node:crypto'

/**
 * Namenska adresa po izvoru podataka.
 *
 * Oblik je `uvoz+<token>@domen`. Plus-adresiranje je standardno i skoro svi
 * dobavljači pošte ga rutiraju na isto sanduče, pa jedno stvarno sanduče nosi
 * koliko god adresa — bez otvaranja naloga po klijentu.
 *
 * Token NIJE tajna u punom smislu. Stoji u podešavanjima tuđeg ERP-a, prolazi
 * kroz njihove logove i kroz svaki mejl server na putu. Zato pristup NE zavisi
 * od njega: adresa kaže KOJI izvor puni, a spisak dozvoljenih pošiljalaca i
 * provera autentičnosti odlučuju SME LI se puniti.
 */

const PREFIX = 'uvoz'

/** 128 bita. Kraće bi bilo pogađanje izvodljivo, duže samo teže za prepisivanje. */
export function newMailToken(): string {
  return randomBytes(16).toString('hex')
}

export function isMailToken(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function mailAddress(token: string, domain: string): string {
  return `${PREFIX}+${token}@${domain}`
}

/**
 * Token iz adrese primaoca.
 *
 * Domen se namerno NE proverava ovde: dobavljač pošte ume da prosledi adresu u
 * drugom domenu (alias, preusmerenje), a provera domena bi tada odbila ispravnu
 * poruku. Ono što mora da se poklopi je token, i on se traži u bazi.
 */
export function tokenFromAddress(to: string): string | null {
  const address = extractAddress(to)
  if (!address) return null

  const at = address.lastIndexOf('@')
  if (at <= 0) return null

  const local = address.slice(0, at)
  const plus = local.indexOf('+')
  if (plus < 0) return null

  if (local.slice(0, plus).toLowerCase() !== PREFIX) return null

  const token = local.slice(plus + 1).toLowerCase()
  return isMailToken(token) ? token : null
}

/**
 * Gola adresa iz zaglavlja.
 *
 * Zaglavlje retko nosi samo adresu: češće je `"ERP Sistem" <erp@firma.rs>`.
 * Poređenje sa spiskom dozvoljenih nad celim zaglavljem bi promašilo svaki put
 * kada pošiljalac ima ime — a ime ima gotovo svaki ERP.
 */
export function extractAddress(header: string): string | null {
  const trimmed = header.trim()
  if (trimmed === '') return null

  const open = trimmed.lastIndexOf('<')
  const close = trimmed.lastIndexOf('>')
  const raw = open >= 0 && close > open ? trimmed.slice(open + 1, close) : trimmed

  const address = raw.trim().toLowerCase()
  // Jedna tačno jedna „majmunska" i nešto sa obe strane. Bez ovoga bi prazan
  // domen prošao i poklopio se sa pravilom za domen.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null
}

export function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@')
  return at > 0 ? address.slice(at + 1) : null
}
