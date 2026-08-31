# 01 — Arhitektura sistema

> Komanda AI Command Center — platforma za integraciju poslovnih sistema klijenata
> Vlasnik proizvoda: Delta Pro DOO

## 1. Osnovna postavka

Sistem je **jedna aplikacija sa dva odvojena iskustva**, ne dva proizvoda:

| Iskustvo | Ko koristi | Ruta | Fokus |
|---|---|---|---|
| **Konzola** | Delta Pro (Super Admin, Konsultant, Podrška) | `/console/*` | Konfiguracija, integracije, dijagnostika, nadzor |
| **Workspace** | Klijent (uprava i zaposleni) | `/w/[orgSlug]/*` | Poslovni uvid, pitanja, izveštaji, odobrenja |

Razdvajanje je sprovedeno na četiri nivoa istovremeno:
1. **Ruting i layout** — različiti navigacioni skeleti, različiti design tokeni (klijent nosi brendiranje, konzola nikad).
2. **Autorizacija** — različiti setovi permisija; platformske role žive u zasebnoj tabeli od klijentskih članstava.
3. **Podaci** — pristup Delta Pro osoblja poslovnim podacima klijenta zahteva eksplicitnu, vremenski ograničenu i zabeleženu sesiju (vidi §4).
4. **API površina** — `/api/console/*` i `/api/workspace/*` imaju odvojene guard-ove; nijedan handler ne služi oba konteksta.

## 2. Tehnološki izbor i granice

```
Browser (React, Next.js App Router)
   │  samo: HTTP ka NAŠEM API-ju + Supabase Auth sesija (cookie)
   ▼
Next.js server (Route Handlers / Server Actions / RSC)
   │  ovde živi SVA autorizacija, validacija, audit, orkestracija
   ├──► Postgres (Supabase)  — user-scoped klijent, RLS aktivan
   ├──► Supabase Vault       — dešifrovanje kredencijala, samo u memoriji
   ├──► AIProvider           — OpenAI (apstrahovan)
   ├──► ConnectorRegistry    — REST / Webhook / Demo / (kasnije SQL, ERP)
   └──► AutomationProvider   — n8n (opciono, nikad izložen klijentu)
```

**Pravilo koje se ne krši:** browser nikada ne otvara direktnu vezu ka Supabase bazi radi poslovnih podataka, niti ka bilo kom sistemu klijenta. Supabase JS klijent u browseru koristi se **isključivo** za auth sesiju (login, refresh, logout).

Razlozi:
- rate limiting, audit i validacija moraju biti na jednom mestu,
- omogućava zamenu Supabase-a bez prepravke UI-ja,
- eliminiše celu klasu grešaka „zaboravljen filter u frontend upitu",
- `anon` ključ ne dobija nikakva prava nad tabelama (vidi `03-rls-i-bezbednost.md`).

## 3. Apstrakcije (provider slojevi)

Svaki spoljašnji sistem je iza interfejsa u `src/core/`, bez zavisnosti na React ili Next:

| Interfejs | MVP implementacija | Pripremljeno za |
|---|---|---|
| `AuthProvider` | Supabase Auth | Entra ID / SAML SSO |
| `SecretsProvider` | Supabase Vault | AWS KMS, HashiCorp Vault |
| `AIProvider` | OpenAI | Azure OpenAI (EU), Anthropic, lokalni model |
| `Connector` | Demo, REST, Webhook | SQL Server, MIS ERP, Pantheon, M365 |
| `AutomationProvider` | n8n | Temporal, interni scheduler |
| `NotificationProvider` | E-mail (transakcioni) | Teams, Slack, SMS, push |
| `StorageProvider` | Supabase Storage | S3 |

Zavisnosti idu samo u jednom smeru: `app/ui → core → server/infra`. Nikad obrnuto. Ovo se sprovodi ESLint pravilom, ne dogovorom.

## 4. Model pristupa Delta Pro osoblja (odabrano: eksplicitna dodela + impersonation)

Ovo je najvažnija bezbednosna odlika proizvoda i glavni argument pred IT odeljenjem klijenta.

Razdvajamo **dva različita prava**, koja se nikad ne mešaju:

**A) Administrativni pristup (`administrable_org_ids`)** — konfiguracija i metapodaci:
konfiguracija integracija, zdravlje, logovi, korisnici, role, branding, obim podataka.
Dobija se: Super Admin → sve organizacije; Konsultant → samo organizacije na koje je **eksplicitno dodeljen** (`client_assignments`).
**Ne daje pristup nijednom poslovnom podatku.**

