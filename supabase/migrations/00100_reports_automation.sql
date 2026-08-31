-- description: Izveštaji, automatizacije, obaveštenja i onboarding lista.

create table public.report_definitions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  key                 text not null,
  name                jsonb not null,
  description         jsonb not null default '{}'::jsonb,
  spec                jsonb not null,
  schedule_cron       text,
  timezone            text not null default 'Europe/Belgrade',
  recipients          jsonb not null default '[]'::jsonb,
  required_permission text not null references public.permissions(key),
  enabled             boolean not null default true,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),

  unique (organization_id, key),
  unique (organization_id, id),
  constraint report_definitions_name_bilingual check (name ? 'sr' and name ? 'en')
);

alter table public.report_definitions enable row level security;
alter table public.report_definitions force row level security;
grant select, insert, update, delete on public.report_definitions to authenticated;

create policy report_defs_select on public.report_definitions
  for select to authenticated
  using (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, required_permission)
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy report_defs_insert on public.report_definitions
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_reports')
  );

create policy report_defs_update on public.report_definitions
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_reports')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_reports')
  );

create policy report_defs_delete on public.report_definitions
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_reports')
  );

create table public.report_runs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  report_definition_id uuid not null,
  status               text not null default 'running',
  period_start         timestamptz,
  period_end           timestamptz,
  filters              jsonb not null default '{}'::jsonb,
  triggered_by         text not null,
  triggered_by_user_id uuid references auth.users(id),
  -- Iz kojih izvora je izveštaj sastavljen, sa vremenima svežine.
  data_sources         jsonb not null default '[]'::jsonb,
  summary              text,
  artifact_path        text,
  generated_at         timestamptz,
  error_message        text,
  created_at           timestamptz not null default now(),

  unique (organization_id, id),
  constraint report_runs_status_known check (status in ('running', 'succeeded', 'failed')),
  constraint report_runs_trigger_known check (triggered_by in ('user', 'schedule', 'ai')),
  foreign key (organization_id, report_definition_id)
    references public.report_definitions (organization_id, id) on delete cascade
);

create index report_runs_recent on public.report_runs (organization_id, created_at desc);

alter table public.report_runs enable row level security;
alter table public.report_runs force row level security;
grant select, insert on public.report_runs to authenticated;

create policy report_runs_select on public.report_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.report_definitions d
      where d.organization_id = report_runs.organization_id
        and d.id = report_runs.report_definition_id
        and (
          (
            d.organization_id in (select unnest(app.accessible_org_ids()))
            and app.has_permission(d.organization_id, d.required_permission)
          )
          or d.organization_id in (select unnest(app.administrable_org_ids()))
        )
    )
  );

create policy report_runs_insert on public.report_runs
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'run_reports')
  );

-- ---------------------------------------------------------------------------
-- Automatizacije (n8n iza naše API-ja)
-- ---------------------------------------------------------------------------

create table public.automation_workflows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null default 'n8n',
  -- Identifikator kod provajdera. Klijentu se nikad ne prikazuje.
  external_ref    text not null,
  name            jsonb not null,
  trigger_type    text not null,
  enabled         boolean not null default true,
  last_run_at     timestamptz,
  last_status     text,
  created_at      timestamptz not null default now(),

  unique (organization_id, id),
  constraint automation_name_bilingual check (name ? 'sr' and name ? 'en'),
  constraint automation_trigger_known check (trigger_type in ('schedule', 'event', 'manual'))
);

alter table public.automation_workflows enable row level security;
alter table public.automation_workflows force row level security;
grant select, insert, update, delete on public.automation_workflows to authenticated;

-- Automatizacije su konfiguracija Delta Pro strane; klijent vidi samo ishode.
create policy automations_select on public.automation_workflows
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

create policy automations_insert on public.automation_workflows
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.is_staff()
  );

create policy automations_update on public.automation_workflows
  for update to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff())
  with check (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());

create policy automations_delete on public.automation_workflows
  for delete to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());

create table public.automation_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id     uuid not null,
  status          text not null,
  trigger         text not null,
  correlation_id  text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error_message   text,
  steps           jsonb not null default '[]'::jsonb,

  constraint automation_runs_status_known check (status in ('running', 'succeeded', 'failed')),
  foreign key (organization_id, workflow_id)
    references public.automation_workflows (organization_id, id) on delete cascade
);

create index automation_runs_recent on public.automation_runs (workflow_id, started_at desc);

alter table public.automation_runs enable row level security;
alter table public.automation_runs force row level security;
grant select on public.automation_runs to authenticated;

create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

-- ---------------------------------------------------------------------------
-- Obaveštenja
-- ---------------------------------------------------------------------------

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null,
  title           text not null,
  body            text,
  link            text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  unique (organization_id, id)
);

create index notifications_unread
  on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
grant select, update on public.notifications to authenticated;

-- Obaveštenje vidi isključivo njegov primalac.
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Onboarding lista
-- ---------------------------------------------------------------------------

create table public.onboarding_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,
  position        integer not null,
  status          text not null default 'pending',
  completed_at    timestamptz,
  completed_by    uuid references auth.users(id),
  note            text,

  unique (organization_id, key),
  constraint onboarding_status_known
    check (status in ('pending', 'in_progress', 'done', 'skipped'))
);

alter table public.onboarding_tasks enable row level security;
alter table public.onboarding_tasks force row level security;
grant select, insert, update on public.onboarding_tasks to authenticated;

create policy onboarding_select on public.onboarding_tasks
  for select to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())));

create policy onboarding_insert on public.onboarding_tasks
  for insert to authenticated
  with check (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());

create policy onboarding_update on public.onboarding_tasks
  for update to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff())
  with check (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());
