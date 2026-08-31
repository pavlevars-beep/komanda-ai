# 00 — Odluke i otvorena pitanja

## Donete odluke

| # | Pitanje | Odluka | Posledica |
|---|---|---|---|
| 1 | Pristup Delta Pro osoblja podacima klijenta | Eksplicitna dodela + vremenski ograničen impersonation sa revizijom | Ni Super Admin ne čita poslovne podatke bez zapisane sesije; klijent vidi i može da prekine sesiju |
| 2 | Čuvanje kredencijala integracija | Supabase Vault (pgsodium) | Aplikacija čuva samo `vault_secret_id` i `hint`; dešifrovanje isključivo serverski, u memoriji |
| 3 | AI provajder | OpenAI, uz `AIProvider` apstrakciju od prvog dana | Brz MVP; prelazak na Azure OpenAI (EU) je zamena jednog modula. Obrada van EU se dokumentuje u DPA. |
| 4 | Lokalizacija | sr-Latn + en, ceo proizvod uključujući konzolu | URL segmenti ostaju engleski radi stabilnosti linkova; sve vidljive oznake lokalizovane |

## Otvorena pitanja — potrebna pre određenih faza

Nijedno ne blokira Fazu 0 i Fazu 1. Navedena su uz fazu u kojoj postaju relevantna.

**Pre Faze 2 (konzola i onboarding)**
1. Da li klijentski administrator sme sam da poziva korisnike i menja role, ili to radi isključivo Delta Pro? (Utiče na podrazumevane permisije role `client_owner`.)
2. Podrazumevana valuta i način prikaza PDV-a u KPI karticama — RSD sa EUR pregledom, ili po organizaciji?
3. Politika lozinki i da li je MFA obavezan i za klijentske korisnike ili samo za Delta Pro osoblje?

**Pre Faze 3 (konektori)**
4. Koji je **prvi stvarni** ERP sa kojim se integrišemo (MIS, Pantheon, nešto drugo)? Ne menja arhitekturu, ali određuje koji se konektor gradi odmah posle MVP-a i koje sposobnosti se prve modeluju.
5. Da li prvi klijent može da obezbedi read-only nalog na bazi, ili ide preko API-ja/izvoza? (Određuje da li lokalni agent postaje prioritet ranije.)
6. Postoji li već n8n instanca (self-hosted ili cloud) i ko njome upravlja?

**Pre Faze 5 (AI)**
7. Prvih 6–8 pitanja koja klijent stvarno postavlja svakodnevno — to je specifikacija za početni set alata. Vredi ih prikupiti od jednog stvarnog korisnika, ne izmišljati.
8. Da li se razgovori sa AI-jem čuvaju trajno, koliko dugo, i da li klijent može da ih obriše? (GDPR i očekivanje klijenta.)

**Pre produkcije**
9. Zadržavanje revizionog traga — predlog je 24 meseca; da li neki klijent ima ugovornu obavezu dužeg roka?
10. Ko je kontrolor a ko obrađivač podataka po GDPR-u za svaki tip podatka, i da li je potreban DPA sa svakim klijentom? (Delta Pro je obrađivač; potreban je model ugovora.)
11. Gde se hostuje Supabase projekat — EU region je pretpostavka, potvrditi.
12. Rezervne kopije i test oporavka: ko i kojom dinamikom proverava da restore stvarno radi?
13. Plan reagovanja na incident — ko se obaveštava, u kom roku, i po kom obrascu se obaveštava klijent.

**Poslovno**
14. Model naplate — po organizaciji, po korisniku, po integraciji, ili po AI potrošnji? Tabele `ai_usage_daily` i `automation_runs` već beleže potrebno, ali cenovnik određuje koje agregate prikazujemo.
