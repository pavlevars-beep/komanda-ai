-- description: Organizacije, korisnici, role, permisije i članstva.

-- ---------------------------------------------------------------------------
-- Organizacije
-- ---------------------------------------------------------------------------

create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  legal_name       text not null,
  display_name     text not null,
  industry         text,
  country          char(2) not null default 'RS',
  default_locale   text not null default 'sr',
  default_currency char(3) not null default 'RSD',
  timezone         text not null default 'Europe/Belgrade',
  status           org_status not null default 'prospect',
  plan             text not null default 'standard',
  is_platform_org  boolean not null default false,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  constraint organizations_locale_known check (default_locale in ('sr', 'en'))
);

create unique index organizations_slug_key on public.organizations (lower(slug));

-- Tačno jedna platformska organizacija (Delta Pro).
create unique index organizations_single_platform
  on public.organizations ((true)) where is_platform_org;

create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();

comment on column public.organizations.is_demo is
  'Demo organizacije postoje samo van produkcije i UI ih vidljivo označava.';

-- ---------------------------------------------------------------------------
-- Brendiranje
-- ---------------------------------------------------------------------------

create table public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  logo_url        text,
  logo_dark_url   text,
  favicon_url     text,
  primary_color   text,
  secondary_color text,
  workspace_name  text,
  welcome_message jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),

  constraint branding_primary_hex
    check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint branding_secondary_hex
    check (secondary_color is null or secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  -- Poruka dobrodošlice mora da postoji na oba jezika ili nijednom.
  constraint branding_welcome_bilingual check (
    welcome_message = '{}'::jsonb
    or (welcome_message ? 'sr' and welcome_message ? 'en')
  )
);

create trigger organization_branding_touch before update on public.organization_branding
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profili korisnika (uz auth.users)
-- ---------------------------------------------------------------------------

create table public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  avatar_url   text,
  locale       text,
  theme        text not null default 'system',
  phone        text,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint user_profiles_locale_known check (locale is null or locale in ('sr', 'en')),
  constraint user_profiles_theme_known check (theme in ('light', 'dark', 'system'))
);

create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function app.touch_updated_at();

-- Profil se pravi automatski uz nalog, da nikad ne postoji korisnik bez njega.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Permisije i role
-- ---------------------------------------------------------------------------

create table public.permissions (
  key          text primary key,
  category     text not null,
  name         jsonb not null,
  description  jsonb not null default '{}'::jsonb,
  is_sensitive boolean not null default false,

  constraint permissions_name_bilingual check (name ? 'sr' and name ? 'en')
);

create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key             text not null,
  scope           role_scope not null,
  name            jsonb not null,
  description     jsonb not null default '{}'::jsonb,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint roles_name_bilingual check (name ? 'sr' and name ? 'en'),
  -- Sistemske role nemaju organizaciju; role klijenta je moraju imati.
  constraint roles_system_has_no_org check (
    (is_system and organization_id is null) or (not is_system and organization_id is not null)
  )
);

create unique index roles_org_key on public.roles (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.role_permissions (
  role_id        uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Članstva
-- ---------------------------------------------------------------------------

create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role_id         uuid not null references public.roles(id),
  status          membership_status not null default 'invited',
  invited_by      uuid references auth.users(id),
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, user_id),
  -- Par koji omogućava složene strane ključeve iz svih tabela u vlasništvu organizacije.
  unique (organization_id, id)
);

create index organization_memberships_active
  on public.organization_memberships (user_id, organization_id) where status = 'active';

create trigger organization_memberships_touch before update on public.organization_memberships
  for each row execute function app.touch_updated_at();

-- Granularna korekcija iznad role, za pojedinačno članstvo.
create table public.membership_permission_overrides (
  membership_id  uuid not null references public.organization_memberships(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  effect         permission_effect not null,
  granted_by     uuid references auth.users(id),
  reason         text,
  created_at     timestamptz not null default now(),
  primary key (membership_id, permission_key)
);

comment on table public.membership_permission_overrides is
  'Efektivna permisija = rola UNION grant MINUS deny. Deny uvek pobeđuje.';
