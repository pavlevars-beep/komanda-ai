-- description: Pomoćne funkcije za autorizaciju, koje koriste SVE RLS politike.
--
-- Sve su SECURITY DEFINER sa praznim search_path-om i punom kvalifikacijom
-- imena — bez toga je moguća otmica preko search_path-a.
--
-- SECURITY DEFINER je ovde neophodan i iz drugog razloga: politika na tabeli
-- članstava mora da čita tabelu članstava. Bez definera to je beskonačna
-- rekurzija.

-- ---------------------------------------------------------------------------
-- Efektivne permisije jednog članstva: rola UNION grant MINUS deny
-- ---------------------------------------------------------------------------

create or replace function app.membership_has_permission(p_membership_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- deny uvek pobeđuje, bez obzira na rolu
    not exists (
      select 1 from public.membership_permission_overrides o
      where o.membership_id = p_membership_id
        and o.permission_key = p_permission
        and o.effect = 'deny'
    )
    and (
      exists (
        select 1
        from public.organization_memberships m
        join public.role_permissions rp on rp.role_id = m.role_id
        where m.id = p_membership_id and rp.permission_key = p_permission
      )
      or exists (
        select 1 from public.membership_permission_overrides o
        where o.membership_id = p_membership_id
          and o.permission_key = p_permission
          and o.effect = 'grant'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Aktivna sesija pristupa osoblja
-- ---------------------------------------------------------------------------

create or replace function app.active_impersonation(p_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
  from public.impersonation_sessions i
  join public.platform_staff s on s.user_id = i.staff_user_id and s.is_active
  where i.staff_user_id = (select auth.uid())
    and i.organization_id = p_organization_id
    and i.ended_at is null
    and i.expires_at > now()
  order by i.started_at desc
  limit 1;
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = (select auth.uid()) and s.is_active and s.staff_role = 'super_admin'
  );
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = (select auth.uid()) and s.is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- Organizacije čije POSLOVNE PODATKE korisnik sme da čita
-- ---------------------------------------------------------------------------

create or replace function app.accessible_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct oid), '{}'::uuid[])
  from (
    -- (a) aktivno članstvo u organizaciji
    select m.organization_id as oid
    from public.organization_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'

    union

    -- (b) Delta Pro osoblje, ali SAMO uz aktivnu sesiju pristupa
    select i.organization_id
    from public.impersonation_sessions i
    join public.platform_staff s on s.user_id = i.staff_user_id and s.is_active
    where i.staff_user_id = (select auth.uid())
      and i.ended_at is null
      and i.expires_at > now()
  ) t;
$$;

comment on function app.accessible_org_ids() is
  'Pristup poslovnim podacima. Za osoblje važi samo dok traje aktivna sesija — ni Super Admin nema trajan pristup.';

-- ---------------------------------------------------------------------------
-- Organizacije čiju KONFIGURACIJU korisnik sme da vidi i menja
-- ---------------------------------------------------------------------------

create or replace function app.administrable_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct oid), '{}'::uuid[])
  from (
    -- (a) Super Admin: sve organizacije
    select o.id as oid
    from public.organizations o
    where app.is_super_admin()

    union

    -- (b) Konsultant i podrška: samo eksplicitno dodeljene organizacije
    select ca.organization_id
    from public.client_assignments ca
    join public.platform_staff s on s.user_id = ca.staff_user_id and s.is_active
    where ca.staff_user_id = (select auth.uid()) and ca.revoked_at is null

    union

    -- (c) Administrator klijenta u sopstvenoj organizaciji
    select m.organization_id
    from public.organization_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
      and app.membership_has_permission(m.id, 'manage_integrations')
  ) t;
$$;

comment on function app.administrable_org_ids() is
  'Konfiguracija i metapodaci. Namerno NE daje pristup poslovnim podacima.';

-- ---------------------------------------------------------------------------
-- Provera permisije u konkretnoj organizaciji
-- ---------------------------------------------------------------------------

create or replace function app.has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- (a) član organizacije sa odgovarajućom permisijom
    exists (
      select 1
      from public.organization_memberships m
      where m.user_id = (select auth.uid())
        and m.status = 'active'
        and m.organization_id = p_organization_id
        and app.membership_has_permission(m.id, p_permission)
    )
    -- (b) osoblje u aktivnoj sesiji: pun opseg daje sve, read_only samo čitanje
    or exists (
      select 1
      from public.impersonation_sessions i
      join public.platform_staff s on s.user_id = i.staff_user_id and s.is_active
      where i.staff_user_id = (select auth.uid())
        and i.organization_id = p_organization_id
        and i.ended_at is null
        and i.expires_at > now()
        and (i.scope = 'full' or p_permission like 'view\_%' or p_permission = 'ask_ai')
    );
$$;

-- Funkcije smeju da se pozivaju iz politika i iz aplikacije.
grant execute on function
  app.membership_has_permission(uuid, text),
  app.active_impersonation(uuid),
  app.is_super_admin(),
  app.is_staff(),
  app.accessible_org_ids(),
  app.administrable_org_ids(),
  app.has_permission(uuid, text)
to authenticated, service_role;
