-- LOKALNI TEST HARNESS — nije deo migracija i ne izvršava se na Supabase-u.
--
-- Emulira ono što Supabase obezbeđuje (role, auth šemu, auth.uid(), vault),
-- da bi migracije i testovi izolacije mogli da se pokrenu nad običnim
-- PostgreSQL-om, u CI-ju i lokalno, bez Docker-a i bez naloga u oblaku.

-- Role su u PostgreSQL-u na nivou klastera, ne baze, pa kreiranje mora
-- da bude idempotentno da bi skript mogao da se pokrene više puta.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Identično ponašanje kao na Supabase-u: identitet se čita iz JWT claim-ova
-- koje PostgREST postavlja kao GUC za trajanje transakcije.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Vault: lokalno je samo tabela, da bi strani ključevi i tokovi radili.
-- Na Supabase-u je ovo šifrovano skladište (pgsodium).
create schema if not exists vault;

create table vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  secret      text not null,
  created_at  timestamptz not null default now()
);

create or replace function vault.create_secret(new_secret text, new_name text default null)
returns uuid
language sql
as $$
  insert into vault.secrets (secret, name) values (new_secret, new_name) returning id;
$$;

-- Namerno bez ijednog granta: ni lokalno rola authenticated ne sme do tajni.
revoke all on schema vault from anon, authenticated;
