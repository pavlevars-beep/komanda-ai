-- description: Funkcije koje aplikacija poziva preko PostgREST-a.
--
-- Šema `app` nije izložena kroz PostgREST, pa se ovde pravi uzak, namenski
-- sloj u `public`. Svaka funkcija je SECURITY INVOKER i oslanja se na
-- auth.uid() — ne prima identitet kao argument, pa se ne može podmetnuti.
--
-- Cilj je i praktičan: kontekst organizacije se dobija u JEDNOM odlasku do
-- baze, umesto u četiri upita po zahtevu.

-- ---------------------------------------------------------------------------
-- Efektivne permisije korisnika u organizaciji
-- ---------------------------------------------------------------------------

create or replace function public.effective_permissions(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.key order by p.key), '{}'::text[])
  from public.permissions p
  where app.has_permission(p_organization_id, p.key);
$$;

comment on function public.effective_permissions(uuid) is
  'Jedina definicija efektivnih permisija. Isti proračun koriste i RLS politike i aplikacija — nema dva mesta koja mogu da se raziđu.';

grant execute on function public.effective_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Organizacije kojima korisnik pripada (prekidač organizacija, preusmeravanje)
-- ---------------------------------------------------------------------------

create or replace function public.my_memberships()
returns table (
  organization_id   uuid,
  organization_slug text,
  organization_name text,
  role_key          text,
  is_demo           boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.slug, o.display_name, r.key, o.is_demo
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  join public.roles r on r.id = m.role_id
  where m.user_id = (select auth.uid()) and m.status = 'active'
  order by o.display_name;
$$;

grant execute on function public.my_memberships() to authenticated;

-- ---------------------------------------------------------------------------
-- Pun kontekst radnog prostora
-- ---------------------------------------------------------------------------
--
-- Vraća nula redova ako korisnik nema pristup. Aplikacija to mapira u 404,
-- nikad u 403 — poruka "nemate pristup ovoj organizaciji" potvrđuje da
-- organizacija postoji, što je curenje informacije preko granice tenanta.

create or replace function public.workspace_context(p_slug text)
returns table (
  organization_id            uuid,
  organization_slug          text,
  organization_name          text,
  default_locale             text,
  default_currency           text,
  timezone                   text,
  is_demo                    boolean,
  permissions                text[],
  staff_role                 text,
  impersonation_session_id   uuid,
  impersonation_expires_at   timestamptz,
  impersonation_staff_name   text,
  impersonation_reason       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.slug, o.display_name, o.default_locale, o.default_currency, o.timezone, o.is_demo,
    public.effective_permissions(o.id),
    (select s.staff_role::text from public.platform_staff s
      where s.user_id = (select auth.uid()) and s.is_active),
    i.id, i.expires_at,
    (select pr.full_name from public.user_profiles pr where pr.id = i.staff_user_id),
    i.reason
  from public.organizations o
  left join lateral (
    select ses.id, ses.expires_at, ses.staff_user_id, ses.reason
    from public.impersonation_sessions ses
    where ses.organization_id = o.id
      and ses.staff_user_id = (select auth.uid())
      and ses.ended_at is null
      and ses.expires_at > now()
    order by ses.started_at desc
    limit 1
  ) i on true
  where lower(o.slug) = lower(p_slug)
    -- Pristup poslovnim podacima: članstvo ili aktivna sesija. Ništa drugo.
    and o.id = any (app.accessible_org_ids());
$$;

grant execute on function public.workspace_context(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Aktivne sesije pristupa nad organizacijom (traka koju klijent vidi)
-- ---------------------------------------------------------------------------

create or replace function public.active_access_sessions(p_organization_id uuid)
returns table (
  session_id  uuid,
  staff_name  text,
  reason      text,
  scope       text,
  expires_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ses.id, pr.full_name, ses.reason, ses.scope::text, ses.expires_at
  from public.impersonation_sessions ses
  left join public.user_profiles pr on pr.id = ses.staff_user_id
  where ses.organization_id = p_organization_id
    and ses.ended_at is null
    and ses.expires_at > now()
    -- Vidi je onaj ko pripada organizaciji, i samo tada.
    and ses.organization_id = any (app.accessible_org_ids())
  order by ses.started_at desc;
$$;

grant execute on function public.active_access_sessions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Upis revizije iz aplikacije
-- ---------------------------------------------------------------------------
--
-- Tanak omotač oko app.write_audit, jer šema `app` nije izložena kroz
-- PostgREST. Akter i aktivna sesija pristupa se i dalje popunjavaju u bazi,
-- pa se ne mogu podmetnuti kroz argumente poziva.

create or replace function public.write_audit(
  p_action          text,
  p_actor_type      text,
  p_status          text,
  p_request_id      text,
  p_organization_id uuid    default null,
  p_resource_type   text    default null,
  p_resource_id     text    default null,
  p_integration_id  uuid    default null,
  p_reason          text    default null,
  p_metadata        jsonb   default '{}'::jsonb,
  p_ip              inet    default null,
  p_user_agent      text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Zapis se prihvata samo za organizaciju kojoj pozivalac stvarno ima pristup.
  -- Bez ove provere bi se u tuđi revizioni trag mogli ubacivati lažni zapisi.
  if p_organization_id is not null
     and not (p_organization_id = any (app.accessible_org_ids()))
     and not (p_organization_id = any (app.administrable_org_ids())) then
    raise exception 'Revizioni zapis van dosega pozivaoca.' using errcode = '42501';
  end if;

  perform app.write_audit(
    p_action, p_actor_type::public.audit_actor_type, p_status::public.audit_status,
    p_request_id, p_organization_id, p_resource_type, p_resource_id,
    p_integration_id, p_reason, p_metadata, p_ip, p_user_agent
  );
end;
$$;

grant execute on function public.write_audit(
  text, text, text, text, uuid, text, text, uuid, text, jsonb, inet, text
) to authenticated;
