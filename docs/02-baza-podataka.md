# 02 — Model baze podataka (PostgreSQL / Supabase)

Konvencije koje važe za ceo model:

- Sve tabele koje pripadaju klijentu imaju `organization_id uuid NOT NULL`.
- Svaka takva tabela ima i `UNIQUE (organization_id, id)` — nije redundantno, služi za **složene strane ključeve** koji na nivou baze garantuju da dete i roditelj pripadaju istoj organizaciji (vidi §9).
- Vremena su `timestamptz`, uvek UTC.
- Statusi su Postgres `enum` tipovi, ne slobodan tekst.
- Novčani iznosi su `numeric(18,4)` + zaseban `currency char(3)`. Nikad `float`.
- Slobodne strukture su `jsonb` sa `CHECK` validacijom gde je moguće; `jsonb` nikad ne nosi tajne.
- `created_at`, `updated_at` svuda; `updated_at` održava trigger.
- Pomoćne funkcije žive u šemi `app`, tabele u `public`, ali `public` je za role `anon`/`authenticated` **potpuno zaključan** (vidi `03-rls-i-bezbednost.md`).

---

## 1. Identitet i tenancy

```sql
create type org_status as enum ('prospect','onboarding','active','suspended','archived');

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  slug            citext not null unique,          -- koristi se u /w/[orgSlug]
  legal_name      text not null,
  display_name    text not null,
  industry        text,
  country         char(2) not null default 'RS',
  default_locale  text not null default 'sr',
  default_currency char(3) not null default 'RSD',
  timezone        text not null default 'Europe/Belgrade',
  status          org_status not null default 'prospect',
  plan            text not null default 'standard',
  is_platform_org boolean not null default false,   -- true samo za Delta Pro
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table organization_branding (
  organization_id   uuid primary key references organizations(id) on delete cascade,
  logo_url          text,
  logo_dark_url     text,
  favicon_url       text,
  primary_color     text,          -- CHECK: #RRGGBB
  secondary_color   text,
  workspace_name    text,
  welcome_message   jsonb not null default '{}'::jsonb,  -- {"sr": "...", "en": "..."}
  updated_at        timestamptz not null default now(),
  constraint primary_color_hex check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$')
);
```

> Brend boja se **ne koristi sirova**. Server je propušta kroz normalizaciju kontrasta (`src/core/branding/contrast.ts`) i izvodi pristupačnu paletu; ako klijentska boja padne ispod WCAG AA na svojoj podlozi, koristi se korigovana varijanta. Brendiranje ne sme da pokvari čitljivost.

```sql
-- auth.users je Supabase; ovde držimo aplikativni profil
create table user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  avatar_url   text,
  locale       text,                  -- null => nasledi od organizacije
  theme        text default 'system', -- light | dark | system
  phone        text,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create type membership_status as enum ('invited','active','suspended','revoked');

create table organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role_id         uuid not null references roles(id),
  status          membership_status not null default 'invited',
  invited_by      uuid references auth.users(id),
  invited_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);
create index on organization_memberships (user_id) where status = 'active';
```

## 2. RBAC

```sql
create type role_scope as enum ('platform','client');

create table roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- NULL = sistemska rola
  key             text not null,          -- 'client_owner', 'finance', ...
  scope           role_scope not null,
  name            jsonb not null,         -- {"sr": "Vlasnik", "en": "Owner"}
  description     jsonb not null default '{}'::jsonb,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  unique nulls not distinct (organization_id, key)
);

create table permissions (
  key          text primary key,      -- 'view_financial_data'
  category     text not null,         -- 'data' | 'ai' | 'admin' | 'security'
  name         jsonb not null,
  description  jsonb not null default '{}'::jsonb,
  is_sensitive boolean not null default false
);

create table role_permissions (
  role_id        uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- granularna korekcija iznad role, po pojedinačnom članstvu
create type permission_effect as enum ('grant','deny');
create table membership_permission_overrides (
  membership_id  uuid not null references organization_memberships(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  effect         permission_effect not null,
  granted_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  primary key (membership_id, permission_key)
);
```

**Efektivna permisija** = `role_permissions` ∪ `override(grant)` − `override(deny)`. `deny` uvek pobeđuje. Izračunava se u `app.has_permission()` i koristi se identično u RLS-u i u aplikaciji — jedna definicija, bez duplirane logike.

