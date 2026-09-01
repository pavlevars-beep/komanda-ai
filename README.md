# Komanda AI Command Center

Platforma za integraciju poslovnih sistema klijenata u jedan bezbedan komandni centar.
Proizvod kompanije **Delta Pro DOO**.

> **Status:** Faza 0 i Faza 1 su gotove — skele, izolacija tenanta i testovi.
> Sledi Faza 2 (konzola i onboarding). Plan je u `docs/06-plan-isporuke.md`.

## Šta je ovo

Sistem povezuje postojeće poslovne sisteme klijenta — ERP, CRM, baze podataka,
e-poštu, sajt, fajlove i automatizacije — u jedan radni prostor u kome uprava vidi
stanje poslovanja, postavlja pitanja i odobrava akcije.

AI je sloj inteligencije **unutar** ozbiljne poslovne platforme. Platforma je
upotrebljiva i bez AI-ja.

Dva odvojena iskustva:

- **Konzola** (`/console`) — Delta Pro: onboarding klijenata, integracije, dijagnostika, nadzor
- **Radni prostor** (`/w/[orgSlug]`) — klijent: pregled poslovanja, pitanja, izveštaji, odobrenja

## Dokumentacija

| Dokument | Sadržaj |
|---|---|
| [`docs/00-otvorena-pitanja.md`](docs/00-otvorena-pitanja.md) | Donete odluke i pitanja koja tek treba rešiti |
| [`docs/01-arhitektura.md`](docs/01-arhitektura.md) | Sistemska arhitektura, apstrakcije, konektori, AI sloj |
| [`docs/02-baza-podataka.md`](docs/02-baza-podataka.md) | Kompletan model baze sa DDL-om |
| [`docs/03-rls-i-bezbednost.md`](docs/03-rls-i-bezbednost.md) | Model izolacije podataka, RLS politike, rukovanje tajnama, testovi |
| [`docs/04-struktura-projekta.md`](docs/04-struktura-projekta.md) | Struktura foldera i pravila granica modula |
| [`docs/05-ui-mapa.md`](docs/05-ui-mapa.md) | Mapa ekrana i principi dizajna |
| [`docs/06-plan-isporuke.md`](docs/06-plan-isporuke.md) | Faze isporuke |
| [`docs/adr/`](docs/adr/) | Arhitektonske odluke sa obrazloženjem |
| [`docs/07-postavljanje.md`](docs/07-postavljanje.md) | Postavljanje na Supabase i Vercel — gde ide koja vrednost |
| [`docs/pregled/arhitektura.html`](docs/pregled/arhitektura.html) | Pregledna verzija za klijenta i njegov IT — otvara se duplim klikom |

## Osnovna načela

1. **Izolacija klijenata na četiri nezavisna sloja** — privilegije, RLS, aplikativni scope, složeni strani ključevi.
2. **Delta Pro nema tihi pristup podacima klijenta** — samo kroz vremenski ograničenu, obrazloženu i klijentu vidljivu sesiju.
3. **AI ne piše SQL i ne izvršava akcije** — bira među unapred odobrenim sposobnostima; svaka spoljna akcija traži ljudsko odobrenje.
4. **Svaka tvrdnja nosi poreklo** — izvor, vreme osvežavanja i klasifikaciju (činjenica / izračunato / tumačenje / prognoza).
5. **Nema lažne funkcionalnosti** — nedovršeno je vidljivo označeno, nikad simulirano.

## Pokretanje

```bash
npm install
cp .env.example .env.local        # popuni Supabase vrednosti

npm run dev                       # aplikacija na http://localhost:3000
npm run verify                    # typecheck + lint + testovi
```

**Baza.** `scripts/verify-db.sh` podiže čistu bazu, primenjuje migracije i
seed, pa pokreće testove izolacije. Radi nad bilo kojim PostgreSQL-om — ne
traži Docker ni nalog na Supabase-u:

```bash
# uz lokalni PostgreSQL na portu 55432
PGPORT=55432 ./scripts/verify-db.sh
```

Testovi izolacije se **generišu** nad svim tabelama koje nose
`organization_id`, pa nova tabela automatski ulazi u proveru. CI pada ako
tabela nema RLS, ako `UPDATE` politika nema `WITH CHECK`, ili ako politika
poziva pomoćnu funkciju po redu umesto po naredbi.

Razvojni nalozi se kreiraju seed-om; lozinke se postavljaju zasebno —
vidi `scripts/set-dev-passwords.md`. Heš lozinke ne ide u repozitorijum.

## Tehnologija

Next.js · TypeScript (strict) · React · Supabase (PostgreSQL, Auth, RLS, Vault) · Vercel · OpenAI (apstrahovan) · opciono n8n

## Jezici

Srpski (latinica) podrazumevano, engleski kao prekidač — ceo proizvod, uključujući konzolu.
