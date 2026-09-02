# 07 — Postavljanje na Supabase i Vercel

Ovaj dokument opisuje **gde ide koja vrednost**. Nijedna tajna ne pripada
repozitorijumu ni poruci u chatu — sve ide u okruženje.

---

## 1. Šta je javno, a šta nije

| Vrednost | Gde sme | Zašto |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel, GitHub, browser | Adresa projekta; vidi je svaki posetilac |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel, GitHub, browser | Namenjen browseru. **Kod nas nema nijedno pravo nad tabelama** — vidi migraciju `…_lockdown.sql` |
| `SUPABASE_SERVICE_ROLE_KEY` | **samo Vercel (server)** | Zaobilazi RLS. Ko ga ima, ima sve podatke svih klijenata |
| `SUPABASE_ACCESS_TOKEN` | **samo GitHub secrets** | Upravlja projektom preko CLI-ja |
| `SUPABASE_DB_PASSWORD` | **samo GitHub secrets** | Direktna veza ka bazi pri puštanju migracija |
| `OPENAI_API_KEY` | **samo Vercel (server)** | Naplativ; curenje je i trošak i rizik |

Pravilo koje vredi zapamtiti: sve što nema prefiks `NEXT_PUBLIC_` Next.js
**nikad** ne šalje u browser. `scripts/check-bundle.sh` to i proverava nad
onim što se stvarno isporuči, i CI pada ako nešto procuri.

---

## 2b. Vercel — tip promenljive: Config, ne Secret

**`NEXT_PUBLIC_*` promenljive MORAJU biti tipa `Config`.**

Vercel nudi dva tipa. `Secret` je write-only i **ne prosleđuje se u build za
ugradnju u klijentski paket** — što je i smisao tog tipa. Ali `NEXT_PUBLIC_*`
vrednosti se upravo ugrađuju u klijentski paket, pa promenljiva sa tim
prefiksom sačuvana kao `Secret` nikad ne stigne do aplikacije.

Vercel na to i upozorava pri unosu:

> Remove the public framework prefix to keep this value private. Public
> prefixes expose values to the browser. If that's safe, change the variable
> to Config.

Simptom kada se to previdi: build prolazi, ali `connect-src 'self' ;` u CSP
zaglavlju nema adresu Supabase-a, a aplikacija vraća 503 sa
`x-configuration-error`. Promenljiva pritom uredno stoji u listi.

| Promenljiva | Tip |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Config** — adresa je javna, vidi je svaki posetilac |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Config** — namenjen browseru, bez prava nad tabelama |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** — jedina koja to zaista jeste |
| `APP_URL`, `LOG_LEVEL`, `NODE_ENV` | Config |

> **Sačuvan `Secret` se ne može prebaciti u `Config`** — vrednost je write-only.
> Mora da se obriše i doda ponovo sa tipom `Config`.

## 2a. Vercel — sa koje grane se gradi

**Vercel ne gradi sa `main`.** Produkciona grana ovog projekta je
`claude/komanda-ai-command-center-85w2bm`; piše i na Overview stranici:

```
To update your Production Deployment, push to the
claude/komanda-ai-command-center-85w2bm branch.
```

Push na `main` **ne pokreće ništa**. To nas je jednom koštalo pola dana
traženja greške koje nije bilo: osam commit-a je stajalo na `main`-u, produkcija
je servirala build star jedan dan, a simptom je izgledao kao greška u kodu.

Provera pre nego što se bilo šta drugo dijagnostikuje:

```bash
# Šta Vercel stvarno gradi?
git log --oneline -1 origin/claude/komanda-ai-command-center-85w2bm
```

Ako se to ne poklapa sa `main`, prvo uskladite grane pa tek onda tražite uzrok:

```bash
git push origin main:claude/komanda-ai-command-center-85w2bm
```

