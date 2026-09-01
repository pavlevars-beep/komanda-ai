# 03 — RLS model i bezbednost

## 1. Četiri brave

Izolacija podataka ne oslanja se na jedan mehanizam. Da bi podatak iz organizacije A procurio korisniku iz organizacije B, moraju **istovremeno** otkazati četiri nezavisna sloja:

| # | Sloj | Šta štiti | Gde živi |
|---|---|---|---|
| 1 | **GRANT / REVOKE** | `anon` nema nikakva prava; `authenticated` dobija samo ono što joj treba, po tabeli | `supabase/migrations/…_lockdown.sql` |
| 2 | **RLS politike** | red je vidljiv samo ako organizacija pripada korisniku | uz svaku tabelu |
| 3 | **Aplikativni scope** | svaki upit ide kroz repozitorijum koji obavezno prima `OrgContext` | `src/core/**/repository.ts` |
| 4 | **Složeni strani ključevi** | dete ne može pripadati drugoj organizaciji od roditelja | šema baze |

### Kako su privilegije stvarno podešene

Rola `anon` **nema nijedno pravo** nad aplikativnim tabelama. Anon ključ, koji
jedini stiže do pregledača, time je za podatke bezvredan — služi samo za
autentikaciju.

Rola `authenticated` dobija prava **po tabeli i po operaciji**, i uvek uz RLS
politiku koja proverava i pripadnost organizaciji i permisiju:

```sql
-- …_lockdown.sql
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Šema `app` sa pomoćnim funkcijama nije izložena kroz PostgREST.
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated, service_role;
```

Posledica koju vredi razumeti: **autorizacija je sprovedena u bazi, ne u našoj
API ruti.** Provera permisije stoji u samoj RLS politici, pa važi jednako i
kada zahtev stigne kroz našu aplikaciju i kada bi neko sa ukradenim tokenom
pozvao PostgREST direktno.

Naš serverski kod koristi **anon ključ i korisnikov token**, dakle rolu
`authenticated` — RLS važi i za njega. `service_role`, koji zaobilazi RLS,
koristi se samo u migracijama, seed-u i pozadinskim poslovima, kroz jedan
modul čiji uvoz iz `src/app/**` i `src/core/**` obara lint.

Dve tabele idu korak dalje i **nemaju nijedan grant** roli `authenticated`:

- `integration_credentials` — aplikacija do naznake dolazi kroz
  `app.integration_credential_summary()`, koja ne vraća ni referencu na tajnu.
- `audit_logs` — `update` i `delete` oduzeti su svima, uključujući
  `service_role`; upis ide isključivo kroz `app.write_audit()`.

## 2. Pomoćne funkcije

Sve žive u šemi `app`, sve su `SECURITY DEFINER`, `STABLE`, sa `SET search_path = ''` i punom kvalifikacijom imena (zaštita od `search_path` otmice).

```sql
create schema if not exists app;

-- Organizacije čiju KONFIGURACIJU korisnik sme da vidi/menja.
-- Ne daje pristup poslovnim podacima.
create or replace function app.administrable_org_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct o.id), '{}')
  from public.organizations o
  where
    -- Super Admin: sve organizacije
    exists (select 1 from public.platform_staff s
            where s.user_id = auth.uid() and s.is_active and s.staff_role = 'super_admin')
    -- Konsultant/podrška: samo eksplicitno dodeljene
    or exists (select 1 from public.client_assignments ca
               join public.platform_staff s on s.user_id = ca.staff_user_id
               where ca.staff_user_id = auth.uid() and ca.revoked_at is null
                 and s.is_active and ca.organization_id = o.id)
    -- Klijentski administrator u sopstvenoj organizaciji
    or exists (select 1 from public.organization_memberships m
               where m.user_id = auth.uid() and m.status = 'active'
                 and m.organization_id = o.id
                 and app.membership_has_permission(m.id, 'manage_integrations'));
$$;

-- Organizacije čije POSLOVNE PODATKE korisnik sme da čita.
create or replace function app.accessible_org_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct oid), '{}') from (
    -- (a) aktivno članstvo
    select m.organization_id as oid
    from public.organization_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
    union
    -- (b) AKTIVNA impersonation sesija Delta Pro osoblja
    select i.organization_id
    from public.impersonation_sessions i
    join public.platform_staff s on s.user_id = i.staff_user_id and s.is_active
    where i.staff_user_id = auth.uid()
      and i.ended_at is null
      and i.expires_at > now()
  ) t;
$$;

create or replace function app.has_permission(org uuid, perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.user_id = auth.uid() and m.status = 'active' and m.organization_id = org
      and app.membership_has_permission(m.id, perm)
  )
  -- osoblje u aktivnoj sesiji sa punim opsegom
  or exists (
    select 1 from public.impersonation_sessions i
    where i.staff_user_id = auth.uid() and i.organization_id = org
      and i.ended_at is null and i.expires_at > now()
      and (i.scope = 'full' or perm like 'view\_%')
  );
$$;
```

