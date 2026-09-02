-- description: Revizioni trag (append-only, particionisan) i sistemski događaji.
--
-- Revizija se ne menja i ne briše — ni iz aplikacije, ni servisnom rolom.
-- Jedini način da zapis nestane jeste odbacivanje cele stare particije, kao
-- deo dokumentovane politike zadržavanja.

create table public.audit_logs (
  id                       bigint generated always as identity,
  organization_id          uuid,
  actor_user_id            uuid,
  actor_type               audit_actor_type not null,
  impersonation_session_id uuid references public.impersonation_sessions(id),
  action                   text not null,
  resource_type            text,
  resource_id              text,
  integration_id           uuid,
  status                   audit_status not null,
  reason                   text,
  request_id               text not null,
  ip                       inet,
  user_agent               text,
  -- Redaktovan sadržaj. Nikad tajne, nikad pun payload.
  metadata                 jsonb not null default '{}'::jsonb,
  occurred_at              timestamptz not null default now(),

  primary key (id, occurred_at)
) partition by range (occurred_at);

create index audit_logs_by_org on public.audit_logs (organization_id, occurred_at desc);
create index audit_logs_by_actor on public.audit_logs (actor_user_id, occurred_at desc);
create index audit_logs_by_request on public.audit_logs (request_id);

-- Mesečne particije se prave unapred; DEFAULT particija je sigurnosna mreža
-- da zapis nikad ne bude odbijen zato što particija nedostaje.
create table public.audit_logs_default partition of public.audit_logs default;

create or replace function app.ensure_audit_partitions(p_months_ahead integer default 3)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end   date;
  v_name  text;
  i       integer;
begin
  for i in 0..p_months_ahead loop
    v_start := date_trunc('month', (now() + make_interval(months => i)))::date;
    v_end   := (v_start + interval '1 month')::date;
    v_name  := format('audit_logs_%s', to_char(v_start, 'YYYY_MM'));

    if not exists (select 1 from pg_class where relname = v_name) then
      execute format(
        'create table public.%I partition of public.audit_logs for values from (%L) to (%L)',
        v_name, v_start, v_end
      );
    end if;

    -- Particija mora da nosi SOPSTVENI RLS.
    --
    -- Politika roditelja važi samo kada se pristupa preko roditelja; direktan
    -- upit nad particijom vidi isključivo njene politike. Privilegije to već
    -- pokrivaju (particije nemaju grantove), ali oslanjati izolaciju na jedan
    -- sloj je upravo ono što ovaj projekat izbegava.
    execute format('alter table public.%I enable row level security', v_name);
    execute format('alter table public.%I force row level security', v_name);

    -- `force` ukida izuzeće vlasnika, pa i upis kroz app.write_audit
    -- (SECURITY DEFINER) mora da ima politiku. Bez nje upis prolazi samo ako
    -- rola ima BYPASSRLS — oslonac na atribut role, ne na zapisano pravilo.
    -- Politika ne otvara ništa aplikaciji: particije nemaju grantove.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_name and policyname = 'audit_insert'
    ) then
      execute format(
        'create policy audit_insert on public.%I for insert with check (true)',
        v_name
      );
    end if;
    execute format('revoke all on public.%I from anon, authenticated', v_name);
  end loop;
end;
$$;

-- DEFAULT particija se zaključava istim pravilom.
alter table public.audit_logs_default enable row level security;
alter table public.audit_logs_default force row level security;
revoke all on public.audit_logs_default from anon, authenticated;

select app.ensure_audit_partitions(6);

-- ---------------------------------------------------------------------------
-- Prava: čitanje uz permisiju, upis samo kroz funkciju, izmena nikad.
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

grant select on public.audit_logs to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated, anon;
-- I servisna rola sme samo da dopisuje. Izmena revizije nije predviđena operacija.
revoke update, delete on public.audit_logs from service_role;

create policy audit_select on public.audit_logs
  for select to authenticated
  using (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'view_audit_log')
    )
    or (
      organization_id in (select unnest(app.administrable_org_ids()))
      and app.is_staff()
    )
    -- Platformski događaji (bez organizacije) vide se samo Super Adminu.
    or (organization_id is null and app.is_super_admin())
  );

-- Jedini put za upis revizije.
create or replace function app.write_audit(
  p_action        text,
  p_actor_type    audit_actor_type,
  p_status        audit_status,
  p_request_id    text,
  p_organization_id uuid default null,
  p_resource_type text default null,
  p_resource_id   text default null,
  p_integration_id uuid default null,
  p_reason        text default null,
  p_metadata      jsonb default '{}'::jsonb,
  p_ip            inet default null,
  p_user_agent    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    organization_id, actor_user_id, actor_type, impersonation_session_id,
    action, resource_type, resource_id, integration_id,
    status, reason, request_id, ip, user_agent, metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    p_actor_type,
    case when p_organization_id is null then null
         else app.active_impersonation(p_organization_id) end,
    p_action, p_resource_type, p_resource_id, p_integration_id,
    p_status, p_reason, p_request_id, p_ip, p_user_agent, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

comment on function app.write_audit is
  'Jedini put upisa u reviziju. Sam popunjava aktera i aktivnu sesiju pristupa, pa se ne mogu podmetnuti.';

grant execute on function app.write_audit(
  text, audit_actor_type, audit_status, text, uuid, text, text, uuid, text, jsonb, inet, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sistemski događaji (tehnički log, ne poslovna revizija)
-- ---------------------------------------------------------------------------

create table public.system_events (
  id              bigint generated always as identity primary key,
  severity        text not null,
  component       text not null,
  code            text not null,
  message         text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),

  constraint system_events_severity_known
    check (severity in ('info', 'warning', 'error', 'critical'))
);

create index system_events_recent on public.system_events (occurred_at desc);

alter table public.system_events enable row level security;
alter table public.system_events force row level security;
grant select on public.system_events to authenticated;

-- Tehnički detalji su za Delta Pro. Klijentski korisnik ih ne vidi nikada —
-- ni stack trace, ni interne kodove.
create policy system_events_select on public.system_events
  for select to authenticated
  using (
    app.is_super_admin()
    or (
      organization_id is not null
      and organization_id in (select unnest(app.administrable_org_ids()))
      and app.is_staff()
    )
  );
