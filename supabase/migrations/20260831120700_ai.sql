-- description: Registar AI alata, razgovori, poruke i trag poziva alata.

-- Registar alata je proizvodni katalog. Definicija alata — a ne model —
-- određuje traženu permisiju i klasifikaciju tvrdnje.
create table public.ai_tools (
  key                 text primary key,
  name                jsonb not null,
  description         jsonb not null default '{}'::jsonb,
  required_permission text not null references public.permissions(key),
  connector_type_key  text references public.connector_types(key),
  capability_key      text,
  input_schema        jsonb not null,
  output_schema       jsonb not null,
  classification      claim_classification not null default 'fact',
  mode                capability_mode not null default 'read',
  audit_always        boolean not null default true,
  is_system           boolean not null default true,

  constraint ai_tools_name_bilingual check (name ? 'sr' and name ? 'en')
);

alter table public.ai_tools enable row level security;
alter table public.ai_tools force row level security;
grant select on public.ai_tools to authenticated;

create policy ai_tools_select on public.ai_tools
  for select to authenticated using (true);

-- Koji su alati uključeni za koju organizaciju.
create table public.organization_ai_tools (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_tool_key     text not null references public.ai_tools(key) on delete cascade,
  enabled         boolean not null default false,
  integration_id  uuid,
  config          jsonb not null default '{}'::jsonb,
  enabled_by      uuid references auth.users(id),
  enabled_at      timestamptz,

  primary key (organization_id, ai_tool_key),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete set null
);

alter table public.organization_ai_tools enable row level security;
alter table public.organization_ai_tools force row level security;
grant select, insert, update, delete on public.organization_ai_tools to authenticated;

create policy org_ai_tools_select on public.organization_ai_tools
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy org_ai_tools_insert on public.organization_ai_tools
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy org_ai_tools_update on public.organization_ai_tools
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy org_ai_tools_delete on public.organization_ai_tools
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Razgovori
-- ---------------------------------------------------------------------------

create table public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text,
  locale          text not null default 'sr',
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at     timestamptz,

  unique (organization_id, id),
  constraint ai_conversations_locale_known check (locale in ('sr', 'en'))
);

create index ai_conversations_by_user
  on public.ai_conversations (organization_id, user_id, last_message_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force row level security;
grant select, insert, update on public.ai_conversations to authenticated;

-- Razgovor je lični. Vidi ga autor; kolege ne, bez obzira na rolu.
create policy conversations_select on public.ai_conversations
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and user_id = (select auth.uid())
  );

create policy conversations_insert on public.ai_conversations
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and user_id = (select auth.uid())
    and app.has_permission(organization_id, 'ask_ai')
  );

create policy conversations_update on public.ai_conversations
  for update to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and user_id = (select auth.uid())
  )
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Poruke
-- ---------------------------------------------------------------------------

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  role            message_role not null,
  content         text,
  -- Izvori, svežina i klasifikacija tvrdnji.
  provenance      jsonb not null default '{}'::jsonb,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now(),

  unique (organization_id, id),
  -- Složeni strani ključ: poruka NE MOŽE da pokazuje na razgovor druge organizacije.
  foreign key (organization_id, conversation_id)
    references public.ai_conversations (organization_id, id) on delete cascade
);

create index ai_messages_by_conversation
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;
grant select, insert on public.ai_messages to authenticated;

create policy messages_select on public.ai_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = (select auth.uid())
        and c.organization_id in (select unnest(app.accessible_org_ids()))
    )
  );

create policy messages_insert on public.ai_messages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = (select auth.uid())
        and c.organization_id = ai_messages.organization_id
        and c.organization_id in (select unnest(app.accessible_org_ids()))
    )
  );

-- Poruke se ne menjaju i ne brišu — istorija razgovora je deo traga.
revoke update, delete on public.ai_messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Trag poziva alata
-- ---------------------------------------------------------------------------

create table public.ai_tool_calls (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  message_id         uuid not null,
  ai_tool_key        text not null references public.ai_tools(key),
  integration_id     uuid,
  input              jsonb not null,
  -- Sažetak, ne pun skup podataka.
  output_summary     jsonb,
  row_count          integer,
  status             text not null,
  denied_reason      text,
  permission_checked text not null,
  -- Vreme na koje se podatak odnosi — osnova za prikaz svežine.
  data_as_of         timestamptz,
  latency_ms         integer,
  created_at         timestamptz not null default now(),

  constraint ai_tool_calls_status_known
    check (status in ('ok', 'denied', 'error', 'timeout')),
  foreign key (organization_id, message_id)
    references public.ai_messages (organization_id, id) on delete cascade
);

create index ai_tool_calls_by_org on public.ai_tool_calls (organization_id, created_at desc);

alter table public.ai_tool_calls enable row level security;
alter table public.ai_tool_calls force row level security;
grant select, insert on public.ai_tool_calls to authenticated;

create policy tool_calls_select on public.ai_tool_calls
  for select to authenticated
  using (
    exists (
      select 1
      from public.ai_messages m
      join public.ai_conversations c
        on c.organization_id = m.organization_id and c.id = m.conversation_id
      where m.id = ai_tool_calls.message_id
        and c.user_id = (select auth.uid())
        and c.organization_id in (select unnest(app.accessible_org_ids()))
    )
    -- Konsultant u aktivnoj sesiji vidi tragove poziva radi dijagnostike.
    or (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.is_staff()
    )
  );

create policy tool_calls_insert on public.ai_tool_calls
  for insert to authenticated
  with check (organization_id in (select unnest(app.accessible_org_ids())));

revoke update, delete on public.ai_tool_calls from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Dnevna potrošnja
-- ---------------------------------------------------------------------------

create table public.ai_usage_daily (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day             date not null,
  provider        text not null,
  model           text not null,
  call_count      integer not null default 0,
  input_tokens    bigint not null default 0,
  output_tokens   bigint not null default 0,
  cost_micros     bigint not null default 0,

  primary key (organization_id, day, provider, model)
);

alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_daily force row level security;
grant select on public.ai_usage_daily to authenticated;

create policy ai_usage_select on public.ai_usage_daily
  for select to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    or (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'view_audit_log')
    )
  );