Početne role (sistemske): `platform_super_admin`, `platform_consultant`, `platform_support`, `client_owner`, `client_admin`, `manager`, `finance`, `sales`, `employee`, `viewer`.

Početne permisije: `view_financial_data`, `view_sales`, `view_customers`, `view_inventory`, `view_documents`, `ask_ai`, `run_reports`, `manage_integrations`, `manage_users`, `manage_branding`, `approve_actions`, `execute_actions`, `view_audit_log`, `manage_alerts`, `manage_reports`, `export_data`.

## 3. Delta Pro osoblje i impersonation

```sql
create type staff_role as enum ('super_admin','consultant','support');

create table platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  staff_role staff_role not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table client_assignments (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  assigned_by     uuid not null references auth.users(id),
  assigned_at     timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (staff_user_id, organization_id)
);

create type impersonation_scope as enum ('read_only','full');

create table impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id),
  organization_id uuid not null references organizations(id) on delete cascade,
  reason          text not null check (length(reason) between 10 and 500),
  scope           impersonation_scope not null default 'read_only',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  ended_by        uuid references auth.users(id),
  ip              inet,
  user_agent      text,
  request_count   integer not null default 0,
  constraint max_duration check (expires_at <= started_at + interval '8 hours')
);
create index on impersonation_sessions (organization_id) where ended_at is null;
```

Aktivna sesija = `ended_at is null and now() < expires_at`. Klijentski administrator sme da postavi `ended_at` za sesije u **svojoj** organizaciji — to je izričito dozvoljeno RLS-om.

## 4. Integracije i izvori podataka

```sql
-- katalog konektora: NIJE tenant-scoped, ovo je proizvodni katalog
create type connector_availability as enum ('ga','beta','planned');
create table connector_types (
  key                text primary key,     -- 'rest','webhook','demo','mssql','mis_erp'
  name               jsonb not null,
  category           text not null,        -- 'database','api','file','erp','crm','office'
  availability       connector_availability not null default 'planned',
  supported_auth     text[] not null default '{}',
  capability_manifest jsonb not null default '[]'::jsonb,
  supports_agent     boolean not null default false,
  docs_url           text
);

create type integration_status as enum ('draft','testing','connected','needs_attention','disconnected','disabled');
create type environment_kind as enum ('sandbox','production');

create table integrations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  connector_type_key  text not null references connector_types(key),
  name                text not null,
  environment         environment_kind not null default 'sandbox',
  status              integration_status not null default 'draft',
  auth_type           text not null,
  config              jsonb not null default '{}'::jsonb,  -- BEZ TAJNI (base_url, db name, timeouts)
  data_scope          jsonb not null default '{}'::jsonb,  -- koje tabele/entiteti/periodi su dozvoljeni
  is_read_only        boolean not null default true,
  created_by          uuid not null references auth.users(id),
  last_success_at     timestamptz,
  last_sync_at        timestamptz,
  last_error_at       timestamptz,
  last_error_code     text,
  last_error_message  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name, environment)
);

-- METAPODACI o tajni. Vrednost nikad ne postoji u ovoj tabeli.
create table integration_credentials (
  integration_id  uuid primary key references integrations(id) on delete cascade,
  organization_id uuid not null,
  vault_secret_id uuid not null,            -- referenca ka vault.secrets
  auth_type       text not null,
  hint            text,                     -- npr. 'sk-••••4f2a' ili 'svc_readonly@erp'
  rotated_at      timestamptz,
  rotated_by      uuid references auth.users(id),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, integration_id) references integrations(organization_id, id) on delete cascade
);

create type capability_mode as enum ('read','prepare','execute');

create table integration_capabilities (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  integration_id      uuid not null,
  capability_key      text not null,        -- 'get_daily_sales'
  enabled             boolean not null default false,
  mode                capability_mode not null default 'read',
  required_permission text not null references permissions(key),
  config              jsonb not null default '{}'::jsonb,
  freshness_sla_seconds integer,
  enabled_by          uuid references auth.users(id),
  enabled_at          timestamptz,
  unique (integration_id, capability_key),
  unique (organization_id, id),
  foreign key (organization_id, integration_id) references integrations(organization_id, id) on delete cascade
);

create table integration_health_checks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_id  uuid not null,
  checked_at      timestamptz not null default now(),
  ok              boolean not null,
  latency_ms      integer,
  error_code      text,
  error_message   text,        -- redaktovano, bez tajni i bez stack trace-a
  checked_by      uuid references auth.users(id),   -- null = automatska provera
  foreign key (organization_id, integration_id) references integrations(organization_id, id) on delete cascade
);
create index on integration_health_checks (integration_id, checked_at desc);

create table data_sources (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  integration_id     uuid,
  name               text not null,
  kind               text not null,    -- 'sales','customers','inventory','documents','leads'
  refresh_interval_seconds integer,
  freshness_sla_seconds    integer,
  last_refreshed_at  timestamptz,
  record_count       bigint,
  is_demo            boolean not null default false,
  unique (organization_id, id),
  foreign key (organization_id, integration_id) references integrations(organization_id, id) on delete set null
);
```

