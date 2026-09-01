-- description: Katalog konektora, integracije, kredencijali i izvori podataka.

-- ---------------------------------------------------------------------------
-- Katalog konektora (proizvodni katalog, nije u vlasništvu organizacije)
-- ---------------------------------------------------------------------------

create table public.connector_types (
  key                 text primary key,
  name                jsonb not null,
  category            text not null,
  availability        connector_availability not null default 'planned',
  supported_auth      text[] not null default '{}',
  capability_manifest jsonb not null default '[]'::jsonb,
  supports_agent      boolean not null default false,
  docs_url            text,

  constraint connector_types_name_bilingual check (name ? 'sr' and name ? 'en')
);

alter table public.connector_types enable row level security;
alter table public.connector_types force row level security;
grant select on public.connector_types to authenticated;

create policy connector_types_select on public.connector_types
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Integracije
-- ---------------------------------------------------------------------------

create table public.integrations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  connector_type_key text not null references public.connector_types(key),
  name               text not null,
  environment        environment_kind not null default 'sandbox',
  status             integration_status not null default 'draft',
  auth_type          text not null,
  -- Konfiguracija BEZ tajni: bazna adresa, naziv baze, timeout-i.
  config             jsonb not null default '{}'::jsonb,
  data_scope         jsonb not null default '{}'::jsonb,
  is_read_only       boolean not null default true,
  is_demo            boolean not null default false,
  created_by         uuid not null references auth.users(id),
  last_success_at    timestamptz,
  last_sync_at       timestamptz,
  last_error_at      timestamptz,
  last_error_code    text,
  last_error_message text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, name, environment)
);

create index integrations_by_org on public.integrations (organization_id, status);

create trigger integrations_touch before update on public.integrations
  for each row execute function app.touch_updated_at();

comment on column public.integrations.config is
  'Nikad ne sadrži tajne. Tajne žive u Supabase Vault-u, ovde je samo referenca u integration_credentials.';

alter table public.integrations enable row level security;
alter table public.integrations force row level security;
grant select, insert, update, delete on public.integrations to authenticated;

-- Integracije su konfiguracija — vide se kroz administrativni pristup.
-- Klijentski korisnik ih vidi samo ako ima manage_integrations.
create policy integrations_select on public.integrations
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

create policy integrations_insert on public.integrations
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy integrations_update on public.integrations
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy integrations_delete on public.integrations
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Kredencijali: METAPODACI. Vrednost tajne ovde ne postoji.
-- ---------------------------------------------------------------------------

create table public.integration_credentials (
  integration_id  uuid primary key,
  organization_id uuid not null,
  vault_secret_id uuid not null,
  auth_type       text not null,
  -- Naznaka koju korisnik prepoznaje, npr. 'sk-••••4f2a'. Nikad puna vrednost.
  hint            text,
  rotated_at      timestamptz,
  rotated_by      uuid references auth.users(id),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),

  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

alter table public.integration_credentials enable row level security;
alter table public.integration_credentials force row level security;

-- Namerno BEZ ijednog granta roli authenticated.
--
-- Ova tabela nosi referencu na tajnu u Vault-u. Čak i kada bi RLS politika
-- imala grešku, bez granta upit pada na nivou privilegija. Aplikacija čita
-- bezbedan podskup kroz app.integration_credential_summary().
revoke all on public.integration_credentials from authenticated, anon;