`app.membership_has_permission(membership_id, perm)` primenjuje: rola ∪ `override(grant)` − `override(deny)`, gde `deny` uvek pobeđuje.

**Ključno za performanse:** politika `organization_id = any(app.accessible_org_ids())` poziva funkciju za svaki red. Umesto toga koristi se oblik koji Postgres izvršava **jednom po naredbi**:

```sql
using (organization_id in (select unnest(app.accessible_org_ids())))
```

Usput, jedan detalj koji je koštao jedan pokušaj: oblik
`= any ((select app.accessible_org_ids()))` **ne radi** — Postgres dvostruke
zagrade tumači kao podupit koji vraća redove, pa poređenje `uuid = uuid[]`
padne pri kreiranju politike.

Ovaj oblik je obavezan u svim politikama, a proverava ga
`app.policies_with_slow_shape()` iz migracije `…_guards.sql`. CI pada ako
neko napiše politiku na spori način.

## 3. Obrazac politika

Za svaku tenant tabelu — četiri politike, nikad `for all`:

```sql
alter table public.alerts enable row level security;
alter table public.alerts force row level security;   -- važi i za vlasnika tabele
grant select, insert, update on public.alerts to authenticated;

create policy alerts_select on public.alerts for select to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())));

create policy alerts_insert on public.alerts for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

create policy alerts_update on public.alerts for update to authenticated
  using      (organization_id in (select unnest(app.accessible_org_ids())))
  with check (organization_id in (select unnest(app.accessible_org_ids())));

create policy alerts_delete on public.alerts for delete to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );
```

`FORCE ROW LEVEL SECURITY` je obavezan — bez njega vlasnik tabele zaobilazi politike.

`USING` **i** `WITH CHECK` moraju biti napisani zasebno kod `UPDATE`. Ako se izostavi `WITH CHECK`, korisnik može da izmeni `organization_id` reda i „premesti" podatak u drugu organizaciju. Ovo je najčešća greška u RLS modelima i pokriva je namenski test.

### Tabele sa posebnim obrascem

**`audit_logs` — samo dodavanje, nikad izmena:**

```sql
revoke insert, update, delete on public.audit_logs from authenticated, anon;
revoke update, delete on public.audit_logs from service_role;

create policy audit_select on public.audit_logs for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'view_audit_log')
  );
-- INSERT ide isključivo kroz app.write_audit(); direktan INSERT nema politiku
```

Tabela je particionisana po mesecu. Particija **mora** da nosi sopstveni RLS:
politika roditelja važi samo kada se pristupa preko roditelja, a direktan upit
nad particijom vidi isključivo njene politike. `app.ensure_audit_partitions()`
zato svakoj novoj particiji uključuje i `force` RLS.

Revizija se ne može izmeniti ni obrisati — ni od strane aplikacije, ni `service_role`-om. Brisanje se vrši samo odbacivanjem stare particije, kao deo dokumentovane retencije.

**`integration_credentials` — nikad ka klijentu:**

```sql
-- Tabela nema nijedan grant roli authenticated. Pristup ide samo kroz funkciju:
create function app.integration_credential_summary(p_integration_id uuid)
returns table (integration_id uuid, auth_type text, hint text,
               rotated_at timestamptz, expires_at timestamptz, is_expired boolean)
security definer ...
```

