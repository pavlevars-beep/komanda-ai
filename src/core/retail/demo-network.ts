import type { LocationPerformance, ProductSale, RetailLocation } from './network'

/**
 * Demo mreža prodajnih mesta.
 *
 * Artikli su prave kategorije iz asortimana okova i profila — šarke, klizači,
 * lajsne, LED profili. Ranije su u demou stajali brašno i ulje, što je vlasniku
 * koji prodaje okov govorilo da program nije ni pogledao čime se on bavi.
 *
 * Podaci su IZMIŠLJENI i uvek nose oznaku demo. Deterministički su: isti ulaz
 * daje isti izlaz, jer demo koji se menja pri svakom osvežavanju izgleda kao
 * kvar i ne može se tvrditi ništa u testu.
 */

/*
 * Koordinate su prave, iz javnih izvora. Na karti se vidi odmah ako nisu —
 * Kruševac severno od Jagodine bi svaki trgovac primetio pre prve brojke.
 */
export const DEMO_LOCATIONS: readonly RetailLocation[] = [
  {
    id: 'bg-obrenovacki',
    city: 'Beograd',
    label: 'Beograd — Obrenovački drum',
    country: 'RS',
    longitude: 20.4,
    latitude: 44.756,
    currency: 'RSD',
  },
  {
    id: 'bg-novi-beograd',
    city: 'Beograd',
    label: 'Beograd — Novi Beograd',
    country: 'RS',
    longitude: 20.404,
    latitude: 44.818,
    currency: 'RSD',
  },
  {
    id: 'subotica',
    city: 'Subotica',
    label: 'Subotica',
    country: 'RS',
    longitude: 19.665,
    latitude: 46.1,
    currency: 'RSD',
  },
  {
    id: 'nis',
    city: 'Niš',
    label: 'Niš',
    country: 'RS',
    longitude: 21.896,
    latitude: 43.321,
    currency: 'RSD',
  },
  {
    id: 'jagodina',
    city: 'Jagodina',
    label: 'Jagodina',
    country: 'RS',
    longitude: 21.261,
    latitude: 43.977,
    currency: 'RSD',
  },
  {
    id: 'krusevac',
    city: 'Kruševac',
    label: 'Kruševac',
    country: 'RS',
    longitude: 21.327,
    latitude: 43.58,
    currency: 'RSD',
  },
  {
    id: 'banja-luka',
    city: 'Banja Luka',
    label: 'Banja Luka',
    country: 'BA',
    longitude: 17.191,
    latitude: 44.772,
    currency: 'BAM',
  },
  {
    id: 'podgorica',
    city: 'Podgorica',
    label: 'Podgorica',
    country: 'ME',
    longitude: 19.263,
    latitude: 42.441,
    currency: 'EUR',
  },
]

/** Asortiman: prave kategorije okova i profila, sa jedinicom mere. */
const CATALOG: readonly { readonly name: string; readonly unit: string }[] = [
  { name: 'Šarka za drvene frontove, sa usporivačem', unit: 'kom' },
  { name: 'Klizač za fioke, puni izvlak 450 mm', unit: 'par' },
  { name: 'Aluminijumska lajsna za pod 25 mm', unit: 'm' },
  { name: 'LED profil ugradni, elox', unit: 'm' },
  { name: 'Podizni mehanizam za front', unit: 'kom' },
  { name: 'Dekorativna ručica, crna mat 160 mm', unit: 'kom' },
  { name: 'Točkić za nameštaj sa kočnicom', unit: 'kom' },
  { name: 'Lajsna za završetak pločica 10 mm', unit: 'm' },
  { name: 'Okov za klizna vrata, set', unit: 'set' },
  { name: 'Bravica za drvene frontove', unit: 'kom' },
]

/** mulberry32 — isti generator kao u demo skupu podataka, zbog ponovljivosti. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/*
 * Veličina mesta. Beograd nosi najviše, Podgorica najmanje — to je oblik koji
 * svaka ovakva mreža ima, i demo koji ga nema izgleda kao nasumični brojevi.
 */