**B) Pristup poslovnim podacima (`accessible_org_ids`)** — prodaja, kupci, dokumenti, AI razgovori, izveštaji.
Dobija se: član organizacije (klijentov korisnik) → svoja organizacija; Delta Pro osoblje → **samo dok traje aktivna `impersonation_sessions` sesija**.

Posledice, namerno:
- Ni Super Admin ne može pročitati prodaju klijenta bez zapisa u bazi ko je, kada, zašto i do kada.
- Sesija ima obavezan **razlog**, opseg (`read_only` / `full`), i **istek** (podrazumevano 60 min).
- Sesija je **vidljiva klijentu** — traka u njihovom workspace-u: „Konsultant Delta Pro (ime) ima aktivan pristup do 15:40 · razlog: dijagnostika ERP sinhronizacije". Klijentski administrator može da je prekine.
- Svaki zahtev u toku sesije nosi `impersonation_session_id` u audit zapisu.
- U konzoli stoji trajna traka sa preostalim vremenom i dugmetom „Završi sesiju".

Ovo je jedina „rupa" u tenant izolaciji i ona je eksplicitna, ograničena i posmatrana.

## 5. READ / PREPARE / EXECUTE

Svaka sposobnost sistema je klasifikovana i tretirana različito:

| Režim | Šta znači | Autorizacija | Bočni efekti |
|---|---|---|---|
| **READ** | Čitanje informacije | permisija (npr. `view_sales`) | Nema |
| **PREPARE** | Priprema nacrta — e-mail, ponuda, izveštaj, izmena | permisija + `ask_ai` | Kreira zapis u `approvals`, ništa napolju |
| **EXECUTE** | Stvarna akcija u spoljnom sistemu | `execute_actions` + odobren `approval` | Da — nepovratno |

**EXECUTE se nikada ne pokreće iz LLM odgovora.** LLM može najviše da kreira PREPARE zapis. Izvršenje pokreće deterministički backend, tek nakon odobrenja, sa `idempotency_key` da se akcija ne izvrši dvaput.

Kritične akcije mogu tražiti dvostruko odobrenje (`requires_two_person`) — struktura je u šemi od početka, UI se uključuje po potrebi.

## 6. Konektor arhitektura

Konektor **ne izlaže bazu — izlaže poslovne sposobnosti.**

```ts
interface Connector {
  readonly type: ConnectorType
  getCapabilities(ctx: ConnectorContext): Promise<CapabilityDescriptor[]>
  testConnection(ctx: ConnectorContext): Promise<HealthResult>
  invoke(capabilityId: string, input: unknown, ctx: ConnectorContext): Promise<CapabilityResult>
  execute(actionId: string, input: unknown, ctx: ConnectorContext): Promise<ActionResult>
}
```

Namerno **ne postoji** `query(sql: string)` niti `fetchData(rawQuery)`.

`CapabilityDescriptor` nosi: `key`, `mode` (read/prepare/execute), `inputSchema` (Zod → JSON Schema), `outputSchema`, `requiredPermission`, `freshnessSla`, `classification`.

`ConnectorContext` sklapa **isključivo server**: `{ organizationId, userId, permissions, requestId, mode, impersonationSessionId? }`. Nijedno polje ne dolazi iz korisničkog unosa ni iz LLM-a.

**SQL konektori:** upiti su unapred napisani, code-reviewed, parametrizovani i verzionisani u repozitorijumu (`src/core/connectors/impl/mssql/queries/*.sql`). LLM bira **koju** sposobnost da pozove — nikada ne piše SQL. Kredencijali su po pravilu read-only nalozi.

**MVP konektori:** `demo` (deterministički, jasno označen kao demo), `rest`, `webhook`.
**Pripremljeno:** `mssql`, `postgres`, `mis-erp`, `m365`, `n8n`, `local-agent`.

## 7. Lokalni konektor (buduće, ali arhitektura je spremna sada)

```
ERP / SQL klijenta ──► Delta Local Connector ──(odlazni HTTPS)──► Delta Pro Cloud
```

Klijentova baza se ne izlaže internetu. Agent **samo odlazno** povlači poslove i vraća rezultate.

