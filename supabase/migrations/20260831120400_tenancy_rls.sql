-- description: RLS politike za tenancy, RBAC i osoblje.
--
-- Obavezan oblik: app.accessible_org_ids() se poziva kao skalarni podupit
--   organization_id in (select unnest(app.accessible_org_ids()))
-- Dvostruke zagrade nisu greška u kucanju — one prave InitPlan, pa se funkcija
-- izvršava JEDNOM po naredbi umesto jednom po redu. Bez toga upit nad
-- stotinama hiljada redova postaje neupotrebljiv.
--
-- Kod UPDATE politika WITH CHECK je obavezan i uvek naveden odvojeno.
-- Bez njega korisnik može da izmeni organization_id postojećeg reda i time
-- premesti zapis u tuđu organizaciju — najčešći propust u RLS modelima.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
grant select, insert, update on public.organizations to authenticated;

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    id in (select unnest(app.accessible_org_ids()))
    or id in (select unnest(app.administrable_org_ids()))
  );

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (app.is_super_admin());

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.is_staff() and id in (select unnest(app.administrable_org_ids())))
  with check (app.is_staff() and id in (select unnest(app.administrable_org_ids())));

-- Organizacije se arhiviraju, ne brišu. Politike za DELETE namerno nema.

-- ---------------------------------------------------------------------------
-- organization_branding
-- ---------------------------------------------------------------------------

alter table public.organization_branding enable row level security;
alter table public.organization_branding force row level security;
grant select, insert, update on public.organization_branding to authenticated;

create policy branding_select on public.organization_branding
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy branding_insert on public.organization_branding
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_branding'))
  );

create policy branding_update on public.organization_branding
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_branding'))
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_branding'))
  );

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
grant select, update on public.user_profiles to authenticated;

-- Vidi se sopstveni profil i profili kolega iz organizacija kojima imate pristup.
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = public.user_profiles.id
        and m.organization_id in (select unnest(app.accessible_org_ids()))
    )
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = public.user_profiles.id
        and m.organization_id in (select unnest(app.administrable_org_ids()))
    )
  );

-- Profil menja isključivo njegov vlasnik.
create policy user_profiles_update on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- permissions i roles (katalozi)
-- ---------------------------------------------------------------------------

alter table public.permissions enable row level security;
alter table public.permissions force row level security;
grant select on public.permissions to authenticated;

create policy permissions_select on public.permissions
  for select to authenticated using (true);
-- Permisije se menjaju isključivo migracijama.

alter table public.roles enable row level security;
alter table public.roles force row level security;
grant select, insert, update, delete on public.roles to authenticated;

create policy roles_select on public.roles
  for select to authenticated
  using (
    is_system
    or organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy roles_insert on public.roles
  for insert to authenticated
  with check (
    not is_system
    and organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_users')
  );

create policy roles_update on public.roles
  for update to authenticated
  using (
    not is_system
    and organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_users')
  )
  with check (
    not is_system
    and organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_users')
  );

create policy roles_delete on public.roles
  for delete to authenticated
  using (
    not is_system
    and organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_users')
  );

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
grant select, insert, delete on public.role_permissions to authenticated;

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (
          r.is_system
          or r.organization_id in (select unnest(app.accessible_org_ids()))
          or r.organization_id in (select unnest(app.administrable_org_ids()))
        )
    )
  );

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and not r.is_system
        and r.organization_id in (select unnest(app.administrable_org_ids()))
        and app.has_permission(r.organization_id, 'manage_users')
    )
  );

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and not r.is_system
        and r.organization_id in (select unnest(app.administrable_org_ids()))
        and app.has_permission(r.organization_id, 'manage_users')
    )
  );

-- ---------------------------------------------------------------------------
-- organization_memberships
-- ---------------------------------------------------------------------------

alter table public.organization_memberships enable row level security;
alter table public.organization_memberships force row level security;
grant select, insert, update on public.organization_memberships to authenticated;

-- Sopstvena članstva se uvek vide — bez toga korisnik ne bi mogao ni da sazna
-- kojoj organizaciji pripada.
create policy memberships_select on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy memberships_insert on public.organization_memberships
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_users'))
  );

create policy memberships_update on public.organization_memberships
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_users'))
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and (app.is_staff() or app.has_permission(organization_id, 'manage_users'))
  );

-- Članstva se opozivaju (status = 'revoked'), ne brišu — inače nestaje trag.

alter table public.membership_permission_overrides enable row level security;
alter table public.membership_permission_overrides force row level security;
grant select, insert, update, delete on public.membership_permission_overrides to authenticated;

create policy overrides_select on public.membership_permission_overrides
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.id = membership_permission_overrides.membership_id
        and (
          m.user_id = (select auth.uid())
          or m.organization_id in (select unnest(app.administrable_org_ids()))
        )
    )
  );

create policy overrides_write on public.membership_permission_overrides
  for insert to authenticated
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.id = membership_permission_overrides.membership_id
        and m.organization_id in (select unnest(app.administrable_org_ids()))
        and (app.is_staff() or app.has_permission(m.organization_id, 'manage_users'))
    )
  );

create policy overrides_update on public.membership_permission_overrides
  for update to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.id = membership_permission_overrides.membership_id
        and m.organization_id in (select unnest(app.administrable_org_ids()))
        and (app.is_staff() or app.has_permission(m.organization_id, 'manage_users'))
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.id = membership_permission_overrides.membership_id
        and m.organization_id in (select unnest(app.administrable_org_ids()))
        and (app.is_staff() or app.has_permission(m.organization_id, 'manage_users'))
    )
  );

create policy overrides_delete on public.membership_permission_overrides
  for delete to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.id = membership_permission_overrides.membership_id
        and m.organization_id in (select unnest(app.administrable_org_ids()))
        and (app.is_staff() or app.has_permission(m.organization_id, 'manage_users'))
    )
  );
