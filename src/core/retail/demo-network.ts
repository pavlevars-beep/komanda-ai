import type {
  LocationPerformance,
  MonthlyPoint,
  ProductLine,
  RetailLocation,
} from './network'

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

/**
 * Asortiman: prave kategorije okova i profila.
 *
 * `margin` i `leadTimeDays` su po artiklu, ne po objektu — i to je poenta.
 * Okov iz uvoza stiže tri nedelje i nosi slabiju maržu; lajsne se seku ovde,
 * stižu za dan i nose bolju. Bez te razlike svaka analiza po artiklu daje isti
 * broj za sve i ne pokazuje ništa.
 */
const CATALOG: readonly {
  readonly sku: string
  readonly name: string
  readonly unit: string
  readonly margin: number
  readonly leadTimeDays: number
  /** Koliko se brzo obrće: 1 je dnevna roba, 0.05 je artikal za po narudžbini. */
  readonly velocity: number
}[] = [
  { sku: 'OK-1201', name: 'Šarka za drvene frontove, sa usporivačem', unit: 'kom', margin: 24, leadTimeDays: 14, velocity: 1 },
  { sku: 'KL-4450', name: 'Klizač za fioke, puni izvlak 450 mm', unit: 'par', margin: 21, leadTimeDays: 21, velocity: 0.82 },
  { sku: 'AL-2025', name: 'Aluminijumska lajsna za pod 25 mm', unit: 'm', margin: 31, leadTimeDays: 3, velocity: 0.74 },
  { sku: 'LED-0810', name: 'LED profil ugradni, elox', unit: 'm', margin: 28, leadTimeDays: 5, velocity: 0.61 },
  { sku: 'PM-3300', name: 'Podizni mehanizam za front', unit: 'kom', margin: 12, leadTimeDays: 28, velocity: 0.55 },
  { sku: 'RU-1600', name: 'Dekorativna ručica, crna mat 160 mm', unit: 'kom', margin: 34, leadTimeDays: 10, velocity: 0.9 },
  { sku: 'TO-0500', name: 'Točkić za nameštaj sa kočnicom', unit: 'kom', margin: 19, leadTimeDays: 14, velocity: 0.48 },
  { sku: 'LP-1010', name: 'Lajsna za završetak pločica 10 mm', unit: 'm', margin: 29, leadTimeDays: 3, velocity: 0.43 },
  { sku: 'KV-7000', name: 'Okov za klizna vrata, set', unit: 'set', margin: 15, leadTimeDays: 35, velocity: 0.22 },
  { sku: 'BR-0300', name: 'Bravica za drvene frontove', unit: 'kom', margin: 26, leadTimeDays: 14, velocity: 0.35 },
  { sku: 'OK-1890', name: 'Šarka za staklene frontove, inox', unit: 'kom', margin: 18, leadTimeDays: 42, velocity: 0.08 },
  { sku: 'AP-6000', name: 'Akustični panel orah 600×600', unit: 'm²', margin: 33, leadTimeDays: 21, velocity: 0.05 },
  { sku: 'UT-0220', name: 'Utičnica za radnu ploču, dupla', unit: 'kom', margin: 22, leadTimeDays: 28, velocity: 0.06 },
  { sku: 'KO-4400', name: 'Korpa za otpatke ugradna 40 l', unit: 'kom', margin: 27, leadTimeDays: 35, velocity: 0.04 },
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

function productsFor(
  location: RetailLocation,
  random: () => number,
  daysIntoMonth: number,
  marginFactor: number,
): ProductLine[] {
  const scale = SCALE[location.id] ?? 0.3
  // Iznosi u stranoj valuti nisu dinari podeljeni kursom nego sopstveni red
  // veličine — inače bi cene u evrima ispale besmislene.
  const price = location.currency === 'RSD' ? 1 : 0.0085

  /*
   * Redosled asortimana se razlikuje po objektu.
   *
   * U Subotici se ne prodaje isto što i u Nišu, i baš to vlasnik traži na ovom
   * ekranu. Pomeraj je mali (±25%) da bi asortiman ostao prepoznatljiv kao
   * asortiman jedne firme, a ne kao nasumičan spisak.
   */
  return CATALOG.map((item) => {
    const localVelocity = item.velocity * (0.75 + random() * 0.5)
    const perUnit = (140 + random() * 900) * price

    const dailyUnits = 18 * localVelocity * scale
    const soldQuantity = Math.round(dailyUnits * daysIntoMonth)
    const revenue = soldQuantity * perUnit

    /*
     * Zaliha se drži prema tempu prodaje, ne nasumično.
     *
     * Brza roba stoji dvadesetak dana, spora mesecima — tako i jeste, i tek
     * tada mrtav novac u analizi znači nešto. Nabavna vrednost je prodajna
     * umanjena za maržu.
     */
    /*
     * Raspon pokrivenosti mora da SEČE rok isporuke, inače analiza nema šta da
     * nađe.
     *
     * Prva verzija je svakom artiklu davala najmanje osamnaest dana zalihe, a
     * rokovi isporuke idu od tri do četrdeset dva — pa nijedan artikal nikad
     * nije bio u riziku i ceo odeljak je uvek pisao „sve je u redu". U pravoj
     * radnji je obrnuto: baš najbrža roba se drži najkraće, jer stalno ide.
     */
    const coverDays = 6 + (1 - localVelocity) * 160 * (0.7 + random() * 0.6)
    const onHand = Math.max(0, Math.round(dailyUnits * coverDays))
    const costPerUnit = perUnit * (1 - item.margin / 100)

    /*
     * Dani od poslednje prodaje: brza roba se prodaje danas, spora pre više
     * meseci. Bez tog raspona mrtvog novca nema, pa ni analize koja ga nalazi.
     */
    const lastSoldDaysAgo =
      localVelocity > 0.3
        ? Math.round(random() * 3)
        : Math.round(60 + (0.3 - localVelocity) * 900 * (0.6 + random() * 0.8))

    return {
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      soldQuantity,
      revenue: revenue.toFixed(2),
      /*
       * Marža artikla nosi ČINILAC OBJEKTA.
       *
       * Bez toga je marža objekta stajala kao zaseban broj pored tabele u kojoj
       * nijedan artikal nije slab — ekran koji sam sebi protivreči, i to na
       * mestu gde vlasnik prvo gleda. Sada se marža objekta izvodi iz artikala,
       * pa „ovo mesto slabo zarađuje" ima gde da se vidi i po čemu.
       */
      marginPercent: Math.round((item.margin * marginFactor + (random() - 0.5) * 2) * 10) / 10,
      onHand,
      stockValue: (onHand * costPerUnit).toFixed(2),
      averageDailySales: Math.round(dailyUnits * 100) / 100,
      leadTimeDays: item.leadTimeDays,
      lastSoldDaysAgo,
    }
  })
}

/*
 * Sezonski oblik godine.
 *
 * Trgovina okovom i profilima ide za građevinom: zima stoji, proleće i jesen
 * vuku. Bez tog oblika mesečni niz izgleda kao šum, a poređenje sa istim
 * mesecom prošle godine — koje je jedino pošteno u sezonskom poslu — nema šta
 * da pokaže.
 *
 * Indeks po mesecima, januar prvi.
 */
const SEASON = [0.68, 0.72, 0.94, 1.12, 1.24, 1.18, 1.02, 0.96, 1.21, 1.26, 1.05, 0.82]

/** Mesečna istorija: dvadeset pet meseci, da se vidi i ista sezona lane. */
function historyFor(
  location: RetailLocation,
  random: () => number,
  today: Date,
  monthlyBase: number,
): MonthlyPoint[] {
  const points: MonthlyPoint[] = []

  /*
   * Dvadeset pet meseci, ne dvanaest.
   *
   * Za poređenje tekućeg meseca sa istim mesecom prošle godine treba puna
   * godina PRE najstarijeg meseca koji se prikazuje. Sa dvanaest meseci
   * najstariji mesec nema par i poređenje počinje tek na sredini grafikona.
   *
   * Tekući mesec se IZOSTAVLJA: nepotpun mesec pored punih izgleda kao pad.
   */
  for (let back = 25; back >= 1; back--) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1))
    const monthIndex = date.getUTCMonth()
    const season = SEASON[monthIndex] ?? 1

    // Blag godišnji rast, pa prošla godina nije prosta kopija ove.
    const growth = 1 + (25 - back) * 0.004
    const noise = 0.93 + random() * 0.14

    points.push({
      month: `${date.getUTCFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`,
      total: (monthlyBase * season * growth * noise).toFixed(2),
      marginPercent:
        Math.round(24 * (MARGIN_FACTOR[location.id] ?? 0.8) * (0.94 + random() * 0.12) * 10) / 10,
    })
  }

  return points
}