Funkcija vraća samo naznaku i rokove. `vault_secret_id` nije u povratnom
skupu, a test to proverava nad **stvarnim potpisom funkcije** — pa pada ako
neko sutra doda tu kolonu.

**`impersonation_sessions` — klijent sme da prekine:**

```sql
create policy imp_select on public.impersonation_sessions for select to authenticated
  using (
    staff_user_id = auth.uid()
    or organization_id in (select unnest(app.accessible_org_ids()))  -- klijent vidi ko mu je unutra
  );

create policy imp_end on public.impersonation_sessions for update to authenticated
  using (
    staff_user_id = auth.uid()
    or app.has_permission(organization_id, 'manage_users')          -- klijentski admin prekida
  )
  with check (ended_at is not null);
```

`WITH CHECK` vidi samo novi red, pa ne može da spreči produžavanje sesije
izmenom `expires_at`. Zato uz politiku stoji i trigger koji odbija promenu
bilo kog polja osim zatvaranja — sesija se ne preinačava, samo se završava.

**Katalozi bez tenant-a** (`connector_types`, `permissions`, `ai_tools`, sistemske `roles`): `SELECT` za sve prijavljene, `INSERT/UPDATE/DELETE` isključivo migracijama.

## 4. Rukovanje tajnama

Odabrano: **Supabase Vault (pgsodium)**.

- Tajna se upisuje **isključivo** iz serverskog koda pozivom `vault.create_secret()`. Aplikacija čuva samo `vault_secret_id` i `hint`.
- Dešifrovanje se dešava u `src/core/secrets/vault-provider.ts`, u okviru jednog zahteva, vrednost živi u memoriji i **nikad** ne ulazi u odgovor, log, keš ni error objekat.
- Nema API rute koja vraća tajnu. Ne postoji „prikaži lozinku". Jedina operacija nad postojećom tajnom je **zamena**.
- Rotacija piše `rotated_at` / `rotated_by` i upisuje audit zapis.
- Tip `Secret` je označen (branded) tip sa `toJSON()` koji vraća `'[REDACTED]'` — čak i slučajan `JSON.stringify` ne otkriva vrednost.
- Logger ima listu zabranjenih ključeva (`password`, `token`, `secret`, `api_key`, `authorization`, `refresh_token`, `connection_string`, `client_secret`) i redaktuje ih rekurzivno pre ispisa.

`SUPABASE_SERVICE_ROLE_KEY` postoji samo u serverskom okruženju, koristi se u tačno tri modula (migracije, seed, pozadinski poslovi) i ESLint pravilo zabranjuje njegov import iz `src/app/**`.

## 5. Autorizacija u aplikaciji

Nijedan API handler ne piše proveru „ručno". Svi prolaze kroz jedan omotač:

```ts
export const GET = withWorkspaceAuth(
  { permission: 'view_sales', rateLimit: 'read', audit: 'sales.viewed' },
  async ({ org, user, requestId }, req) => { /* org je već proveren */ }
)
```

Omotač redom radi: sesija → razrešavanje organizacije **sa servera** (iz putanje + provera članstva, nikad iz zaglavlja ili tela zahteva) → provera permisije → rate limit → Zod validacija → izvršenje → audit → normalizacija greške.

Ako ruta ne deklariše `permission`, build pada. Nema „zaboravljene" provere.

**Autorizacija nikad ne živi u promptu.** LLM ne odlučuje ko šta sme; on samo bira među alatima koje mu je server već filtrirao, a server proveru ponavlja pri izvršenju.

## 6. Ostale mere

