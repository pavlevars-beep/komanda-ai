-- description: Provere koje sprečavaju da se nova tabela doda bez izolacije.
--
-- Ove funkcije nisu dekoracija — koriste ih pgTAP testovi u CI-ju. Ako neko
-- doda tabelu sa organization_id a zaboravi RLS, build pada. Bez toga se
-- izolacija tenanta održava disciplinom, a disciplina vremenom popušta.

-- Tabele koje nose organization_id, a nemaju uključen ili prinuđen RLS.
create or replace function app.tables_missing_rls()
returns table (table_name text, has_rls boolean, has_force boolean)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid
        and a.attname = 'organization_id'
        and a.attnum > 0
        and not a.attisdropped
    )
    and (not c.relrowsecurity or not c.relforcerowsecurity);
$$;

-- Tabele sa uključenim RLS-om, ali bez ijedne politike — što znači da niko
-- ne vidi ništa, pa je greška isto tako ozbiljna, samo tiša.
create or replace function app.tables_without_policies()
returns table (table_name text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity
    -- Particije nemaju sopstvene politike jer se pristupa preko roditelja,
    -- a direktan pristup je zatvoren i privilegijama i uključenim RLS-om.
    and not c.relispartition
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    -- Tabele u koje se piše isključivo kroz SECURITY DEFINER funkcije
    -- namerno imaju samo politiku za čitanje ili nijednu.
    and c.relname not in ('integration_credentials');
$$;

-- UPDATE politike bez WITH CHECK izraza.
--
-- Ovo je najopasniji propust u RLS modelu: bez WITH CHECK korisnik sme da
-- izmeni organization_id postojećeg reda i time premesti zapis u tuđu
-- organizaciju, a da nijedan SELECT test to ne primeti.
create or replace function app.update_policies_without_check()
returns table (table_name text, policy_name text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, p.polname::text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and p.polcmd = 'w'          -- UPDATE
    and p.polwithcheck is null;
$$;

-- Politike koje pozivaju app.accessible_org_ids() ili app.administrable_org_ids()
-- bez skalarnog podupita, pa se funkcija izvršava jednom po REDU umesto
-- jednom po naredbi. Radi ispravno, ali ne skalira.
create or replace function app.policies_with_slow_shape()
returns table (table_name text, policy_name text, expression text)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, p.polname::text, expr
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select coalesce(pg_get_expr(p.polqual, p.polrelid), '')
           || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
  ) e
  where n.nspname = 'public'
    and (expr like '%accessible_org_ids%' or expr like '%administrable_org_ids%')
    -- Ispravan oblik uvek sadrži podupit: ( SELECT unnest(app...._org_ids()) )
    and expr !~ 'SELECT unnest\(app\.(accessible|administrable)_org_ids\(\)\)';
$$;

grant execute on function
  app.tables_missing_rls(),
  app.tables_without_policies(),
  app.update_policies_without_check(),
  app.policies_with_slow_shape()
to service_role;