Šema već sadrži `connector_agents` i `agent_jobs`; cloud API je od početka projektovan kao **posao-u-red** model (`claim → execute → report`), tako da isti `Connector` interfejs radi i sinhrono (REST) i asinhrono (agent), bez promene AI sloja ni UI-ja.

## 8. AI sloj

Orkestracija (`src/core/ai/orchestrator.ts`), redosled je obavezan:

1. Server razrešava `organizationId` iz sesije. **Nikad iz zahteva, nikad iz LLM argumenata.**
2. Skup alata = `organization_ai_tools` (uključeni) ∩ permisije korisnika ∩ zdrave integracije. LLM vidi samo taj skup.
3. Kada model zatraži alat: **ponovna** provera permisije (ne verujemo prethodnom filtriranju), Zod validacija ulaza, izvršenje sa serverskim kontekstom.
4. Ako model pošalje `organization_id` u argumentima — ignoriše se i beleži kao bezbednosni događaj.
5. Rezultat se upisuje u `ai_tool_calls` sa punim tragom porekla.
6. Odgovor korisniku nosi **provenance**: izvor, vreme poslednjeg osvežavanja, i klasifikaciju.

**Klasifikacija tvrdnji** je obavezno polje, ne stilska preporuka:

`FACT` (direktno iz izvora) · `CALCULATION` (izvedeno determinističkim kodom) · `INTERPRETATION` (AI zaključak) · `FORECAST` (procena).

UI ih prikazuje različito. Prognoza nikad ne izgleda kao podatak iz baze.

**Prompt injection:** podaci iz ERP-a (npr. naziv kupca) mogu sadržati zlonamerni tekst. Odbrana nije prompt — odbrana je arhitektura: rezultati alata ulaze kao strukturirani `tool_result` sadržaj, a **nijedna EXECUTE akcija ne prolazi bez ljudskog odobrenja**, pa injection ne može sam da izazove posledicu.

**Bez izmišljanja:** ako alat ne vrati podatak, odgovor je „nemam taj podatak" uz razlog (integracija nedostupna / nemate permisiju / izvor nije konfigurisan). Nikad procena predstavljena kao činjenica.

## 9. n8n

n8n je **opcioni izvršni motor iza naše API-ja**, nikad proizvod koji klijent vidi.

```
Workspace → Delta API → (AutomationProvider) → n8n webhook → ERP/e-mail/CRM → rezultat → Delta API → Workspace
```

Klijent ne vidi node-ove, workflow-e ni kredencijale. Reference se čuvaju u `automation_workflows`, izvršenja u `automation_runs` sa statusom i korelacionim ID-em. Platforma je potpuno upotrebljiva i bez n8n-a.

## 10. Lokalizacija

Podrazumevani jezik: **srpski (latinica)**, prekidač na **engleski**, i to za ceo proizvod — i klijentski workspace i Delta Pro konzolu.

- Poruke: `src/i18n/messages/{sr,en}.json`, tipizovani ključevi (nedostajući prevod je greška u build-u, ne tihi fallback).
- Redosled izbora jezika: korisnički profil → podešavanje organizacije → `Accept-Language` → `sr`.
- Formatiranje brojeva, datuma i valuta preko `Intl` sa lokalom organizacije; valuta je polje organizacije (RSD/EUR), ne hardkodovana.
- **URL segmenti ostaju engleski i neutralni** (`/w/acme/reports`, ne `/izvestaji`) — putanje moraju biti stabilne pri promeni jezika, da deljeni link ne pukne. Vidljive oznake su potpuno lokalizovane. (Odluka je izolovana u jednoj routing mapi ako se kasnije promeni.)
- AI odgovara na jeziku korisnika; klasifikacije i nazivi izvora se prevode, nazivi sistema (npr. „MIS ERP") ne.

## 11. Šta se ne radi

Odluke koje sprečavaju tipične greške u ovakvim sistemima:

- Nema poslovne logike u React komponentama.
- Nema `service_role` ključa nigde u `src/app/` — sprovedeno ESLint zabranom importa.
- Nema dugmadi koja ne rade: nedovršena sposobnost je vidljivo označena kao „Uskoro" i onemogućena, ili ima realan development stub.
- Demo podaci su u razvoju uvek vidljivo označeni kao demo.
- Nema stack trace-ova ni internih kodova grešaka ka klijentskom korisniku; korelacioni `request_id` da, detalji u konzoli.
- Nema tajni u logovima — logger ima listu zabranjenih ključeva i redaktuje ih pre ispisa.
