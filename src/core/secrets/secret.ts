/**
 * Tajna koja se ne može slučajno ispisati.
 *
 * Kredencijali prolaze kroz mnogo koda: logove, poruke o greškama, telemetriju,
 * `JSON.stringify` u nekom pomoćnom modulu. Običan `string` u svakom od tih
 * mesta procuri u celini.
 *
 * Ovaj tip vraća `[REDACTED]` iz `toString()`, `toJSON()` i iz inspekcije u
 * Node-u. Do prave vrednosti se dolazi samo eksplicitnim pozivom `.reveal()`,
 * koji je lako uočiti u pregledu koda i lako pretražiti.
 */

const REDACTED = '[REDACTED]'
const VALUE = Symbol('secret.value')

export interface Secret {
  reveal(): string
  /** Kratka naznaka za prikaz, npr. `sk-••••4f2a`. Bezbedna za ispis. */
  hint(): string
  toString(): string
  toJSON(): string
}

export function secret(value: string): Secret {
  const holder = { [VALUE]: value }

  const api: Secret = {
    reveal: () => holder[VALUE],
    hint: () => maskValue(holder[VALUE]),
    toString: () => REDACTED,
    toJSON: () => REDACTED,
  }

  // Node ispisuje objekte kroz ovaj simbol; bez njega bi console.log otkrio sadržaj.
  Object.defineProperty(api, Symbol.for('nodejs.util.inspect.custom'), {
    value: () => REDACTED,
    enumerable: false,
  })

  return Object.freeze(api)
}

/**
 * Naznaka koja korisniku pomaže da prepozna kredencijal, a napadaču ne pomaže.
 * Prikazuje se prefiks (ako postoji) i poslednja četiri znaka.
 */
export function maskValue(value: string): string {
  if (value.length <= 8) return '••••'

  const prefixMatch = /^([A-Za-z]{2,6}[-_])/.exec(value)
  const prefix = prefixMatch?.[1] ?? ''
  const tail = value.slice(-4)

  return `${prefix}••••${tail}`
}

export function isSecret(value: unknown): value is Secret {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reveal' in value &&
    typeof (value as Secret).reveal === 'function'
  )
}
