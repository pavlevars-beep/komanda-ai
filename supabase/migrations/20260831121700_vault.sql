-- description: Čuvanje i čitanje kredencijala integracija kroz Supabase Vault.
--
-- Pravilo koje ovde važi: vrednost tajne NIKAD ne prolazi kroz rolu koja je
-- dostupna iz browsera.
--
-- Zato su obe funkcije dostupne SAMO roli service_role, a ona se koristi
-- isključivo u serverskim modulima koje ESLint brani od uvoza iz src/app i
-- src/core. Autorizaciju — sme li ovaj korisnik da dira ovu integraciju —
-- proverava pozivalac RANIJE, korisničkim klijentom i kroz RLS.
--
-- Posledica: čak i kada bi neko dobio anon ključ i validan JWT sa permisijom
-- manage_integrations, ne bi mogao da pročita nijedan kredencijal. Nedostaje
-- mu grant.

-- ---------------------------------------------------------------------------
-- Upis
-- ---------------------------------------------------------------------------

create or replace function public.vault_store_integration_secret(
  p_integration_id  uuid,
  p_organization_id uuid,
  p_value           text,
  p_hint            text,
  p_auth_type       text,
  p_expires_at      timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_old_id    uuid;
begin
  -- Integracija mora da pripada navedenoj organizaciji. Bez ove provere bi
  -- greška u pozivaocu upisala kredencijal jednog klijenta pod integraciju
  -- drugog.
  if not exists (
    select 1 from public.integrations i
    where i.id = p_integration_id and i.organization_id = p_organization_id
  ) then
    raise exception 'Integracija ne pripada navedenoj organizaciji.'
      using errcode = '42501';
  end if;

  if p_value is null or length(btrim(p_value)) = 0 then
    raise exception 'Kredencijal ne sme biti prazan.' using errcode = '22023';
  end if;

  select c.vault_secret_id into v_old_id
  from public.integration_credentials c
  where c.integration_id = p_integration_id;

  v_secret_id := vault.create_secret(
    p_value,
    format('integration:%s', p_integration_id)
  );

  insert into public.integration_credentials
    (integration_id, organization_id, vault_secret_id, auth_type, hint, rotated_at, rotated_by, expires_at)
  values
    (p_integration_id, p_organization_id, v_secret_id, p_auth_type, p_hint, now(), (select auth.uid()), p_expires_at)
  on conflict (integration_id) do update
    set vault_secret_id = excluded.vault_secret_id,
        auth_type       = excluded.auth_type,
        hint            = excluded.hint,
        rotated_at      = now(),
        rotated_by      = (select auth.uid()),
        expires_at      = excluded.expires_at;

  -- Stara tajna se briše tek pošto je nova upisana, da rotacija ne ostavi
  -- integraciju bez kredencijala ako upis pukne na pola.
  if v_old_id is not null then
    delete from vault.secrets where id = v_old_id;
  end if;
end;
$$;

revoke all on function public.vault_store_integration_secret(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.vault_store_integration_secret(uuid, uuid, text, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Čitanje
-- ---------------------------------------------------------------------------

create or replace function public.vault_read_integration_secret(
  p_integration_id  uuid,
  p_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  -- Organizacija se traži kao USLOV, ne uzima iz zapisa. Pozivalac mora da
  -- zna kojoj organizaciji integracija pripada; pogrešan par ne vraća ništa.
  select s.decrypted_secret into v_value
  from public.integration_credentials c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.integration_id = p_integration_id
    and c.organization_id = p_organization_id;

  return v_value;
end;
$$;

revoke all on function public.vault_read_integration_secret(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vault_read_integration_secret(uuid, uuid) to service_role;

comment on function public.vault_read_integration_secret is
  'Dostupna samo roli service_role. Autorizaciju proverava pozivalac pre poziva, korisničkim klijentom i kroz RLS.';

-- ---------------------------------------------------------------------------
-- Brisanje uz integraciju
-- ---------------------------------------------------------------------------
--
-- Bez ovoga bi obrisana integracija ostavila tajnu u Vault-u zauvek: red u
-- integration_credentials nestane kaskadno, a referenca na tajnu s njim.

create or replace function app.purge_integration_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

create trigger integration_credentials_purge
  after delete on public.integration_credentials
  for each row execute function app.purge_integration_secret();
