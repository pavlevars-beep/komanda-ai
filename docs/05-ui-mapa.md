# 05 — UI mapa i principi ekrana

## Princip

Svaki ekran mora da odgovori na tri pitanja, tim redom:

1. **Šta treba da znam?**
2. **Šta traži moju pažnju?**
3. **Šta mogu da uradim sledeće?**

Ako element ekrana ne služi nijednom od ta tri pitanja, ne ide na ekran.

Vizuelni jezik: gusta tipografska hijerarhija, mnogo belog prostora, odlične tabele, uzdržani grafikoni, statusne oznake umesto ukrasa. Bez gradijenata, bez sjaja, bez AI ilustracija, bez animacija koje nisu povratna informacija na radnju.

---

## A) Delta Pro konzola — `/console`

Navigacija: bočna traka + prekidač organizacije u zaglavlju. Konzola **nikad** ne nosi brend klijenta — Delta Pro identitet je konstantan, da se nikad ne pomeša kontekst.

| Ruta | Ekran | Sadržaj |
|---|---|---|
| `/console` | **Pregled** | Aktivne klijentske organizacije · zdravlje integracija · integracije u kvaru · odobrenja na čekanju · neuspele automatizacije · poslednje uspešne sinhronizacije · greške u 24h · AI upotreba · incidenti · aktivnost u onboardingu |
| `/console/clients` | **Klijenti** | Tabela: Kompanija (logo+naziv) · Status · Delatnost · Glavni kontakt · Aktivni korisnici · Integracije · Zdravlje · Poslednja aktivnost · Plan · Zaduženi konsultant. Pretraga, filteri (status/zdravlje/konsultant), sortiranje, paginacija. |
| `/console/clients/new` | **Nova organizacija** | Čarobnjak: Podaci → Brendiranje → Pozivnice → Prva integracija. Može se prekinuti i nastaviti; svaki korak upisuje `onboarding_tasks`. |
| `/console/clients/[orgId]/overview` | **Pregled klijenta** | Onboarding lista sa napretkom · zdravlje · nedavne greške · odobrenja · dugme „Pokreni sesiju pristupa" (traži razlog i opseg) |
| `…/profile` | Profil kompanije | Pravni podaci, delatnost, valuta, vremenska zona, plan, status |
| `…/branding` | Brendiranje | Logo (svetli/tamni), favicon, primarna/sekundarna boja, naziv radnog prostora, poruka dobrodošlice (sr/en). **Uživo pregled + automatska provera kontrasta** — boja koja pada ispod AA se odbija sa objašnjenjem. |
| `…/users` · `…/roles` | Korisnici i role | Pozivnice, status, rola, granularne korekcije permisija, poslednja prijava, prinudno odjavljivanje |
| `…/integrations` | Integracije | Kartice sa statusom: Povezano / Testiranje / Zahteva pažnju / Prekinuto / Onemogućeno. Poslednja uspešna veza, poslednja sinhronizacija, poslednja greška. |
| `…/integrations/new` | **Graditelj integracija** | Katalog → tip → okruženje (sandbox/produkcija) → autentikacija → obim podataka → **Testiraj vezu** → izbor sposobnosti → aktivacija. Tajne se unose jednom i više se nikad ne prikazuju. |
| `…/integrations/[id]` | Detalj integracije | Kartice: Konfiguracija · Sposobnosti · Zdravlje (latencija, uspesi/greške) · Logovi · Kredencijali (samo `hint` + „Zameni") · Opasne radnje |
| `…/data-sources` | Izvori podataka | Šta je povezano, koliko zapisa, kada je osveženo, SLA svežine |
| `…/ai-tools` | AI sposobnosti | Uključi/isključi alat po organizaciji, veži za integraciju, vidi tražene permisije i klasifikaciju |
| `…/automations` | Automatizacije | Reference na workflow-e, poslednja izvršenja, statusi (n8n identifikatori se ovde vide, klijentu nikad) |
| `…/dashboard` | Konfiguracija početne | Koje KPI kartice klijent vidi i kojim redom, po roli |
| `…/reports` · `…/alerts` | Definicije | Sačuvani i zakazani izveštaji; pravila upozorenja, pragovi, primaoci |
| `…/security` | Bezbednost | MFA politika, aktivne sesije, istorija pristupa osoblja, zadržavanje revizije |
| `…/usage` | Upotreba | AI pozivi, tokeni, trošak, pozivi konektora, aktivni korisnici |
| `…/audit` | Revizija klijenta | Filtrirani revizioni trag te organizacije |
| `/console/integrations` | Katalog konektora | Svi tipovi, dostupnost (GA/beta/planirano), podržana autentikacija, manifest sposobnosti |
| `/console/ai-tools` | Registar alata | Globalne definicije: šema ulaza/izlaza, tražena permisija, izvor, klasifikacija |
| `/console/approvals` | Odobrenja | Sva odobrenja na čekanju kroz sve klijente, sa nivoom rizika |
| `/console/health` | **Zdravlje sistema** | Aplikacija · Baza · AI provajder · Integracije · Automatizacije · Agenti. Po integraciji: status, latencija, poslednji uspeh, poslednja greška, broj grešaka, poslednja sinhronizacija. |
| `/console/logs` | Logovi | Sistemski događaji, filtriranje po komponenti i ozbiljnosti, `request_id` pretraga |
| `/console/audit` | Revizija (platforma) | Uključujući sve sesije pristupa osoblja — ko, gde, kada, zašto |
| `/console/staff` | Osoblje | Delta Pro nalozi, role, dodele klijenata, MFA status |
| `/console/settings` | Podešavanja | AI provajder, limiti, obaveštenja, politika zadržavanja |

---

## B) Klijentski radni prostor — `/w/[orgSlug]`

Navigacija: kratka bočna traka na desktopu, donja traka na mobilnom. Prikazuju se **samo moduli uključeni za tu organizaciju i dozvoljeni tom korisniku** — nema onemogućenih stavki koje samo zbunjuju.

| Ruta | Ekran | Sadržaj |
|---|---|---|
| `/w/[org]` | **Početna** | Pozdrav i rečenica dana: *„Dobro jutro, Marko. Evo šta danas traži pažnju."* → lista od 3–5 stavki koje traže reakciju (dospela potraživanja, neodgovoreni upiti, pad prodaje, integracija van funkcije). Ispod: 4–6 KPI kartica koje je Delta Pro konfigurisao. Svaka kartica nosi izvor i vreme osvežavanja. |
| `/w/[org]/ask` | **Pitajte svoje poslovanje** | Razgovorni interfejs. Odgovor nosi: vrednost, poređenje, **izvor**, **svežinu**, i **oznaku klasifikacije** (Činjenica / Izračunato / Tumačenje / Prognoza). Detalji izvora se otvaraju na klik. Predloži pitanja na početku. Ako podatak nedostaje — jasno se kaže zašto. |
| `/w/[org]/reports` | Izveštaji | Sačuvani, zakazani i generisani. Svaki nosi period, filtere, izvore, vreme generisanja i autora (korisnik ili automatizacija). |
| `/w/[org]/alerts` | Upozorenja | Ozbiljnost · Izvor · Nastalo · Status · Zaduženi. Radnje: Potvrdi, Reši, Odbaci, Dodeli. |
| `/w/[org]/approvals` | **Odobrenja** | Predložena akcija u punom kontekstu: šta se traži, u kom sistemu, na osnovu kojih podataka, ko je pokrenuo, koji je rizik. Dugmad: **Odobri · Izmeni · Odbij**. Za e-mail: primalac, naslov, telo — vidljivo pre slanja. |
| `/w/[org]/operations` | Podaci / Operacije | Poslovni podaci iz konektora u tabelama (prodaja, potraživanja, zalihe, kupci) — pretraga, filteri, izvoz ako permisija dozvoljava |
| `/w/[org]/documents` | Dokumenti | Fajlovi vezani za organizaciju, sa permisijom `view_documents` |
| `/w/[org]/settings` | Podešavanja | Profil, jezik (sr/en), tema, obaveštenja. Za `client_admin`: korisnici i role. |

**Traka nadzora:** dok je aktivna Delta Pro sesija pristupa, u vrhu klijentskog prostora stoji obaveštenje: *„Delta Pro (Ana Jovanović) ima pristup do 15:40 · razlog: dijagnostika ERP sinhronizacije"* sa dugmetom „Prekini pristup" za klijentskog administratora. Ovo je namerno vidljivo — poverenje se gradi transparentnošću, ne tišinom.

---

## C) Ponašanje na uređajima

| | Desktop | Tablet | Mobilni |
|---|---|---|---|
| Konzola | pun rad | pregled + dijagnostika | pregled, zdravlje, odobrenja |
| Radni prostor | pun rad | pun rad | **pun rad** — početna, pitanja, upozorenja, odobrenja |

Rukovodilac mora da odobri akciju i postavi pitanje sa telefona. Tabele na mobilnom prelaze u kartični prikaz sa prioritetnim kolonama, ne u horizontalno skrolovanje.

## D) Stanja koja se često zaborave

Svaki ekran ima definisana sva četiri stanja pre nego što se smatra gotovim:

- **Prazno** — objašnjava šta je ovo i koji je sledeći korak, sa radnjom. Nikad samo „Nema podataka".
- **Učitavanje** — skeleton koji odgovara stvarnom rasporedu, bez pomeranja sadržaja.
- **Greška** — šta se desilo, da li je privremeno, šta korisnik može, i `request_id` za podršku. Bez tehničkih detalja.
- **Bez dozvole** — jasno da modul postoji ali korisnik nema pristup, sa uputstvom kome da se obrati.

## E) Nedovršene sposobnosti

Nema dugmadi koja ne rade. Sposobnost koja nije implementirana:
- prikazana je sa oznakom **„Uskoro"** i onemogućena, ili
- ima realan razvojni stub koji je **vidljivo označen** kao takav.

Nikad se ne simulira uspešna komunikacija sa produkcionim sistemom klijenta.
