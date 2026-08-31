-- description: RLS politike za osoblje, dodele i sesije pristupa.

-- ---------------------------------------------------------------------------
-- platform_staff
-- ---------------------------------------------------------------------------

alter table public.platform_staff enable row level security;
alter table public.platform_staff force row level security;
grant select, insert, update on public.platform_staff to authenticated;

create policy staff_select on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid()) or app.is_staff());

create policy staff_insert on public.platform_staff
  for insert to authenticated
  with check (app.is_super_admin());

create policy staff_update on public.platform_staff
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- client_assignments
-- ---------------------------------------------------------------------------

alter table public.client_assignments enable row level security;
alter table public.client_assignments force row level security;
grant select, insert, update on public.client_assignments to authenticated;

-- Klijent sme da vidi ko je od Delta Pro osoblja zadužen za njegovu organizaciju.
create policy assignments_select on public.client_assignments
  for select to authenticated
  using (
    staff_user_id = (select auth.uid())
    or app.is_super_admin()
    or organization_id in (select unnest(app.accessible_org_ids()))
  );

create policy assignments_insert on public.client_assignments
  for insert to authenticated
  with check (app.is_super_admin());

create policy assignments_update on public.client_assignments
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- impersonation_sessions
-- ---------------------------------------------------------------------------

alter table public.impersonation_sessions enable row level security;
alter table public.impersonation_sessions force row level security;
grant select, insert, update on public.impersonation_sessions to authenticated;

-- Klijent MORA da vidi sesije nad svojom organizacijom. To je suština obećanja
-- o transparentnosti: pristup se ne dešava tiho.
create policy impersonation_select on public.impersonation_sessions
  for select to authenticated
  using (
    staff_user_id = (select auth.uid())
    or organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

-- Sesiju pokreće samo osoblje, samo nad organizacijom na koju je dodeljeno,
-- samo u svoje ime, i samo unutar dozvoljenog trajanja.
create policy impersonation_insert on public.impersonation_sessions
  for insert to authenticated
  with check (
    staff_user_id = (select auth.uid())
    and app.is_staff()
    and organization_id in (select unnest(app.administrable_org_ids()))
    and ended_at is null
    and expires_at > now()
    and expires_at <= now() + interval '8 hours'
  );

-- Sesija se ne menja — samo se zatvara. WITH CHECK to i sprovodi.
create policy impersonation_end on public.impersonation_sessions
  for update to authenticated
  using (
    staff_user_id = (select auth.uid())
    or (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_users')
    )
  )
  with check (ended_at is not null);

comment on policy impersonation_end on public.impersonation_sessions is
  'Administrator klijenta sme da prekine sesiju nad svojom organizacijom. WITH CHECK dozvoljava samo zatvaranje, ne izmenu razloga ili trajanja.';

-- Zaštita od produžavanja sesije izmenom: nepromenljiva polja se brane triggerom,
-- jer WITH CHECK ne vidi staru vrednost reda.
create or replace function app.guard_impersonation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.staff_user_id is distinct from old.staff_user_id
     or new.organization_id is distinct from old.organization_id
     or new.reason is distinct from old.reason
     or new.scope is distinct from old.scope
     or new.started_at is distinct from old.started_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'Sesija pristupa se ne menja, samo se zatvara.'
      using errcode = '42501';
  end if;

  if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
    raise exception 'Zatvorena sesija se ne otvara ponovo.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger impersonation_immutable
  before update on public.impersonation_sessions
  for each row execute function app.guard_impersonation_update();