**Lokalni agent (pripremljeno, ne gradi se u MVP-u):**

```sql
create table connector_agents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  fingerprint      text not null unique,
  public_key       text not null,
  version          text,
  status           text not null default 'pending',   -- pending|online|offline|revoked
  last_heartbeat_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (organization_id, id)
);

create table agent_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id        uuid not null,
  capability_key  text not null,
  input           jsonb not null,
  status          text not null default 'queued',     -- queued|claimed|done|failed|expired
  claimed_at      timestamptz,
  completed_at    timestamptz,
  result_ref      text,
  error           text,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, agent_id) references connector_agents(organization_id, id) on delete cascade
);
```

Agent isključivo **odlazno** poziva `POST /api/agent/claim` i `POST /api/agent/report`. Cloud nikad ne inicira vezu ka klijentskoj mreži.

## 5. AI sloj

```sql
create type claim_classification as enum ('fact','calculation','interpretation','forecast');

-- registar alata: proizvodni katalog, nije tenant-scoped
create table ai_tools (
  key                 text primary key,     -- 'get_daily_sales'
  name                jsonb not null,
  description         jsonb not null,
  required_permission text not null references permissions(key),
  connector_type_key  text references connector_types(key),
  capability_key      text,
  input_schema        jsonb not null,
  output_schema       jsonb not null,
  classification      claim_classification not null default 'fact',
  mode                capability_mode not null default 'read',
  audit_always        boolean not null default true,
  is_system           boolean not null default true
);

create table organization_ai_tools (
  organization_id uuid not null references organizations(id) on delete cascade,
  ai_tool_key     text not null references ai_tools(key) on delete cascade,
  enabled         boolean not null default false,
  integration_id  uuid,
  config          jsonb not null default '{}'::jsonb,
  enabled_by      uuid references auth.users(id),
  enabled_at      timestamptz,
  primary key (organization_id, ai_tool_key),
  foreign key (organization_id, integration_id) references integrations(organization_id, id) on delete set null
);

create table ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text,
  locale          text not null default 'sr',
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at     timestamptz,
  unique (organization_id, id)
);

create type message_role as enum ('user','assistant','tool','system');

create table ai_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  role            message_role not null,
  content         text,
  provenance      jsonb not null default '{}'::jsonb,  -- izvori, freshness, klasifikacije
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, conversation_id)
    references ai_conversations(organization_id, id) on delete cascade
);

create table ai_tool_calls (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  message_id         uuid not null,
  ai_tool_key        text not null references ai_tools(key),
  integration_id     uuid,
  input              jsonb not null,
  output_summary     jsonb,          -- sažetak, ne pun dataset
  row_count          integer,
  status             text not null,  -- ok|denied|error|timeout
  denied_reason      text,
  permission_checked text not null,
  data_as_of         timestamptz,    -- freshness podatka koji je vraćen
  latency_ms         integer,
  created_at         timestamptz not null default now(),
  foreign key (organization_id, message_id) references ai_messages(organization_id, id) on delete cascade
);

create table ai_usage_daily (
  organization_id uuid not null references organizations(id) on delete cascade,
  day             date not null,
  provider        text not null,
  model           text not null,
  call_count      integer not null default 0,
  input_tokens    bigint not null default 0,
  output_tokens   bigint not null default 0,
  cost_micros     bigint not null default 0,
  primary key (organization_id, day, provider, model)
);
```

## 6. Odobrenja i izvršenja

