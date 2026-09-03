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

-- Označava ovu bazu kao razvojnu. Produkcijska baza ovu oznaku NEMA, pa
-- migracija 00170 tamo odbija svaki upis demo podataka.
do $$
begin
  execute format('alter database %I set app.environment = %L', current_database(), 'development');
end
$$;

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

-- Na Supabase-u je ovo pogled nad pgsodium dešifrovanjem; lokalno je vrednost
-- u čistom obliku, jer se testira TOK, a ne sama kriptografija.
create or replace view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret, created_at from vault.secrets;

-- Namerno bez ijednog granta: ni lokalno rola authenticated ne sme do tajni.
revoke all on schema vault from anon, authenticated;

-- Storage: lokalno samo tabele i pomoćna funkcija, da bi migracija koja pravi
-- kofu i politike mogla da se primeni. Na Supabase-u ovim upravlja sam
-- storage servis; ovde se proverava da je SQL ispravan, ne da fajl stigne.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets(id) on delete cascade,
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Na Supabase-u vraća segmente putanje bez naziva fajla; ovde isto, jer se
-- politika oslanja baš na prvi segment.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