/*
 * Činilac marže po objektu, ne gotov procenat.
 *
 * Niš je namerno slab: to je slučaj zbog kojeg se karta i gleda — veliki krug
 * koji ne zarađuje. Ali taj podatak NE stoji sam: množi maržu svakog artikla u
 * tom objektu, pa se marža objekta izvodi iz artikala. Tek tada „ovo mesto
 * slabo zarađuje" ima gde da se proveri, umesto da bude broj koji protivreči
 * tabeli ispod sebe.
 */
const MARGIN_FACTOR: Record<string, number> = {
  'bg-obrenovacki': 0.88,
  'bg-novi-beograd': 0.81,
  nis: 0.52,
  subotica: 0.95,
  jagodina: 0.75,
  krusevac: 0.84,
  'banja-luka': 1.0,
  podgorica: 0.66,
}

/*
 * Smer promene je zadat po objektu, ne prepušten slučaju.
 *
 * Sa dva nezavisna slučajna broja ispadalo je da svih osam objekata pada u
 * odnosu na prošli mesec — demo koji izgleda kao firma pred zatvaranje.
 */
const TREND: Record<string, number> = {
  'bg-obrenovacki': 1.06,
  'bg-novi-beograd': 0.94,
  nis: 1.11,
  subotica: 1.03,
  jagodina: 0.91,
  krusevac: 1.02,
  'banja-luka': 1.08,
  podgorica: 0.96,
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

    const monthToDate = base * daysIntoMonth * (0.9 + random() * 0.24)
    const previousPeriod = monthToDate / (TREND[location.id] ?? 1)

    const products = productsFor(
      location,
      random,
      daysIntoMonth,
      MARGIN_FACTOR[location.id] ?? 0.8,
    )

    /*
     * Marža objekta je PONDERISANI PROSEK marži njegovih artikala.
     *
     * Nije zaseban broj. Da jeste, ekran bi mogao da tvrdi da objekat slabo
     * zarađuje dok u tabeli ispod nijedan artikal nije slab — a to je prva
     * nedoslednost koju vlasnik primeti i posle koje ne veruje ostatku.
     */
    const productRevenue = products.reduce((sum, p) => sum + Number(p.revenue), 0)
    const marginPercent =
      productRevenue > 0
        ? Math.round(
            (products.reduce((sum, p) => sum + p.marginPercent * Number(p.revenue), 0) /
              productRevenue) *
              10,
          ) / 10
        : 0

    const averageBasket = location.currency === 'RSD' ? 8_400 : location.currency === 'BAM' ? 72 : 36

    return {
      ...location,
      monthToDate: monthToDate.toFixed(2),
      previousPeriod: previousPeriod.toFixed(2),
      marginPercent,
      transactions: Math.round(monthToDate / averageBasket),
      products,
      history: historyFor(location, random, today, base * 30),
    }
  })
}
