-- description: Agregatne funkcije za Delta Pro konzolu.
--
-- Lista klijenata traži brojeve iz šest tabela. Napravljeno u aplikaciji, to
-- je jedan upit po klijentu po metrici — klasičan N+1 koji na dvadeset
-- klijenata daje preko sto upita po otvaranju stranice.
--
-- Opseg i dalje određuje app.administrable_org_ids(), pa konsultant vidi samo
-- dodeljene klijente kao i svuda drugde.

create or replace function public.console_clients()
returns table (
  organization_id        uuid,
  slug                   text,
  display_name           text,
  industry               text,
  status                 text,
  plan                   text,
  is_demo                boolean,
  active_users           integer,
  pending_invites        integer,
  active_integrations    integer,
  integrations_attention integer,
  onboarding_done        integer,
  onboarding_total       integer,
  consultants            text[],
  has_open_access_session boolean,
  last_activity_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.slug,
    o.display_name,
    o.industry,
    o.status::text,
    o.plan,
    o.is_demo,

    (select count(*)::integer from public.organization_memberships m
      where m.organization_id = o.id and m.status = 'active'),

    (select count(*)::integer from public.organization_memberships m
      where m.organization_id = o.id and m.status = 'invited'),

    (select count(*)::integer from public.integrations i
      where i.organization_id = o.id and i.status = 'connected'),

    (select count(*)::integer from public.integrations i
      where i.organization_id = o.id
        and i.status in ('needs_attention', 'disconnected')),

    (select count(*)::integer from public.onboarding_tasks t
      where t.organization_id = o.id and t.status in ('done', 'skipped')),

    (select count(*)::integer from public.onboarding_tasks t
      where t.organization_id = o.id),

    coalesce(
      (select array_agg(coalesce(pr.full_name, 'Bez imena') order by pr.full_name)
       from public.client_assignments ca
       left join public.user_profiles pr on pr.id = ca.staff_user_id
       where ca.organization_id = o.id and ca.revoked_at is null),
      '{}'::text[]
    ),

    exists (
      select 1 from public.impersonation_sessions ses
      where ses.organization_id = o.id
        and ses.ended_at is null and ses.expires_at > now()
    ),

    (select max(a.occurred_at) from public.audit_logs a where a.organization_id = o.id)

  from public.organizations o
  where o.is_platform_org = false
    and o.id = any (app.administrable_org_ids())
  order by o.display_name;
$$;

grant execute on function public.console_clients() to authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding lista jedne organizacije
-- ---------------------------------------------------------------------------

create or replace function public.console_onboarding(p_organization_id uuid)
returns table (
  key          text,
  step_order   integer,
  status       text,
  completed_at timestamptz,
  completed_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.key, t.step_order, t.status, t.completed_at, pr.full_name
  from public.onboarding_tasks t
  left join public.user_profiles pr on pr.id = t.completed_by
  where t.organization_id = p_organization_id
    and t.organization_id = any (app.administrable_org_ids())
  order by t.step_order;
$$;

grant execute on function public.console_onboarding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Korisnici jedne organizacije
-- ---------------------------------------------------------------------------

create or replace function public.console_org_members(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id       uuid,
  full_name     text,
  email         text,
  role_key      text,
  role_name     jsonb,
  status        text,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  last_seen_at  timestamptz,
  override_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id, m.user_id, pr.full_name, u.email, r.key, r.name, m.status::text,
    m.invited_at, m.accepted_at, pr.last_seen_at,
    (select count(*)::integer from public.membership_permission_overrides o
      where o.membership_id = m.id)
  from public.organization_memberships m
  join public.roles r on r.id = m.role_id
  left join public.user_profiles pr on pr.id = m.user_id
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and m.organization_id = any (app.administrable_org_ids())
  order by (m.status = 'active') desc, pr.full_name nulls last;
$$;

grant execute on function public.console_org_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sesije pristupa koje pozivalac drži otvorene
-- ---------------------------------------------------------------------------
--
-- Za traku u konzoli: konsultant mora u svakom trenutku da vidi u čije je
-- podatke ušao i koliko mu je vremena ostalo. Bez toga se lako zaboravi da
-- je sesija otvorena, što je upravo ono što ovaj model treba da spreči.

create or replace function public.my_open_access_sessions()
returns table (
  session_id        uuid,
  organization_id   uuid,
  organization_slug text,
  organization_name text,
  reason            text,
  scope             text,
  expires_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ses.id, o.id, o.slug, o.display_name, ses.reason, ses.scope::text, ses.expires_at
  from public.impersonation_sessions ses
  join public.organizations o on o.id = ses.organization_id
  where ses.staff_user_id = (select auth.uid())
    and ses.ended_at is null
    and ses.expires_at > now()
  order by ses.expires_at;
$$;

grant execute on function public.my_open_access_sessions() to authenticated;
