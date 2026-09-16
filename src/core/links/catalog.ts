/**
 * Javni servisi koji rukovodiocu trebaju uz sopstvene brojeve.
 *
 * Ovo su LINKOVI, ne podaci. Razlika je namerna i vidljiva u UI: sistem ne
 * tvrdi ništa o sadržaju sa druge strane, samo vodi do njega. Prikazivanje
 * tuđeg podatka kao svog tražilo bi da za njega odgovaramo — svežinom, tačnošću
 * i poreklom — a to je obaveza koju link ne nosi.
 *
 * Adrese su KORENI domena, ne duboke putanje. Putanje na državnim sajtovima se
 * menjaju bez najave, a pokvaren link je obećanje koje se prekršilo. Koren
 * preživljava preuređenje sajta; oznaka kaže šta se na njemu traži.
 */

export type LinkCategory = 'registry' | 'finance' | 'tax' | 'customs' | 'state'

/**
 * Gde je link NEPOSREDNO koristan.
 *
 * Link koji stoji tačno uz podatak zbog kojeg se otvara vredi više od istog
 * linka na spisku: kada rukovodilac gleda ko mu duguje, provera da li je tom
 * kupcu račun u blokadi je sledeći potez, a ne nešto što će potražiti kasnije.
 */
export type LinkContext = 'debtors' | 'payables' | 'stock'

export interface ExternalLink {
  readonly key: string
  readonly url: string
  readonly category: LinkCategory
  readonly context?: LinkContext
  /** Traži nalog ili elektronski sertifikat na drugoj strani. */
  readonly needsAccount?: boolean
}

export const EXTERNAL_LINKS: readonly ExternalLink[] = [
  /*
   * Registar privrednih subjekata i finansijski izveštaji.
   *
   * Prva provera pri novom kupcu: postoji li firma, ko je zastupnik, i kakav
   * joj je poslednji bilans. Odobravanje odloženog plaćanja bez toga je
   * pozajmica bez ijednog pitanja.
   */
  { key: 'apr', url: 'https://www.apr.gov.rs', category: 'registry', context: 'debtors' },

  /*
   * Prinudna naplata — računi u blokadi.
   *
   * Najkorisniji link u celom spisku, i zato stoji uz spisak dužnika. Kupac
   * čiji je račun u blokadi ne kasni sa plaćanjem — on ne MOŽE da plati, i to
   * menja potez: umesto još jednog poziva, ide se na obezbeđenje naplate.
   */
  { key: 'nbsBlocked', url: 'https://nbs.rs', category: 'finance', context: 'debtors' },

  /** Zvanični srednji kurs — merodavan za knjiženje i fakturisanje. */
  { key: 'nbsRates', url: 'https://nbs.rs', category: 'finance' },

  { key: 'purs', url: 'https://www.purs.gov.rs', category: 'tax', needsAccount: true },
  { key: 'euprava', url: 'https://euprava.gov.rs', category: 'state', needsAccount: true },
  { key: 'croso', url: 'https://www.croso.gov.rs', category: 'tax', needsAccount: true },

  /** Carinske stope i tarife — za one koji uvoze. */
  { key: 'carina', url: 'https://www.carina.rs', category: 'customs', context: 'stock' },

  /** Katastar — provera nepokretnosti kada se traži obezbeđenje naplate. */
  { key: 'rgz', url: 'https://www.rgz.gov.rs', category: 'registry', context: 'debtors' },
]

/** Linkovi koji stoje uz određeni podatak u proizvodu. */
export function linksFor(context: LinkContext): readonly ExternalLink[] {
  return EXTERNAL_LINKS.filter((link) => link.context === context)
}

/**
 * Spisak za prikaz, grupisan po vrsti servisa.
 *
 * Redosled grupa je stalan, ne po broju linkova: spisak koji se preuređuje pri
 * svakoj izmeni tera korisnika da svaki put traži isto mesto.
 */
const CATEGORY_ORDER: readonly LinkCategory[] = [
  'registry',
  'finance',
  'tax',
  'customs',
  'state',
]

export interface LinkGroup {
  readonly category: LinkCategory
  readonly links: readonly ExternalLink[]
}

export function groupedLinks(): readonly LinkGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    links: EXTERNAL_LINKS.filter((link) => link.category === category),
  })).filter((group) => group.links.length > 0)
}