```sql
create type risk_level as enum ('low','medium','high','critical');
create type approval_status as enum ('pending','approved','rejected','expired','executing','executed','failed');

create table approvals (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  action_type           text not null,        -- 'send_email','create_crm_task','publish_article'
  title                 text not null,
  summary               jsonb not null default '{}'::jsonb,   -- {sr, en}
  payload               jsonb not null,       -- validiran šemom akcije
  target_system         text,
  target_integration_id uuid,
  risk_level            risk_level not null default 'medium',
  requires_two_person   boolean not null default false,
  status                approval_status not null default 'pending',
  requested_by_user_id  uuid references auth.users(id),
  requested_by_message_id uuid,               -- ai_messages.id ako je AI predložio
  ai_reason             text,
  source_refs           jsonb not null default '[]'::jsonb,   -- na osnovu kojih podataka
  idempotency_key       text not null,
  expires_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, target_integration_id)
    references integrations(organization_id, id) on delete set null
);

create type decision_kind as enum ('approve','reject','edit');

create table approval_decisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_id     uuid not null,
  decision        decision_kind not null,
  decided_by      uuid not null references auth.users(id),
  decided_at      timestamptz not null default now(),
  comment         text,
  edited_payload  jsonb,
  foreign key (organization_id, approval_id) references approvals(organization_id, id) on delete cascade,
  unique (approval_id, decided_by, decision)   -- ista osoba ne odobrava dvaput (dvostruko odobrenje)
);

create table action_executions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_id     uuid not null,
  attempt         integer not null default 1,
  status          text not null,     -- running|succeeded|failed
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  result          jsonb,
  error_code      text,
  error_message   text,
  foreign key (organization_id, approval_id) references approvals(organization_id, id) on delete cascade,
  unique (approval_id, attempt)
);
```

## 7. Upozorenja, izveštaji, automatizacije

```sql
create type alert_severity as enum ('info','warning','critical');
create type alert_status   as enum ('new','acknowledged','resolved','dismissed');

create table alert_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null,
  name            jsonb not null,
  severity        alert_severity not null default 'warning',
  condition       jsonb not null,      -- deklarativno: {metric, operator, threshold, window}
  data_source_id  uuid,
  enabled         boolean not null default true,
  cooldown_seconds integer not null default 3600,
  notify_role_ids uuid[] not null default '{}',
  created_by      uuid references auth.users(id),
  unique (organization_id, key),
  unique (organization_id, id)
);

create table alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  alert_rule_id   uuid,
  severity        alert_severity not null,
  title           text not null,
  body            jsonb not null default '{}'::jsonb,
  source          text not null,        -- 'integration' | 'rule' | 'system' | 'ai'
  status          alert_status not null default 'new',
  assigned_to     uuid references auth.users(id),
  dedupe_key      text,
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz, acknowledged_by uuid references auth.users(id),
  resolved_at     timestamptz, resolved_by     uuid references auth.users(id),
  unique (organization_id, id),
  unique (organization_id, dedupe_key, status) deferrable initially deferred,
  foreign key (organization_id, alert_rule_id) references alert_rules(organization_id, id) on delete set null
);

create table report_definitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null,
  name            jsonb not null,
  description     jsonb not null default '{}'::jsonb,
  spec            jsonb not null,        -- sekcije, metrike, alati koji se pozivaju
  schedule_cron   text,
  timezone        text not null default 'Europe/Belgrade',
  recipients      jsonb not null default '[]'::jsonb,
  required_permission text not null references permissions(key),
  enabled         boolean not null default true,
  created_by      uuid references auth.users(id),
  unique (organization_id, key),
  unique (organization_id, id)
);

create table report_runs (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  report_definition_id  uuid not null,
  status                text not null default 'running',  -- running|succeeded|failed
  period_start          timestamptz, period_end timestamptz,
  filters               jsonb not null default '{}'::jsonb,
  triggered_by          text not null,      -- 'user' | 'schedule' | 'ai'
  triggered_by_user_id  uuid references auth.users(id),
  data_sources          jsonb not null default '[]'::jsonb,   -- provenance
  summary               text,
  artifact_path         text,               -- Supabase Storage, tenant-scoped putanja
  generated_at          timestamptz,
  error_message         text,
  created_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, report_definition_id)
    references report_definitions(organization_id, id) on delete cascade
);

create table automation_workflows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider        text not null default 'n8n',
  external_ref    text not null,        -- n8n workflow id — nikad se ne prikazuje klijentu
  name            jsonb not null,
  trigger_type    text not null,        -- 'schedule'|'event'|'manual'
  enabled         boolean not null default true,
  last_run_at     timestamptz,
  last_status     text,
  unique (organization_id, id)
);

create table automation_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id     uuid not null,
  status          text not null,        -- running|succeeded|failed
  trigger         text not null,
  correlation_id  text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error_message   text,
  steps           jsonb not null default '[]'::jsonb,
  foreign key (organization_id, workflow_id)
    references automation_workflows(organization_id, id) on delete cascade
);
```

