-- description: Odobrenja, odluke, izvršenja i upozorenja.
--
-- Granica PREPARE -> EXECUTE je mesto gde stoji čovek. Odobrenje se kreira
-- kao predlog; izvršenje pokreće deterministički backend tek nakon odluke.

create table public.approvals (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  action_type             text not null,
  title                   text not null,
  summary                 jsonb not null default '{}'::jsonb,
  payload                 jsonb not null,
  target_system           text,
  target_integration_id   uuid,
  risk_level              risk_level not null default 'medium',
  requires_two_person     boolean not null default false,
  status                  approval_status not null default 'pending',
  requested_by_user_id    uuid references auth.users(id),
  requested_by_message_id uuid,
  ai_reason               text,
  -- Na osnovu kojih podataka je predlog nastao.
  source_refs             jsonb not null default '[]'::jsonb,
  -- Sprečava dvostruko izvršenje iste akcije.
  idempotency_key         text not null,
  expires_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (organization_id, idempotency_key),
  unique (organization_id, id),
  foreign key (organization_id, target_integration_id)
    references public.integrations (organization_id, id) on delete set null
);

create index approvals_pending
  on public.approvals (organization_id, created_at desc) where status = 'pending';

create trigger approvals_touch before update on public.approvals
  for each row execute function app.touch_updated_at();

alter table public.approvals enable row level security;
alter table public.approvals force row level security;
grant select, insert, update on public.approvals to authenticated;

create policy approvals_select on public.approvals
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and (
      app.has_permission(organization_id, 'approve_actions')
      or requested_by_user_id = (select auth.uid())
    )
  );

create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and status = 'pending'
  );

create policy approvals_update on public.approvals
  for update to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'approve_actions')
  )
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'approve_actions')
  );

-- ---------------------------------------------------------------------------
-- Odluke
-- ---------------------------------------------------------------------------

create table public.approval_decisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_id     uuid not null,
  decision        decision_kind not null,
  decided_by      uuid not null references auth.users(id),
  decided_at      timestamptz not null default now(),
  comment         text,
  edited_payload  jsonb,

  -- Ista osoba ne može dvaput da odobri isti zahtev — osnova za dvostruko odobrenje.
  unique (approval_id, decided_by, decision),
  foreign key (organization_id, approval_id)
    references public.approvals (organization_id, id) on delete cascade
);

alter table public.approval_decisions enable row level security;
alter table public.approval_decisions force row level security;
grant select, insert on public.approval_decisions to authenticated;

create policy decisions_select on public.approval_decisions
  for select to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())));

create policy decisions_insert on public.approval_decisions
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and decided_by = (select auth.uid())
    and app.has_permission(organization_id, 'approve_actions')
  );

revoke update, delete on public.approval_decisions from authenticated, anon;

comment on table public.approval_decisions is
  'Odluke se ne menjaju i ne brišu. Ko je šta odobrio mora da ostane zapisano.';

-- ---------------------------------------------------------------------------
-- Izvršenja
-- ---------------------------------------------------------------------------

create table public.action_executions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_id     uuid not null,
  attempt         integer not null default 1,
  status          text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  result          jsonb,
  error_code      text,
  error_message   text,

  unique (approval_id, attempt),
  constraint action_executions_status_known
    check (status in ('running', 'succeeded', 'failed')),
  foreign key (organization_id, approval_id)
    references public.approvals (organization_id, id) on delete cascade
);

alter table public.action_executions enable row level security;
alter table public.action_executions force row level security;
grant select on public.action_executions to authenticated;

-- Izvršenje upisuje servisni sloj nakon provere odobrenja, ne korisnik direktno.
create policy executions_select on public.action_executions
  for select to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())));

-- ---------------------------------------------------------------------------
-- Pravila upozorenja
-- ---------------------------------------------------------------------------

create table public.alert_rules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  key              text not null,
  name             jsonb not null,
  severity         alert_severity not null default 'warning',
  -- Deklarativan uslov: {metric, operator, threshold, window}
  condition        jsonb not null,
  data_source_id   uuid,
  enabled          boolean not null default true,
  cooldown_seconds integer not null default 3600,
  notify_role_ids  uuid[] not null default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),

  unique (organization_id, key),
  unique (organization_id, id),
  constraint alert_rules_name_bilingual check (name ? 'sr' and name ? 'en'),
  foreign key (organization_id, data_source_id)
    references public.data_sources (organization_id, id) on delete set null
);

alter table public.alert_rules enable row level security;
alter table public.alert_rules force row level security;
grant select, insert, update, delete on public.alert_rules to authenticated;

create policy alert_rules_select on public.alert_rules
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy alert_rules_insert on public.alert_rules
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

create policy alert_rules_update on public.alert_rules
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

create policy alert_rules_delete on public.alert_rules
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

-- ---------------------------------------------------------------------------
-- Upozorenja
-- ---------------------------------------------------------------------------

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_rule_id   uuid,
  severity        alert_severity not null,
  title           text not null,
  body            jsonb not null default '{}'::jsonb,
  source          text not null,
  status          alert_status not null default 'new',
  assigned_to     uuid references auth.users(id),
  dedupe_key      text,
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id),

  unique (organization_id, id),
  constraint alerts_source_known
    check (source in ('integration', 'rule', 'system', 'ai')),
  foreign key (organization_id, alert_rule_id)
    references public.alert_rules (organization_id, id) on delete set null
);

-- Isto upozorenje se ne otvara dvaput dok je otvoreno.
create unique index alerts_open_dedupe
  on public.alerts (organization_id, dedupe_key)
  where dedupe_key is not null and status in ('new', 'acknowledged');

create index alerts_open on public.alerts (organization_id, severity, created_at desc)
  where status in ('new', 'acknowledged');

alter table public.alerts enable row level security;
alter table public.alerts force row level security;
grant select, insert, update on public.alerts to authenticated;

create policy alerts_select on public.alerts
  for select to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())));

create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

-- Potvrđivanje i rešavanje sme svako ko vidi upozorenje — to je svakodnevni rad,
-- ne administracija.
create policy alerts_update on public.alerts
  for update to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())))
  with check (organization_id in (select unnest(app.accessible_org_ids())));