create or replace function app.integration_credential_summary(p_integration_id uuid)
returns table (
  integration_id uuid,
  auth_type text,
  hint text,
  rotated_at timestamptz,
  expires_at timestamptz,
  is_expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.integration_id, c.auth_type, c.hint, c.rotated_at, c.expires_at,
         (c.expires_at is not null and c.expires_at <= now()) as is_expired
  from public.integration_credentials c
  where c.integration_id = p_integration_id
    and c.organization_id = any (app.administrable_org_ids())
    and app.has_permission(c.organization_id, 'manage_integrations');
$$;

comment on function app.integration_credential_summary(uuid) is
  'Jedini put do podataka o kredencijalu iz aplikacije. Vraća naznaku i rokove — nikad vault_secret_id ni vrednost.';

grant execute on function app.integration_credential_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sposobnosti integracije
-- ---------------------------------------------------------------------------

create table public.integration_capabilities (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  integration_id        uuid not null,
  capability_key        text not null,
  enabled               boolean not null default false,
  mode                  capability_mode not null default 'read',
  required_permission   text not null references public.permissions(key),
  config                jsonb not null default '{}'::jsonb,
  freshness_sla_seconds integer,
  enabled_by            uuid references auth.users(id),
  enabled_at            timestamptz,

  unique (integration_id, capability_key),
  unique (organization_id, id),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

alter table public.integration_capabilities enable row level security;
alter table public.integration_capabilities force row level security;
grant select, insert, update, delete on public.integration_capabilities to authenticated;

create policy capabilities_select on public.integration_capabilities
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

create policy capabilities_insert on public.integration_capabilities
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy capabilities_update on public.integration_capabilities
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy capabilities_delete on public.integration_capabilities
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Provere zdravlja
-- ---------------------------------------------------------------------------

create table public.integration_health_checks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_id  uuid not null,
  checked_at      timestamptz not null default now(),
  ok              boolean not null,
  latency_ms      integer,
  error_code      text,
  -- Redaktovana poruka. Nikad stack trace, nikad connection string.
  error_message   text,
  checked_by      uuid references auth.users(id),

  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

create index health_checks_recent
  on public.integration_health_checks (integration_id, checked_at desc);

alter table public.integration_health_checks enable row level security;
alter table public.integration_health_checks force row level security;
grant select, insert on public.integration_health_checks to authenticated;

create policy health_select on public.integration_health_checks
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

create policy health_insert on public.integration_health_checks
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Izvori podataka
-- ---------------------------------------------------------------------------

create table public.data_sources (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  integration_id           uuid,
  name                     text not null,
  kind                     text not null,
  refresh_interval_seconds integer,
  freshness_sla_seconds    integer,
  last_refreshed_at        timestamptz,
  record_count             bigint,
  is_demo                  boolean not null default false,
  created_at               timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete set null
);

alter table public.data_sources enable row level security;
alter table public.data_sources force row level security;
grant select, insert, update, delete on public.data_sources to authenticated;

-- Izvore podataka vidi i klijentski korisnik — potreban mu je podatak o svežini.
create policy data_sources_select on public.data_sources
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy data_sources_insert on public.data_sources
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy data_sources_update on public.data_sources
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy data_sources_delete on public.data_sources
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Lokalni konektor: pripremljena struktura (agent se gradi kasnije)
-- ---------------------------------------------------------------------------

create table public.connector_agents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  fingerprint       text not null unique,
  public_key        text not null,
  version           text,
  status            text not null default 'pending',
  last_heartbeat_at timestamptz,
  created_at        timestamptz not null default now(),

  unique (organization_id, id),
  constraint connector_agents_status_known
    check (status in ('pending', 'online', 'offline', 'revoked'))
);

create table public.agent_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null,
  capability_key  text not null,
  input           jsonb not null,
  status          text not null default 'queued',
  claimed_at      timestamptz,
  completed_at    timestamptz,
  result_ref      text,
  error           text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),

  constraint agent_jobs_status_known
    check (status in ('queued', 'claimed', 'done', 'failed', 'expired')),
  foreign key (organization_id, agent_id)
    references public.connector_agents (organization_id, id) on delete cascade
);

alter table public.connector_agents enable row level security;
alter table public.connector_agents force row level security;
grant select on public.connector_agents to authenticated;

create policy agents_select on public.connector_agents
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

alter table public.agent_jobs enable row level security;
alter table public.agent_jobs force row level security;
grant select on public.agent_jobs to authenticated;

create policy agent_jobs_select on public.agent_jobs
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

comment on table public.agent_jobs is
  'Red poslova koje lokalni agent preuzima ODLAZNOM vezom. Cloud nikad ne inicira vezu ka mreži klijenta. Upis ide kroz servisni sloj.';
