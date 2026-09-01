# 06 — Plan isporuke

Svaka faza završava se stanjem koje je stvarno upotrebljivo i pokriveno testovima. Ne prelazi se na sledeću fazu dok TypeScript, lint i testovi ne prolaze.

## Faza 0 — Temelj ✅
Next.js + TypeScript (`strict`), ESLint sa boundaries pravilima, Prettier, Vitest, Playwright, CI, `.env.example`, Zod validacija okruženja, logger sa redakcijom, dizajn tokeni, tema (svetla/tamna/sistemska), i18n skelet (sr/en).
**Urađeno.** Uz plan, dodato: normalizacija brend boje sa proračunom WCAG
kontrasta, i18n u kome nedostajući prevod obara build, i skeniranje
klijentskog bundle-a na tajne.

## Faza 1 — Identitet, tenancy, RLS ✅ ⟵ *najvažnija faza*
Migracije za organizacije, korisnike, članstva, role, permisije, osoblje, dodele, impersonation. `0001_lockdown.sql`. `app.*` funkcije. Politike za sve tabele. Supabase Auth, prijava, pozivnice. Seed za tri organizacije.
**Urađeno.** 14 migracija, 46 tabela, 93 RLS politike, tri demo organizacije.
Testovi izolacije prolaze, uključujući generisani test nad svih 29 tabela sa
`organization_id`.

Odstupanja od plana, i zašto:
- Testovi su u običnom SQL-u umesto u pgTAP-u, da bi `verify-db.sh` radio nad
  bilo kojim PostgreSQL-om bez Docker-a — isti skript koriste programer i CI.
- Rola `authenticated` nije ostala bez svih prava, jer kroz nju ide i naš
  serverski kod. Umesto toga prava se daju po tabeli, a provera permisije je
  ugrađena u samu RLS politiku — autorizacija time živi u bazi i važi i ako
  neko zaobiđe našu API rutu. `anon` i dalje nema nijedno pravo.
- Redovi iz baze se na granici repozitorijuma proveravaju Zod šemom umesto da
  se veruje generisanim tipovima, koji ćute kada se šema promeni.

## Faza 2 — Delta Pro konzola ◐
Pregled, Klijenti, čarobnjak za novu organizaciju, radni prostor klijenta, brendiranje sa proverom kontrasta, korisnici i role, onboarding lista, impersonation tok sa trakama u obe zone.
**Urađeno:** lista klijenata sa agregatima, detalj klijenta sa onboarding
listom i korisnicima, brendiranje sa proverom kontrasta i živim pregledom, i
pun tok sesije pristupa — pokretanje sa obaveznim razlogom, traka u konzoli
sa preostalim vremenom, prekid iz konzole i iz klijentskog radnog prostora.

Čarobnjak za novog klijenta je gotov: organizacija, brend i prva integracija u
jednom toku, sa proverom kontrasta pre snimanja.

**Preostaje:** pozivanje korisnika i izmena rola. Oba traže Auth Admin API
živog Supabase projekta, pa se ne mogu dovršiti nad lokalnom bazom. Do tada su
te radnje u UI-ju označene kao nedostupne, ne prikazane kao dugmad koja ne
rade.

## Faza 3 — Konektori ✅
`Connector` interfejs, registry, runner (timeout, retry, SSRF zaštita, zapis zdravlja). Implementacije: `demo`, `rest`, `webhook`. Vault integracija za kredencijale. Graditelj integracija. Test veze. Zdravlje sistema.
**Urađeno.** Konektor izlaže imenovane sposobnosti sa Zod šemama; `query(sql)`
u interfejsu ne postoji. Runner sprovodi permisiju, validaciju ulaza i izlaza,
vremensko ograničenje i redakciju grešaka, pa implementacije konektora ne pišu
nijedan bezbednosni korak i ne mogu ga zaboraviti.

Zaštita od SSRF-a pokrivena je sa 26 testova koji dokumentuju napadnu površinu:
metadata servis oblaka, naš sopstveni Supabase na petlji, brojčani zapisi
adrese, IPv4 upisan u IPv6, preusmeravanje.

