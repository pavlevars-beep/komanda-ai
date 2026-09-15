import type { Permission } from '../auth/permissions'
import { briefSections, type BriefSection } from './focus'

/**
 * Lični izbor odeljaka brifa.
 *
 * Redosled po roli je dobra POLAZNA tačka, ne konačna: nabavka u jednoj firmi
 * prvo gleda zalihe, u drugoj obaveze. Pogađanje po roli to ne može da zna, a
 * korisnik zna.
 *
 * PRILAGOĐAVANJE NIJE PRISTUP. Skriven odeljak je izbor prikaza; odeljak koji
 * korisnik ne sme da vidi uklanjaju prava i RLS, uzvodno. Da se vidljivost
 * odlučuje ovde, postojala bi zaštita koju je dovoljno preurediti da bi
 * popustila — zato otkrivanje skrivenog odeljka nikada ne daje pristup.
 *
 * Odeljak „zahteva pažnju" se NE podešava. On je razlog zbog kojeg brif
 * postoji; mogućnost da se ugasi bila bi mogućnost da se proizvod isključi a
 * da i dalje izgleda kao da radi.
 */

export interface BriefPreference {
  /** Redosled koji je korisnik postavio. Sme da bude nepotpun. */
  readonly order: readonly BriefSection[]
  /** Odeljci koje je korisnik sklonio sa svog brifa. */
  readonly hidden: readonly BriefSection[]
}

export function resolveBriefSections(
  preference: BriefPreference | null,
  memberRole: string | null,
  permissions: readonly Permission[],
): readonly BriefSection[] {
  // Prava se primenjuju PRVA i nezavisno od izbora. Sve što sledi može samo da
  // preuredi ili skrati ovaj spisak, nikad da ga proširi.
  const allowed = briefSections(memberRole, permissions)
  if (!preference) return allowed

  const wanted = preference.order.filter((section) => allowed.includes(section))

  /*
   * Odeljak koji korisnik nikad nije video ide na KRAJ, ne ispada.
   *
   * Kada se sutra doda nov odeljak, korisnik sa zapamćenim izborom ga nema u
   * svom redosledu. Da se prikazuje samo ono što je izabrano, novi odeljak bi
   * zauvek bio nevidljiv baš onima koji proizvod najduže koriste — i niko ne bi
   * prijavio da nedostaje, jer se ne zna da postoji.
   */
  const rest = allowed.filter((section) => !wanted.includes(section))

  const hidden = new Set(preference.hidden)
  return [...wanted, ...rest].filter((section) => !hidden.has(section))
}

/**
 * Izbor za prikaz na ekranu podešavanja: svaki DOZVOLJEN odeljak, redom, sa
 * oznakom da li je uključen.
 *
 * Ekran mora da prikaže i skrivene odeljke — inače se skrivanje ne može
 * poništiti, a podešavanje koje se ne vraća unazad korisnik s pravom izbegava.
 */
export interface SectionChoice {
  readonly section: BriefSection
  readonly visible: boolean
}

export function briefChoices(
  preference: BriefPreference | null,
  memberRole: string | null,
  permissions: readonly Permission[],
): readonly SectionChoice[] {
  const allowed = briefSections(memberRole, permissions)
  if (!preference) return allowed.map((section) => ({ section, visible: true }))

  const wanted = preference.order.filter((section) => allowed.includes(section))
  const rest = allowed.filter((section) => !wanted.includes(section))
  const hidden = new Set(preference.hidden)

  return [...wanted, ...rest].map((section) => ({
    section,
    visible: !hidden.has(section),
  }))
}
