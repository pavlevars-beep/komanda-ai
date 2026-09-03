'use client'

import { useState } from 'react'

/**
 * Logotip klijenta koji ne ostavlja polomljenu sliku.
 *
 * Kada se slika ne učita — pogrešna adresa, obrisan fajl, blokiran domen —
 * pregledač prikaže ikonicu slomljene slike i alternativni tekst pored nje.
 * To izgleda kao kvar proizvoda, a ne kao izostanak logotipa; upravo tako je i
 * izgledalo kada je CSP blokirala domen skladišta.
 *
 * Zato se pri grešci slika UKLANJA. Naziv organizacije stoji ispod nje i tako
 * ostaje jedini nosilac identiteta — što je ispravno stanje kada logotipa
 * nema.
 *
 * `alt` je namerno prazan: naziv je već ispisan tik uz sliku, pa bi ga čitač
 * ekrana inače pročitao dvaput.
 */
export function BrandLogo({ src, className }: { src: string; className?: string | undefined }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  // Namerno obično <img>, ne next/image: adresa je na domenu skladišta i menja
  // se po klijentu, pa bi optimizator tražio spisak domena koji se održava
  // ručno i tiho obara slike kada se ne ažurira.
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />
}