const SCALE: Record<string, number> = {
  'bg-obrenovacki': 1,
  'bg-novi-beograd': 0.72,
  nis: 0.58,
  subotica: 0.47,
  jagodina: 0.34,
  krusevac: 0.31,
  'banja-luka': 0.29,
  podgorica: 0.22,
}

/*
 * Osnovni dnevni promet po valuti.
 *
 * Nije isti broj podeljen kursom, nego red veličine kakav se u toj zemlji
 * stvarno vidi — inače bi iznos u evrima ispao smešno velik ili mali.
 */
const DAILY_BASE: Record<string, number> = { RSD: 620_000, BAM: 5_200, EUR: 2_650 }

function productsFor(location: RetailLocation, random: () => number): ProductSale[] {
  // Svako mesto ima svoj redosled asortimana: u Subotici se ne prodaje isto
  // što i u Nišu, i baš to vlasnik traži na ovom ekranu.
  const ranked = [...CATALOG]
    .map((item) => ({ item, weight: random() }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)

  const scale = SCALE[location.id] ?? 0.3
  const unitPrice = location.currency === 'RSD' ? 1 : location.currency === 'BAM' ? 0.0085 : 0.0085

  return ranked.map(({ item }, index) => {
    const quantity = Math.round((520 - index * 95) * scale * (0.8 + random() * 0.45))
    const perUnit = (140 + random() * 900) * unitPrice
    return {
      name: item.name,
      unit: item.unit,
      quantity,
      revenue: (quantity * perUnit).toFixed(2),
    }
  })
}

/**
 * Stanje mreže na dati dan.
 *
 * `daysIntoMonth` određuje promet od početka meseca, a prethodni period se
 * računa na ISTI broj dana — pun prethodni mesec bi uvek izgledao veći i svaki
 * početak meseca bi lažno prijavljivao pad.
 */
export function demoNetwork(orgId: string, today: Date): LocationPerformance[] {
  const daysIntoMonth = today.getUTCDate()

  return DEMO_LOCATIONS.map((location) => {
    const random = prng(hash(`${orgId}:${location.id}:${today.getUTCFullYear()}`))
    const scale = SCALE[location.id] ?? 0.3
    const base = (DAILY_BASE[location.currency] ?? 1000) * scale

    /*
     * Smer promene je zadat po mestu, ne prepušten slučaju.
     *
     * Sa dva nezavisna slučajna broja ispadalo je da svih osam objekata pada u
     * odnosu na prošli mesec — demo koji izgleda kao firma pred zatvaranje.
     * Ovako mreža ima i rast i pad, što je i realnije i korisnije za razgovor.
     */
    const trend: Record<string, number> = {
      'bg-obrenovacki': 1.06,
      'bg-novi-beograd': 0.94,
      nis: 1.11,
      subotica: 1.03,
      jagodina: 0.91,
      krusevac: 1.02,
      'banja-luka': 1.08,
      podgorica: 0.96,
    }

    const monthToDate = base * daysIntoMonth * (0.9 + random() * 0.24)
    const previousPeriod = monthToDate / (trend[location.id] ?? 1)

    /*
     * Marža se razlikuje po mestu, i to je poenta ovog ekrana.
     *
     * Niš je namerno postavljen na veliki promet sa slabom maržom: to je slučaj
     * zbog kojeg se karta i gleda — veliki krug koji ne zarađuje. Bez takvog
     * mesta u demou, prikaz izgleda lepo a ne pokazuje ništa.
     */
    const marginBase: Record<string, number> = {
      'bg-obrenovacki': 21.4,
      'bg-novi-beograd': 19.8,
      nis: 12.6,
      subotica: 23.1,
      jagodina: 18.2,
      krusevac: 20.5,
      'banja-luka': 24.3,
      podgorica: 16.1,
    }

    const marginPercent =
      Math.round(((marginBase[location.id] ?? 18) + (random() - 0.5) * 1.6) * 10) / 10

    const averageBasket = location.currency === 'RSD' ? 8_400 : location.currency === 'BAM' ? 72 : 36

    return {
      ...location,
      monthToDate: monthToDate.toFixed(2),
      previousPeriod: previousPeriod.toFixed(2),
      marginPercent,
      transactions: Math.round(monthToDate / averageBasket),
      topProducts: productsFor(location, random),
    }
  })
}
