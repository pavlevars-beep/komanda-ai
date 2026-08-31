# 06 — Plan isporuke

Svaka faza završava se stanjem koje je stvarno upotrebljivo i pokriveno testovima. Ne prelazi se na sledeću fazu dok TypeScript, lint i testovi ne prolaze.

## Faza 0 — Temelj
Next.js + TypeScript (`strict`), ESLint sa boundaries pravilima, Prettier, Vitest, Playwright, CI, `.env.example`, Zod validacija okruženja, logger sa redakcijom, dizajn tokeni, tema (svetla/tamna/sistemska), i18n skelet (sr/en).
**Gotovo kada:** aplikacija se diže, prazna ljuska obe zone, CI zelen.

## Faza 1 — Identitet, tenancy, RLS ⟵ *najvažnija faza*
Migracije za organizacije, korisnike, članstva, role, permisije, osoblje, dodele, impersonation. `0001_lockdown.sql`. `app.*` funkcije. Politike za sve tabele. Supabase Auth, prijava, pozivnice. Seed za tri organizacije.
**Gotovo kada:** pgTAP testovi izolacije prolaze, uključujući generisani test koji pada za svaku tabelu bez RLS-a.

## Faza 2 — Delta Pro konzola
Pregled, Klijenti, čarobnjak za novu organizaciju, radni prostor klijenta, brendiranje sa proverom kontrasta, korisnici i role, onboarding lista, impersonation tok sa trakama u obe zone.
**Gotovo kada:** klijent se može kreirati, brendirati, pozvati korisnike i aktivirati, sa punim revizionim tragom.

## Faza 3 — Konektori
`Connector` interfejs, registry, runner (timeout, retry, SSRF zaštita, zapis zdravlja). Implementacije: `demo`, `rest`, `webhook`. Vault integracija za kredencijale. Graditelj integracija. Test veze. Zdravlje sistema.
**Gotovo kada:** REST integracija se konfiguriše kroz UI, testira, i njene sposobnosti se uključuju — bez ijedne tajne u odgovoru API-ja.

## Faza 4 — Klijentski radni prostor
Početna sa konfigurabilnim KPI-jevima, Operacije, Dokumenti, Podešavanja, mobilni raspored, sva četiri stanja ekrana.
**Gotovo kada:** demo klijent vidi svoje podatke sa oznakom izvora i svežine, i ništa tuđe.

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
