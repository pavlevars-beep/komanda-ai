-- description: Atomično kreiranje klijentske organizacije.
--
-- Kreiranje klijenta dotiče četiri tabele: organizations, organization_branding,
-- onboarding_tasks i client_assignments. Kroz četiri odvojena upita iz
-- aplikacije to znači četiri mesta na kojima može da pukne i da ostane
-- poluotvorena organizacija bez onboarding liste ili bez zaduženog konsultanta.
--
-- Ovde je sve u jednoj transakciji. Funkcija je SECURITY DEFINER, pa sama
-- proverava ko sme da je pozove — RLS na pojedinačnim tabelama ne bi mogao,
-- jer u trenutku ubacivanja dodele organizacija još nije „administrabilna".

create or replace function public.create_client_organization(
  p_slug          text,
  p_legal_name    text,
  p_display_name  text,
  p_industry      text default null,
  p_country       char(2) default 'RS',
  p_currency      char(3) default 'RSD',
  p_timezone      text default 'Europe/Belgrade',
  p_plan          text default 'standard',
  p_locale        text default 'sr'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_actor  uuid := (select auth.uid());
begin
  -- Kreiranje klijenta je radnja Delta Pro strane. Klijentski nalog, ma koje
  -- role, ovde nema šta da traži.
  if not app.is_staff() then
    raise exception 'Samo Delta Pro osoblje može da kreira klijentsku organizaciju.'
      using errcode = '42501';
  end if;

  insert into public.organizations
    (slug, legal_name, display_name, industry, country, default_currency,
     timezone, plan, default_locale, status, is_platform_org, is_demo)
  values
    (lower(btrim(p_slug)), btrim(p_legal_name), btrim(p_display_name),
     nullif(btrim(coalesce(p_industry, '')), ''), p_country, p_currency,
     p_timezone, p_plan, p_locale, 'onboarding', false, false)
  returning id into v_org_id;

  -- Prazan red za brendiranje da ekran za brendiranje ne mora da razlikuje
  -- „nije podešeno" od „ne postoji".
  insert into public.organization_branding (organization_id, workspace_name)
  values (v_org_id, btrim(p_display_name));

  -- Onboarding lista je deo definicije proizvoda, ne nešto što konsultant
  -- sastavlja ručno po klijentu.
  insert into public.onboarding_tasks (organization_id, key, step_order, status, completed_at, completed_by)
  select v_org_id, s.key, s.step_order,
         case when s.key = 'company_created' then 'done' else 'pending' end,
         case when s.key = 'company_created' then now() else null end,
         case when s.key = 'company_created' then v_actor else null end
  from (values
    ('company_created', 1), ('branding', 2), ('users_invited', 3),
    ('data_source_connected', 4), ('connection_tested', 5), ('permissions_configured', 6),
    ('ai_tools_enabled', 7), ('dashboard_configured', 8), ('first_report_generated', 9),
    ('production_enabled', 10)
  ) as s(key, step_order);

  -- Onaj ko je kreirao klijenta odmah je i zadužen za njega. Bez toga bi
  -- konsultant kreirao organizaciju koju u sledećem trenutku ne može da vidi.
  insert into public.client_assignments (staff_user_id, organization_id, assigned_by)
  values (v_actor, v_org_id, v_actor)
  on conflict (staff_user_id, organization_id) do nothing;

  perform app.write_audit(
    'organization.created', 'staff', 'success',
    coalesce(current_setting('app.request_id', true), 'unknown'),
    v_org_id, 'organization', v_org_id::text
  );

  return v_org_id;
end;
$$;

comment on function public.create_client_organization is
  'Kreira klijenta atomično: organizacija, brendiranje, onboarding lista i dodela kreatoru. Proverava da je pozivalac aktivno Delta Pro osoblje.';

grant execute on function public.create_client_organization(
  text, text, text, text, char(2), char(3), text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Provera zauzetosti adrese radnog prostora
-- ---------------------------------------------------------------------------
--
-- Slug se pojavljuje u URL-u klijenta, pa mora biti jedinstven. Bez ove
-- provere konsultant popuni ceo formular pa dobije grešku o narušenom
-- jedinstvenom indeksu — poruku koja mu ništa ne znači.

create or replace function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff()
     and not exists (
       select 1 from public.organizations o where lower(o.slug) = lower(btrim(p_slug))
     );
$$;

grant execute on function public.slug_available(text) to authenticated;