## 8. Nadzor i revizija

```sql
create type audit_actor_type as enum ('user','staff','system','ai');
create type audit_status     as enum ('success','failure','denied');

create table audit_logs (
  id                       bigint generated always as identity,
  organization_id          uuid,          -- NULL = platformski događaj
  actor_user_id            uuid,
  actor_type               audit_actor_type not null,
  impersonation_session_id uuid references impersonation_sessions(id),
  action                   text not null,        -- 'integration.credentials.updated'
  resource_type            text,
  resource_id              text,
  integration_id           uuid,
  status                   audit_status not null,
  reason                   text,
  request_id               text not null,
  ip                       inet,
  user_agent               text,
  metadata                 jsonb not null default '{}'::jsonb,   -- redaktovano
  occurred_at              timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);
-- mesečne particije; retencija se konfiguriše po planu (podrazumevano 24 meseca)

create index on audit_logs (organization_id, occurred_at desc);
create index on audit_logs (actor_user_id, occurred_at desc);

create table system_events (
  id              bigint generated always as identity primary key,
  severity        text not null,     -- info|warning|error|critical
  component       text not null,     -- 'connector.rest','ai.orchestrator','auth'
  code            text not null,
  message         text not null,
  organization_id uuid,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now()
);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null,
  title           text not null,
  body            text,
  link            text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create table onboarding_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null,   -- 'company_created','branding','users_invited', ...
  status          text not null default 'pending',  -- pending|in_progress|done|skipped
  completed_at    timestamptz,
  completed_by    uuid references auth.users(id),
  note            text,
  unique (organization_id, key)
);
```

Onboarding koraci (redosled je fiksan, prikazuje se kao lista sa napretkom):
`company_created` → `branding` → `users_invited` → `data_source_connected` → `connection_tested` → `permissions_configured` → `ai_tools_enabled` → `dashboard_configured` → `first_report_generated` → `production_enabled`

## 9. Zaštita od unakrsnog povezivanja organizacija

Klasičan propust u multi-tenant sistemima: `ai_messages` sa `conversation_id` koji pripada drugoj organizaciji. RLS to obično uhvati, ali ne uvek — i ne hvata greške u pozadinskim poslovima koji rade sa povišenim pravima.

Zato svaki roditelj ima `UNIQUE (organization_id, id)`, a svako dete koristi **složeni strani ključ**:

```sql
foreign key (organization_id, conversation_id)
  references ai_conversations (organization_id, id)
```

Baza tada **fizički ne dozvoljava** da dete pokazuje na roditelja iz druge organizacije — nezavisno od RLS-a, aplikativnog koda i pozadinskih poslova. Ovo je primenjeno na sve relacije roditelj–dete u modelu.

## 10. Migracije i seed

- `supabase/migrations/` — imenovane po Supabase konvenciji `<vreme>_naziv.sql`, jednosmerne, svaka sa `-- description:` zaglavljem.
- Nijedna migracija ne uključuje tajne ni realne kredencijale.
- `supabase/seed/` — deterministički, isključivo za razvoj:
  - **Delta Pro** (platformska organizacija, Super Admin + Konsultant)
  - **Demo Distribucija d.o.o.** (veleprodaja: prodaja, potraživanja, zalihe)
  - **Demo Hotel Grupa** (hotelijerstvo: zauzetost, prihod, upiti gostiju)
- Sav seed podatak nosi `is_demo = true` i UI ga vidljivo označava trakom „Demo podaci".
- Seed namerno kreira korisnike sa **istim e-mail domenom** u različitim organizacijama — da testovi izolacije budu realni.