Kredencijali idu u Vault kroz funkcije dostupne isključivo servisnoj roli.
Vlasnik organizacije sa punom permisijom `manage_integrations` ne može da
pročita vrednost — nedostaje mu grant, pa RLS nije ni u igri.

Graditelj integracija u konzoli: katalog, kreiranje, unos kredencijala, test
veze. Status integracije se izvodi iz ishoda provere, pa dugme „označi kao
povezano" ne postoji. Tipovi konektora koji nisu registrovani u kodu vide se u
katalogu, ali se ne mogu izabrati — i UI i akcija na serveru to proveravaju.

Sposobnosti se uključuju pojedinačno iz konzole. Spisak dolazi iz konektora u
kodu, kroz istu funkciju koju runner koristi pri traženju deskriptora, pa se u
konzoli ne može pojaviti prekidač za nešto što runner odbija. Režim i tražena
permisija se pri upisu čitaju iz deklaracije, nikad iz forme — inače bi
izmenjen zahtev mogao da upiše EXECUTE sposobnost sa permisijom za gledanje
table. Red za sposobnost koje u kodu više nema ne skriva se nego se prikazuje
kao nepoznat, sa jedinom mogućom radnjom — isključivanjem.

Istorija provera veze pokazuje poslednjih deset pokušaja. Postoji zato što
jedan trenutni status ne razlikuje integraciju koja je pala prvi put od one
koja pada svaki drugi put.

## Faza 4 — Klijentski radni prostor ◐
Početna sa konfigurabilnim KPI-jevima, Operacije, Dokumenti, Podešavanja, mobilni raspored, sva četiri stanja ekrana.
**Gotovo kada:** demo klijent vidi svoje podatke sa oznakom izvora i svežine, i ništa tuđe.

**Urađeno:** KPI kartice na početnoj. Vrednost prolazi kroz isti runner kao
svaki drugi poziv i ne kešira se; kartica koja ne uspe da se učita prikazuje
razlog, ne nulu. Boja promene se izvodi iz toga da li je rast dobra vest za tu
meru, ne iz znaka broja.

**Preostaje:** Operacije, Dokumenti, Podešavanja i mobilni raspored.

## Faza 5 — AI sloj
`AIProvider`, registar alata, orkestrator sa dvostrukom proverom permisija, provenance i klasifikacija, „Pitajte svoje poslovanje", `ai_tool_calls` trag, praćenje potrošnje.
**Gotovo kada:** AI bezbednosni testovi prolaze — podmetnut `organization_id` se odbacuje, isključeni alati se ne nude, prompt injection ne izaziva akciju.

## Faza 6 — Akcije i praćenje
Odobrenja (PREPARE → EXECUTE sa idempotencijom), Upozorenja i pravila, Izveštaji (definicije, izvršenja, zakazivanje), Obaveštenja.
**Gotovo kada:** AI predlaže e-mail, odobrenje se vidi u oba prostora, izvršenje se dešava tek posle odobrenja i ne može se ponoviti.

## Faza 7 — Očvršćivanje
Revizija sa particijama i retencijom, rate limiting, CSP i zaglavlja, CSRF, potpuni bezbednosni test paket, prazna/greška stanja svuda, dokumentacija ADR-ova, priprema `local-agent` i `mssql` konektora (interfejsi, ne implementacija).
**Gotovo kada:** bezbednosni pregled prolazi i sistem je spreman za IT reviziju korporativnog klijenta.

---

## Šta se namerno **ne** gradi u MVP-u

Da bi temelj ostao čist i isporučiv:

- Puna implementacija lokalnog konektora (arhitektura i tabele — da; agent binarni program — ne)
- SQL Server / MIS ERP / Pantheon / SAP konektori (interfejsi spremni, implementacija po prvom stvarnom klijentu)
- PDF i Excel izvoz (struktura izveštaja podržava, generisanje kasnije)
- Dvostruko odobrenje u UI-ju (šema podržava od početka)
- SSO / SAML (`AuthProvider` apstrakcija spremna)
- Ćirilica (i18n sloj podržava dodavanje bez prepravke)
