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

  // --- Upozorenja ---
  'alert.severity.info': 'Informacija',
  'alert.severity.warning': 'Upozorenje',
  'alert.severity.critical': 'Kritično',
  'alert.status.new': 'Novo',
  'alert.status.acknowledged': 'Potvrđeno',
  'alert.status.resolved': 'Rešeno',
  'alert.status.dismissed': 'Odbačeno',
  'alert.empty': 'Nema otvorenih upozorenja. Kada nešto zatraži pažnju, pojaviće se ovde.',

  // --- Početna radnog prostora ---
  'home.greeting.morning': 'Dobro jutro',
  'home.greeting.day': 'Dobar dan',
  'home.greeting.evening': 'Dobro veče',
  'home.lede': 'Evo šta danas traži pažnju.',
  'home.metrics': 'Ključni pokazatelji',
  'home.metrics.pending':
    'Pokazatelji se prikazuju kada Delta Pro poveže poslovni sistem i uključi odgovarajuće sposobnosti.',

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

  // --- Konzola: klijenti ---
  'clients.title': 'Klijenti',
  'clients.lede': 'Organizacije koje administrirate.',
  'clients.empty': 'Nemate nijednu dodeljenu organizaciju. Dodelu vrši Super Admin.',
  'clients.col.company': 'Kompanija',
  'clients.col.industry': 'Delatnost',
  'clients.col.status': 'Status',
  'clients.col.users': 'Korisnici',
  'clients.col.integrations': 'Integracije',
  'clients.col.onboarding': 'Onboarding',
  'clients.col.consultant': 'Konsultant',
  'clients.col.activity': 'Poslednja aktivnost',
  'clients.col.plan': 'Plan',
  'clients.attention': '{count} zahteva pažnju',
  'clients.invitesPending': '{count} pozivnica',
  'clients.noConsultant': 'Nije dodeljen',
  'clients.noActivity': 'Bez aktivnosti',

  'org.status.prospect': 'U pripremi',
  'org.status.onboarding': 'Onboarding',
  'org.status.active': 'Aktivan',
  'org.status.suspended': 'Suspendovan',
  'org.status.archived': 'Arhiviran',

  // --- Onboarding ---
  'onboarding.title': 'Onboarding',
  'onboarding.progress': '{done} od {total} koraka',
  'onboarding.step.company_created': 'Kompanija kreirana',
  'onboarding.step.branding': 'Brendiranje podešeno',
  'onboarding.step.users_invited': 'Korisnici pozvani',
  'onboarding.step.data_source_connected': 'Izvor podataka povezan',
  'onboarding.step.connection_tested': 'Veza testirana',
  'onboarding.step.permissions_configured': 'Permisije podešene',
  'onboarding.step.ai_tools_enabled': 'AI alati uključeni',
  'onboarding.step.dashboard_configured': 'Početna podešena',
  'onboarding.step.first_report_generated': 'Prvi izveštaj generisan',
  'onboarding.step.production_enabled': 'Produkcijski pristup uključen',
  'onboarding.status.pending': 'Na čekanju',
  'onboarding.status.in_progress': 'U toku',
  'onboarding.status.done': 'Gotovo',
  'onboarding.status.skipped': 'Preskočeno',

  // --- Korisnici organizacije ---
  'members.title': 'Korisnici',
  'members.col.name': 'Ime',
  'members.col.email': 'E-adresa',
  'members.col.role': 'Rola',
  'members.col.status': 'Status',
  'members.col.lastSeen': 'Poslednja prijava',
  'members.status.invited': 'Pozvan',
  'members.status.active': 'Aktivan',
  'members.status.suspended': 'Suspendovan',
  'members.status.revoked': 'Opozvan',
  'members.overrides': '{count} izuzetaka',
  'members.never': 'Nikad',
  'members.empty': 'Nijedan korisnik još nije pozvan.',

  // --- Sesija pristupa ---
  'access.title': 'Pristup poslovnim podacima',
  'access.explain':
    'Dodela klijenta daje pristup konfiguraciji, ali ne i poslovnim podacima. Za njih pokrenite sesiju — klijent je vidi i može da je prekine.',
  'access.start': 'Pokreni sesiju pristupa',
  'access.reason': 'Razlog pristupa',
  'access.reasonHint': 'Klijent vidi ovaj tekst. Napišite konkretno zašto ulazite.',
  'access.scope': 'Opseg',
  'access.scope.read_only': 'Samo čitanje',
  'access.scope.full': 'Puni pristup',
  'access.duration': 'Trajanje',
  'access.minutes': '{count} min',
  'access.open': 'Otvorena sesija',
  'access.openIn': 'Pristup klijentu {name} do {until}',
  'access.remaining': 'preostalo {minutes} min',
  'access.end': 'Završi sesiju',
  'access.ended': 'Sesija je završena.',
  'access.started': 'Sesija je pokrenuta i traje do {until}.',
  'impersonation.error.reasonTooShort': 'Razlog mora imati bar 10 znakova.',
  'impersonation.error.reasonTooLong': 'Razlog je predugačak.',
  'impersonation.error.notAllowed': 'Nemate pravo da pokrenete sesiju nad ovom organizacijom.',
  'impersonation.error.cannotEnd': 'Sesija ne može da se završi.',
  'impersonation.error.notFound': 'Sesija ne postoji ili je već završena.',

  // --- Brendiranje ---
  'branding.title': 'Brendiranje',
  'branding.lede': 'Vidljivo klijentu u njegovom radnom prostoru.',
  'branding.workspaceName': 'Naziv radnog prostora',
  'branding.primaryColor': 'Primarna boja',
  'branding.welcome.sr': 'Poruka dobrodošlice (srpski)',
  'branding.welcome.en': 'Poruka dobrodošlice (engleski)',
  'branding.preview': 'Pregled',
  'branding.saved': 'Brendiranje je sačuvano.',
  'branding.contrastOk': 'Boja zadovoljava kontrast u obe teme.',

  // --- Teme ---
  'theme.light': 'Svetla',
  'theme.dark': 'Tamna',
  'theme.system': 'Sistemska',
} as const

export type MessageKey = keyof typeof sr

/**
 * Namerno `Record<MessageKey, string>`, a ne `typeof sr`.
 *
 * `as const` na srpskom katalogu daje literalne tipove, pa bi `typeof sr`
 * od drugog jezika tražio DOSLOVNO iste stringove. Ovako tip i dalje
 * obavezuje na sve ključeve — nedostajući prevod obara build — ali dozvoljava
 * da vrednost bude bilo koji tekst.
 */
export type Messages = Record<MessageKey, string>