- **Sesije:** Supabase Auth, `httpOnly` + `Secure` + `SameSite=Lax` kolačići, rotacija refresh tokena, obavezan MFA za `platform_staff`.
- **CSRF:** mutacije zahtevaju `SameSite` kolačić + `Origin` proveru; webhook rute su izuzete i umesto toga koriste HMAC potpis sa vremenskim prozorom i zaštitom od ponavljanja.
- **Rate limiting:** po korisniku, po organizaciji i po IP-u; posebni, stroži limiti za `ask_ai`, `test_connection` i `execute`.
- **Zaglavlja:** stroga CSP bez `unsafe-inline`, HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **Validacija:** Zod na granici svakog ulaza — telo, upitni parametri, putanja, webhook payload, argumenti AI alata.
- **Greške:** klijent dobija stabilan kod i lokalizovanu poruku uz `request_id`. Detalj ide u `system_events`. Nikad stack trace, nikad SQL, nikad naziv sistema klijenta.
- **Odlazni saobraćaj:** konektori idu kroz allowlist domena po integraciji, sa SSRF zaštitom (zabrana privatnih IP opsega, `metadata` endpoint-a i redirekcije van allowlist-a).
- **Fajlovi:** Supabase Storage sa putanjama `org/{organization_id}/...` i Storage RLS politikom vezanom za istu `accessible_org_ids()` funkciju; potpisani URL-ovi kratkog veka.

## 7. Testovi izolacije

Bez ovih testova model je samo namera. Tri nivoa:

**A) Na nivou baze** (`supabase/tests/`) — izvršava se u CI-ju nad realnom šemom.

Testovi su pisani u običnom SQL-u sa malim skupom tvrdnji (`testkit.assert*`),
a ne u pgTAP-u. Razlog je praktičan: `scripts/verify-db.sh` tako radi nad bilo
kojim PostgreSQL-om — lokalno, u CI-ju i na Supabase-u — bez Docker-a i bez
naloga u oblaku. Ništa se ne gubi, jer tvrdnje koje su nam potrebne staju u
tridesetak linija.

Pokriveno:
- test se **generiše nad svim tabelama** koje nose `organization_id` (trenutno 29), pa nova tabela automatski ulazi u proveru
- pre provere se traži da tuđa organizacija **stvarno ima podatke** — test koji prolazi zato što nema šta da procuri daje lažnu sigurnost
- pokušaj promene `organization_id` postojećeg reda pada (provera `WITH CHECK`)
- meta-test koji pada ako neka tabela ima `organization_id` a nema RLS, ako UPDATE politika nema `WITH CHECK`, ili ako politika koristi spori oblik poziva
- `audit_logs` ne prihvata `UPDATE` ni `DELETE` ni iz jedne role
- pristup osoblja bez aktivne sesije = 0 redova; sa aktivnom sesijom = dozvoljeno; nakon `expires_at` i nakon prekida od strane klijenta = ponovo 0
- opozvano članstvo i korisnik bez ijednog članstva ne vide ništa
- složeni strani ključ odbija poruku vezanu za razgovor druge organizacije

**B) Na nivou aplikacije** (`tests/unit/`, `tests/security/`) — trenutno pokriveno:
redakcija tajni u logovima i u revizionom tragu, provera odredišta
preusmeravanja, ograničavanje broja zahteva, normalizacija brend boje.
Skeniranje klijentskog bundle-a (`scripts/check-bundle.sh`) pada ako u
pregledač procuri `service_role`, API ključ, connection string ili privatni
ključ.

Planirano uz rute (Faza 2 i dalje):
- za svaku rutu: korisnik org A sa validnim ID-em resursa org B dobija `404` (ne `403` — ne potvrđujemo postojanje tuđeg resursa)
- podmetanje `organization_id` u telo, zaglavlje i upitni parametar se ignoriše
- korisnik bez permisije dobija `403` i audit zapis sa `status = 'denied'`
- odgovori se skeniraju regularnim izrazima na oblike tajni (nijedan odgovor ne sme sadržati `sk-`, `Bearer `, connection string)

**C) AI sloj** (`tests/security/ai-*.test.ts`):
- model koji u argumentima pošalje tuđi `organization_id` — argument se odbacuje, poziv se izvršava u ispravnoj organizaciji, upisuje se bezbednosni događaj
- model ne dobija u listi alata one koji su isključeni za organizaciju ili van korisnikovih permisija
- prompt injection u podacima (naziv kupca sa instrukcijom) ne dovodi do EXECUTE bez odobrenja

CI ne prolazi ako bilo koji od ovih testova padne. Bezbednosni testovi se ne preskaču i ne označavaju kao `skip`.
