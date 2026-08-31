# 03 — RLS model i bezbednost

## 1. Četiri brave

Izolacija podataka ne oslanja se na jedan mehanizam. Da bi podatak iz organizacije A procurio korisniku iz organizacije B, moraju **istovremeno** otkazati četiri nezavisna sloja:

| # | Sloj | Šta štiti | Gde živi |
|---|---|---|---|
| 1 | **GRANT / REVOKE** | `anon` i `authenticated` role nemaju prava nad tabelama | `supabase/migrations/0001_lockdown.sql` |
| 2 | **RLS politike** | red je vidljiv samo ako organizacija pripada korisniku | uz svaku tabelu |
| 3 | **Aplikativni scope** | svaki upit ide kroz repozitorijum koji obavezno prima `OrgContext` | `src/core/**/repository.ts` |
| 4 | **Složeni strani ključevi** | dete ne može pripadati drugoj organizaciji od roditelja | šema baze |

Sloj 1 je poseban i vredi ga naglasiti: pošto browser ne priča direktno sa PostgREST-om, **oduzimamo sva prava rolama koje su dostupne iz browsera**. Čak i da neko dobije `anon` ključ i RLS politika ima grešku — nema `SELECT` pravo, upit pada na nivou privilegija.

```sql
-- 0001_lockdown.sql
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- servisni kod se povezuje kao dedikovana rola sa RLS-om koji I DALJE važi
create role app_user nologin;
grant usage on schema public, app to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
alter role app_user set row_security = on;   -- eksplicitno, nikad BYPASSRLS
```

`app_user` **nema** `BYPASSRLS`. Čak i naš serverski kod prolazi kroz RLS.

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

**Ključno za performanse:** politika `organization_id = any(app.accessible_org_ids())` bi pozivala funkciju za svaki red. Umesto toga koristi se oblik koji Postgres izvršava **jednom po naredbi** (InitPlan):

```sql
using (organization_id in (select unnest(app.accessible_org_ids())))
```

Ovaj oblik je obavezan u svim politikama. Postoji lint provera (`supabase/tests/policy_shape.sql`) koja odbija politiku napisanu na spori način.

## 3. Obrazac politika

Za svaku tenant tabelu — četiri politike, nikad `for all`:

```sql
alter table public.alerts enable row level security;
alter table public.alerts force row level security;   -- važi i za vlasnika tabele

create policy alerts_select on public.alerts for select to app_user
  using (organization_id in (select unnest(app.accessible_org_ids())));

create policy alerts_insert on public.alerts for insert to app_user
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

create policy alerts_update on public.alerts for update to app_user
  using      (organization_id in (select unnest(app.accessible_org_ids())))
  with check (organization_id in (select unnest(app.accessible_org_ids())));

create policy alerts_delete on public.alerts for delete to app_user
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
revoke update, delete on public.audit_logs from app_user, authenticated, anon, service_role;

create policy audit_select on public.audit_logs for select to app_user
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'view_audit_log')
  );
-- INSERT ide isključivo kroz app.write_audit() (SECURITY DEFINER); direktan INSERT nema politiku
```

Revizija se ne može izmeniti ni obrisati — ni od strane aplikacije, ni `service_role`-om. Brisanje se vrši samo odbacivanjem stare particije, kao deo dokumentovane retencije.

**`integration_credentials` — nikad ka klijentu:**

```sql
create policy cred_select on public.integration_credentials for select to app_user
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );
```

Vraća samo `hint`, `rotated_at`, `expires_at`. Kolona `vault_secret_id` se ne serijalizuje ka klijentu — repozitorijum je eksplicitno izostavlja iz svakog DTO-a, a test to proverava.

**`impersonation_sessions` — klijent sme da prekine:**

```sql
create policy imp_select on public.impersonation_sessions for select to app_user
  using (
    staff_user_id = auth.uid()
    or organization_id in (select unnest(app.accessible_org_ids()))  -- klijent vidi ko mu je unutra
  );

create policy imp_end on public.impersonation_sessions for update to app_user
  using (
    staff_user_id = auth.uid()
    or app.has_permission(organization_id, 'manage_users')          -- klijentski admin prekida
  )
  with check (ended_at is not null);
```

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

**A) pgTAP, na nivou baze** (`supabase/tests/`) — izvršava se u CI-ju nad realnom šemom:
- za **svaku** tabelu sa `organization_id`: korisnik org A dobija 0 redova org B (`SELECT`, `UPDATE`, `DELETE`, `INSERT` sa tuđim `organization_id`)
- pokušaj promene `organization_id` postojećeg reda pada (provera `WITH CHECK`)
- generisani test koji **nabraja sve tabele** i pada ako neka ima `organization_id` a nema uključen RLS — tako nova tabela ne može da se doda bez politike
- `audit_logs` ne prihvata `UPDATE` ni `DELETE` ni iz jedne role
- pristup osoblja bez aktivne sesije = 0 redova; sa aktivnom sesijom = dozvoljeno; nakon `expires_at` = ponovo 0

**B) Integracioni, na nivou API-ja** (`tests/security/`):
- za svaku rutu: korisnik org A sa validnim ID-em resursa org B dobija `404` (ne `403` — ne potvrđujemo postojanje tuđeg resursa)
- podmetanje `organization_id` u telo, zaglavlje i upitni parametar se ignoriše
- korisnik bez permisije dobija `403` i audit zapis sa `status = 'denied'`
- odgovori se skeniraju regularnim izrazima na oblike tajni (nijedan odgovor ne sme sadržati `sk-`, `Bearer `, connection string)

**C) AI sloj** (`tests/security/ai-*.test.ts`):
- model koji u argumentima pošalje tuđi `organization_id` — argument se odbacuje, poziv se izvršava u ispravnoj organizaciji, upisuje se bezbednosni događaj
- model ne dobija u listi alata one koji su isključeni za organizaciju ili van korisnikovih permisija
- prompt injection u podacima (naziv kupca sa instrukcijom) ne dovodi do EXECUTE bez odobrenja

CI ne prolazi ako bilo koji od ovih testova padne. Bezbednosni testovi se ne preskaču i ne označavaju kao `skip`.
