-- description: Demo klijent za prikaz proizvoda (Euro Profil).
--
-- Ovo je SEED, ne šema. Stoji među migracijama namerno: pipeline za migracije
-- je jedini automatski put do baze, a demo klijent mora da postoji pre
-- zakazanog prikaza, bez ručnog otvaranja SQL editora.
--
-- Bezopasno je i idempotentno — ponovno pokretanje ne pravi duplikate.
-- Kada demo prestane da bude potreban, briše se jednim `delete from
-- organizations where slug = 'euro-profil'`; sve ostalo odlazi kaskadno.
--
-- Organizacija NIJE označena kao demo: demo je izvor podataka, ne firma, a
-- trigger environment_guard demo organizacije u produkciji ionako odbija.
-- Integracija JESTE označena, pa svaka kartica u radnom prostoru nosi oznaku
-- da podatak nije iz produkcionog sistema.

do $$
declare
  v_staff   uuid;
  v_org     uuid;
  v_role    uuid;
  v_integ   uuid;
  v_slug    text := 'euro-profil';
  v_name    text := 'Euro Profil';
begin
  -- Nalog Delta Pro osoblja koji će biti zadužen za klijenta.
  select s.user_id into v_staff
  from public.platform_staff s
  where s.is_active
  order by s.created_at
  limit 1;

  select r.id into v_role
  from public.roles r
  where r.key = 'client_owner' and r.is_system and r.organization_id is null;

  -- Na čistoj bazi (CI, novo okruženje) osoblja još nema. Seed se tada
  -- PRESKAČE, ne obara isporuku: demo klijent je pogodnost, a migracija koja
  -- ruši ceo `db push` zbog nedostatka pogodnosti blokira i sve ostalo.
  if v_staff is null then
    raise notice 'Preskačem demo klijenta: nema aktivnog naloga u platform_staff.';
    return;
  end if;

  if v_role is null then
    raise notice 'Preskačem demo klijenta: sistemska rola client_owner ne postoji.';
    return;
  end if;

  -- 1. Organizacija. is_demo ostaje FALSE — trigger environment_guard odbija
  --    demo organizacije u produkciji, a demo je ovde IZVOR podataka, ne firma.
  insert into public.organizations
    (slug, legal_name, display_name, industry, country, default_currency,
     timezone, plan, default_locale, status, is_platform_org, is_demo)
  values
    (v_slug, v_name || ' d.o.o.', v_name, 'Proizvodnja', 'RS', 'RSD',
     'Europe/Belgrade', 'standard', 'sr', 'active', false, false)
  on conflict do nothing;

  select o.id into v_org from public.organizations o where o.slug = v_slug;

  -- 2. Brendiranje
  insert into public.organization_branding (organization_id, workspace_name, primary_color)
  values (v_org, v_name, '#2F6F62')
  on conflict (organization_id) do update
    set workspace_name = excluded.workspace_name;

  -- 3. Onboarding lista
  insert into public.onboarding_tasks (organization_id, key, step_order, status, completed_at, completed_by)
  select v_org, s.key, s.step_order,
         case when s.key in ('company_created','branding','data_source_connected','connection_tested')
              then 'done' else 'pending' end,
         case when s.key in ('company_created','branding','data_source_connected','connection_tested')
              then now() else null end,
         case when s.key in ('company_created','branding','data_source_connected','connection_tested')
              then v_staff else null end
  from (values
    ('company_created',1),('branding',2),('users_invited',3),('data_source_connected',4),
    ('connection_tested',5),('permissions_configured',6),('ai_tools_enabled',7),
    ('dashboard_configured',8),('first_report_generated',9),('production_enabled',10)
  ) as s(key, step_order)
  on conflict (organization_id, key) do nothing;

  -- 4. Konsultant zadužen za klijenta
  insert into public.client_assignments (staff_user_id, organization_id, assigned_by)
  values (v_staff, v_org, v_staff)
  on conflict (staff_user_id, organization_id) do nothing;

  -- 5. Članstvo, da se radni prostor može otvoriti bez sesije pristupa.
  --    Za pravog klijenta ovo se radi pozivnicom; ovde je da demo prikaže
  --    tačno ono što klijent vidi.
  insert into public.organization_memberships
    (organization_id, user_id, role_id, status, invited_by, accepted_at)
  values (v_org, v_staff, v_role, 'active', v_staff, now())
  on conflict (organization_id, user_id) do update
    set status = 'active', accepted_at = now();

  -- 6. Demo integracija, već u stanju „povezano".
  insert into public.integrations
    (organization_id, connector_type_key, name, environment, status, auth_type,
     config, is_read_only, is_demo, created_by, last_success_at)
  values
    (v_org, 'demo', 'Demo ERP', 'sandbox', 'connected', 'none',
     '{"dataset":"distribution"}'::jsonb, true, true, v_staff, now())
  on conflict (organization_id, name, environment) do update
    set status = 'connected', last_success_at = now()
  returning id into v_integ;

  if v_integ is null then
    select i.id into v_integ from public.integrations i
    where i.organization_id = v_org and i.name = 'Demo ERP' and i.environment = 'sandbox';
  end if;

  -- 7. Uključene sposobnosti. Permisija se uzima iz definicije alata.
  insert into public.integration_capabilities
    (organization_id, integration_id, capability_key, enabled, mode, required_permission,
     enabled_by, enabled_at)
  select v_org, v_integ, c.key, true, 'read', c.perm, v_staff, now()
  from (values
    ('get_daily_sales','view_sales'),
    ('get_sales_by_period','view_sales'),
    ('get_outstanding_invoices','view_financial_data'),
    ('get_inventory_alerts','view_inventory'),
    ('get_financial_summary','view_financial_data'),
    ('get_payables','view_financial_data'),
    ('get_top_debtors','view_financial_data'),
    ('get_headcount','view_customers')
  ) as c(key, perm)
  on conflict (integration_id, capability_key) do update
    set enabled = true;

  -- 8. Alati uključeni za organizaciju. Bez ovoga kartica postoji ali se ne
  --    prikazuje — dashboard_cards_for_user je namerno ne vraća.
  insert into public.organization_ai_tools
    (organization_id, ai_tool_key, enabled, integration_id, enabled_by, enabled_at)
  select v_org, k, true, v_integ, v_staff, now()
  from unnest(array[
    'get_daily_sales','get_sales_by_period','get_outstanding_invoices',
    'get_financial_summary','get_payables','get_top_debtors','get_headcount'
  ]) as k
  on conflict (organization_id, ai_tool_key) do update
    set enabled = true, integration_id = excluded.integration_id;

  -- 9. Kartice na početnoj.
  --    Kod dospelih potraživanja higher_is_better = false: rast je loša vest,
  --    pa bi zeleno +18% obmanulo čitaoca.
  insert into public.dashboard_cards
    (organization_id, ai_tool_key, integration_id, title, format, value_field,
     compare_field, higher_is_better, input, step_order, enabled)
  values
    (v_org, 'get_daily_sales', v_integ,
     '{"sr":"Prodaja danas","en":"Sales today"}'::jsonb, 'money', 'total',
     null, true, '{}'::jsonb, 1, true),
    (v_org, 'get_sales_by_period', v_integ,
     '{"sr":"Prodaja, 7 dana","en":"Sales, 7 days"}'::jsonb, 'money', 'total',
     'previousTotal', true, '{"period":"week"}'::jsonb, 2, true),
    (v_org, 'get_outstanding_invoices', v_integ,
     '{"sr":"Dospela potraživanja","en":"Outstanding invoices"}'::jsonb, 'money', 'total',
     null, false, '{"overdueDays":30}'::jsonb, 3, true),
    (v_org, 'get_financial_summary', v_integ,
     '{"sr":"Prihod, 30 dana","en":"Revenue, 30 days"}'::jsonb, 'money', 'revenue',
     'previousRevenue', true, '{}'::jsonb, 4, true),
    (v_org, 'get_financial_summary', v_integ,
     '{"sr":"Rashod, 30 dana","en":"Expenses, 30 days"}'::jsonb, 'money', 'expenses',
     -- Rast rashoda nije dobra vest; boja promene se izvodi odavde.
     null, false, '{}'::jsonb, 5, true),
    (v_org, 'get_payables', v_integ,
     '{"sr":"Obaveze prema dobavljačima","en":"Supplier payables"}'::jsonb, 'money', 'total',
     null, false, '{}'::jsonb, 6, true),
    (v_org, 'get_headcount', v_integ,
     '{"sr":"Broj zaposlenih","en":"Headcount"}'::jsonb, 'count', 'total',
     null, true, '{}'::jsonb, 7, true)
  on conflict do nothing;

  raise notice 'Demo klijent je spreman: /w/%', v_slug;
end;
$$;
