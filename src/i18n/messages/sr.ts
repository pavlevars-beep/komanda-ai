/**
 * Izvorni skup poruka. Svaki drugi jezik mora da pokrije SVE ključeve odavde —
 * to obezbeđuje tip, pa nedostajući prevod pada u build-u umesto da tiho
 * prikaže engleski tekst srpskom korisniku.
 */
export const sr = {
  // --- Opšte ---
  'app.name': 'Komanda AI',
  'app.tagline': 'Komandni centar poslovanja',
  'common.loading': 'Učitavanje…',
  'common.save': 'Sačuvaj',
  'common.cancel': 'Odustani',
  'common.close': 'Zatvori',
  'common.search': 'Pretraga',
  'common.filter': 'Filter',
  'common.retry': 'Pokušaj ponovo',
  'common.back': 'Nazad',
  'common.demoData': 'Demo podaci',
  'common.updatedAt': 'Ažurirano {time}',
  'common.source': 'Izvor',

  // --- Autentikacija ---
  'auth.signIn': 'Prijava',
  'auth.signOut': 'Odjava',
  'auth.email': 'E-adresa',
  'auth.password': 'Lozinka',
  'auth.signInAction': 'Prijavi se',
  'auth.signInSubtitle': 'Pristup radnom prostoru vaše organizacije.',
  'auth.invalidCredentials': 'Pogrešna e-adresa ili lozinka.',
  'auth.checkEmail': 'Proverite e-poštu za dalja uputstva.',

  // --- Navigacija: radni prostor ---
  'nav.home': 'Početna',
  'nav.ask': 'Pitajte poslovanje',
  'nav.reports': 'Izveštaji',
  'nav.alerts': 'Upozorenja',
  'nav.approvals': 'Odobrenja',
  'nav.operations': 'Podaci',
  'nav.documents': 'Dokumenti',
  'nav.settings': 'Podešavanja',

  // --- Navigacija: konzola ---
  'console.overview': 'Pregled',
  'console.clients': 'Klijenti',
  'console.integrations': 'Integracije',
  'console.aiTools': 'AI alati',
  'console.automations': 'Automatizacije',
  'console.approvals': 'Odobrenja',
  'console.health': 'Zdravlje sistema',
  'console.logs': 'Logovi',
  'console.audit': 'Revizija',
  'console.staff': 'Osoblje',
  'console.settings': 'Podešavanja',

  // --- Statusi integracija ---
  'integration.status.draft': 'Nacrt',
  'integration.status.testing': 'Testiranje',
  'integration.status.connected': 'Povezano',
  'integration.status.needs_attention': 'Zahteva pažnju',
  'integration.status.disconnected': 'Prekinuto',
  'integration.status.disabled': 'Onemogućeno',

  // --- Klasifikacija AI tvrdnji ---
  'classification.fact': 'Činjenica',
  'classification.calculation': 'Izračunato',
  'classification.interpretation': 'Tumačenje',
  'classification.forecast': 'Prognoza',
  'classification.fact.help': 'Podatak preuzet direktno iz povezanog sistema.',
  'classification.calculation.help': 'Izvedeno iz podataka determinističkim proračunom.',
  'classification.interpretation.help': 'Zaključak AI-ja na osnovu dostupnih podataka.',
  'classification.forecast.help': 'Procena budućeg kretanja. Nije podatak iz sistema.',

  // --- Svežina podataka ---
  'freshness.fresh': 'Sveže',
  'freshness.aging': 'Stariji podatak',
  'freshness.stale': 'Zastarelo',
  'freshness.unknown': 'Nepoznata svežina',

  // --- Pristup Delta Pro osoblja ---
  'impersonation.banner': 'Delta Pro ({name}) ima pristup do {until}',
  'impersonation.reason': 'Razlog: {reason}',
  'impersonation.end': 'Prekini pristup',
  'impersonation.endedByClient': 'Pristup je prekinut.',

  // --- Stanja ekrana ---
  'state.empty.title': 'Ovde još nema ničega',
  'state.error.title': 'Nešto nije uspelo',
  'state.error.body': 'Pokušajte ponovo. Ako se ponovi, pošaljite podršci oznaku {requestId}.',
  'state.forbidden.title': 'Nemate pristup ovom delu',
  'state.forbidden.body': 'Obratite se administratoru vaše organizacije.',
  'state.notFound.title': 'Stranica ne postoji',
  'state.unavailable': 'Uskoro',

  // --- Greške ---
  'error.unauthenticated': 'Sesija je istekla. Prijavite se ponovo.',
  'error.forbidden': 'Nemate ovlašćenje za ovu radnju.',
  'error.not_found.organization': 'Organizacija nije pronađena.',
  'error.not_found.integration': 'Integracija nije pronađena.',
  'error.not_found.report': 'Izveštaj nije pronađen.',
  'error.rate_limited': 'Previše zahteva. Sačekajte trenutak.',
  'error.internal': 'Došlo je do greške na našoj strani.',

  // --- Brendiranje ---
  'branding.color.invalid': 'Boja mora biti u obliku #RRGGBB.',
  'branding.color.unusable': 'Ova boja ne može da postigne dovoljan kontrast ni u jednoj temi.',
  'branding.color.adjusted': 'Boja je blago korigovana radi čitljivosti.',

  // --- Teme ---
  'theme.light': 'Svetla',
  'theme.dark': 'Tamna',
  'theme.system': 'Sistemska',
} as const

export type Messages = typeof sr
export type MessageKey = keyof Messages