> **`NEXT_PUBLIC_*` se ugrađuje U BUILD, ne čita pri izvršavanju.** Zato dodavanje
> promenljive na Vercel-u ne popravlja ništa dok se ne napravi NOVI build.
> Deployment napravljen pre nego što je promenljiva postojala nosi prazan string
> zauvek. Simptom: `connect-src 'self' ;` u CSP zaglavlju, bez adrese Supabase-a,
> i 500 na svakoj zaštićenoj ruti.

## 2. Vercel — promenljive okruženja

Podešavanja projekta → *Environment Variables*. Za `Production` i `Preview`:

```
NEXT_PUBLIC_SUPABASE_URL        https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   <anon ključ>
SUPABASE_SERVICE_ROLE_KEY       <service role ključ>     ← označiti kao Sensitive
APP_URL                         https://<domen>          ← može i goli domen
NODE_ENV                        production
LOG_LEVEL                       info
AI_PROVIDER                     none                     ← dok se Faza 5 ne uključi
IMPERSONATION_MAX_MINUTES       60
```

`SUPABASE_SERVICE_ROLE_KEY` je opcion u šemi okruženja — aplikacija radi i bez
njega. Potreban je tek za pozadinske poslove i pozivanje korisnika.

> **Pogrešna vrednost obara BUILD, ne zahtev.** `next.config.ts` proverava
> okruženje pre nego što se išta izgradi, pa razlog stoji u build logu, imenom
> promenljive:
>
> ```
> Konfiguracija okruženja nije ispravna:
>   - LOG_LEVEL: Invalid option: expected one of "debug"|"info"|"warn"|"error"
> ```
>
> Poruka nikad ne sadrži vrednosti, samo nazive i razloge — sme da se prekopira.
> Ranije je ovakva greška prolazila build i vraćala praznu 500 stranicu na
> svakom zahtevu, a uzrok se video samo kopanjem po runtime logovima.

> **Provera:** ako Vercel↔Supabase integracija sama ubaci `SUPABASE_URL` i
> `SUPABASE_ANON_KEY` (bez `NEXT_PUBLIC_` prefiksa), te dve nam ne koriste —
> `src/server/env.ts` traži imena sa prefiksom, jer ih koristi i klijentski
> kod za auth sesiju. Dodajte ih pod tačnim imenima iz tabele gore.

---

## 3. GitHub — secrets za migracije

Repozitorijum → *Settings* → *Secrets and variables* → *Actions*:

```
SUPABASE_ACCESS_TOKEN    supabase.com/dashboard/account/tokens
SUPABASE_PROJECT_REF     tačno 20 malih slova — poddomen iz adrese projekta
SUPABASE_DB_PASSWORD     lozinka baze, iz Supabase → Settings → Database
```

> **Oblik `SUPABASE_PROJECT_REF`-a.** To je **tačno 20 malih slova**, bez
> ičega drugog:
>
> ```
> https://abcdefghijklmnopqrst.supabase.co
>         └──────── ovo, i samo ovo ────┘
> ```
>
> Ne cela adresa, ne naziv projekta, bez razmaka i novog reda na kraju.
> Isti niz stoji u *Settings → General → Reference ID*. Workflow proverava
> oblik pre nego što pozove Supabase, pa pogrešan unos daje jasnu poruku
> umesto zbunjujuće greške o „branch name".

Workflow `.github/workflows/deploy-db.yml` se pokreće **samo** na push na
`main` koji dira `supabase/migrations/**`, i to u dva koraka:

1. **Provera** — migracije se puštaju na čistu bazu u CI-ju i prolaze svi
   testovi izolacije. Ovo je ista provera koja štiti svaki push.
2. **Isporuka** — tek ako prvi korak prođe, `supabase db push` primenjuje
   migracije na živi projekat.

Redosled nije kozmetika: šema koja ne prolazi testove izolacije nikad ne
dođe do žive baze.

Job koristi GitHub *environment* `production`. Kada budete hteli ručno
odobrenje pred svaku izmenu šeme, uključite *Required reviewers* na tom
okruženju — bez ijedne izmene u workflow-u.

---

## 4. Supabase — podešavanja projekta

**Autentikacija** (*Authentication → Providers → Email*):
- **Isključiti javnu registraciju.** Nalozi se prave isključivo pozivnicom;
  bez toga bi svako mogao da napravi nalog na vašoj instanci.
- Uključiti potvrdu e-adrese.

**Adrese za preusmeravanje** (*Authentication → URL Configuration*):
```
Site URL:        https://<domen>
Redirect URLs:   https://<domen>/auth/callback
```

**Izložene šeme** (*Settings → API → Exposed schemas*): mora da ostane samo
`public`. Šema `app` sadrži pomoćne funkcije autorizacije i **ne sme** da se
izloži kroz PostgREST.

**Region:** potvrdite da je EU (npr. Frankfurt). Ako je projekat napravljen u
drugom regionu, to je ugovorna stvar sa klijentima i menja se samo
preseljenjem projekta — proverite pre prvog stvarnog klijenta.

---

## 5. Prva isporuka, redom

```bash
# 1. Spojiti granu sa razvojem u main → workflow pušta migracije
git checkout main && git merge claude/komanda-ai-command-center-85w2bm

# 2. Pratiti Actions → "Migracije baze"
#    Prvo mora da prođe "Provera pre isporuke", pa tek onda "Primeni na Supabase".

# 3. Napraviti prvi Delta Pro nalog (jednokratno, iz Supabase Studija)
#    Authentication → Users → Add user → vaša e-adresa
```

Zatim, u *SQL Editor*-u Supabase Studija, dodeliti tom nalogu status
Super Admina:

```sql
insert into public.platform_staff (user_id, staff_role)
select id, 'super_admin'
from auth.users
order by created_at desc
limit 1
on conflict (user_id) do update
  set staff_role = 'super_admin', is_active = true
returning user_id, staff_role, is_active;
```

> **`returning` nije ukras.** Prva verzija ovog upita glasila je
> `... from auth.users where email = 'vasa@adresa.rs'`. Kada se e-adresa ne
> poklopi tačno, `select` ne vrati nijedan red, `insert` upiše nula redova, a
> Postgres to prijavi kao **uspeh**. Prijava posle toga vodi na „nemate
> pristup", a ništa ne ukazuje na uzrok.
>
> Sa `returning`, jedan vraćen red znači da je dodela prošla; nula redova znači
> da u `auth.users` nema naloga. Nema tihog promašaja.

Posle toga prijava na `https://<domen>` vodi pravo u konzolu, i prvi klijent
se pravi kroz *Klijenti → Novi klijent*.

---

## 6. Šta se NEĆE desiti na produkciji

**Demo podaci ne mogu da uđu.** Migracija `…_environment_guard.sql` postavlja
trigger koji odbija svaku organizaciju sa `is_demo = true` u bazi koja nije
izričito označena kao razvojna. Podrazumevano stanje je „produkcija", pa ne
postoji korak koji neko može da zaboravi da uradi da bi produkcija bila
zaštićena.

Razvojna baza se označava izričito:

```sql
alter database postgres set app.environment = 'development';
```

**Seed se ne pušta.** Workflow primenjuje samo `supabase/migrations`, nikad
`supabase/seed`. Trigger iz prethodnog pasusa je druga brava za slučaj da neko
seed pokrene ručno.

---

## 7. Provera posle isporuke

U *SQL Editor*-u:

```sql
-- Nijedna tabela sa organization_id ne sme da bude bez RLS-a.
select * from app.tables_missing_rls();          -- očekuje se 0 redova

-- Nijedna UPDATE politika bez WITH CHECK.
select * from app.update_policies_without_check(); -- očekuje se 0 redova

-- Nijedna politika sa oblikom koji ne skalira.
select * from app.policies_with_slow_shape();      -- očekuje se 0 redova

-- Baza NE sme da bude označena kao razvojna.
select app.is_development_database();              -- očekuje se false
```

Ako bilo koji od prva tri upita vrati red, ili poslednji vrati `true` —
nešto nije kako treba i ne treba puštati klijente unutra.
