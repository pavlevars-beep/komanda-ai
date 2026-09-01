-- Integracije, izvori podataka, upozorenja i odobrenja za demo organizacije.
--
-- Sve nosi is_demo = true. Demo konektor je deterministički i ne dodiruje
-- nijedan stvarni sistem — nikad se ne pretvara da je povezan sa produkcijom.

-- ---------------------------------------------------------------------------
-- Demo Distribucija
-- ---------------------------------------------------------------------------

insert into public.integrations
  (id, organization_id, connector_type_key, name, environment, status, auth_type,
   config, is_read_only, is_demo, created_by, last_success_at, last_sync_at)
values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d002',
   'demo', 'Demo poslovni sistem', 'sandbox', 'connected', 'none',
   '{"dataset":"distribution"}', true, true,
   '00000000-0000-0000-0000-0000000000a1', now() - interval '4 minutes', now() - interval '4 minutes'),

  -- Namerno u stanju "zahteva pažnju": početni ekran mora da ima šta da prikaže.
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000d002',
   'rest', 'Sajt — kontakt forma', 'sandbox', 'needs_attention', 'api_key',
   '{"base_url":"https://example.invalid/api"}', true, true,
   '00000000-0000-0000-0000-0000000000a1', now() - interval '3 days', null)
on conflict (id) do nothing;

update public.integrations
set last_error_at = now() - interval '6 hours',
    last_error_code = 'connection_timeout',
    last_error_message = 'Izvor nije odgovorio u zadatom roku.'
where id = '00000000-0000-0000-0000-00000000e002';

insert into public.integration_capabilities
  (organization_id, integration_id, capability_key, enabled, mode, required_permission,
   freshness_sla_seconds, enabled_by, enabled_at)
values
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'get_daily_sales', true, 'read', 'view_sales', 900,
   '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'get_outstanding_invoices', true, 'read', 'view_financial_data', 3600,
   '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'get_inventory_alerts', true, 'read', 'view_inventory', 3600,
   '00000000-0000-0000-0000-0000000000a1', now())
on conflict (integration_id, capability_key) do nothing;

insert into public.data_sources
  (organization_id, integration_id, name, kind, freshness_sla_seconds, last_refreshed_at,
   record_count, is_demo)
values
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'Prodaja', 'sales', 900, now() - interval '4 minutes', 18432, true),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'Potraživanja', 'receivables', 3600, now() - interval '52 minutes', 1204, true),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e001',
   'Zalihe', 'inventory', 3600, now() - interval '2 hours', 3871, true);

insert into public.organization_ai_tools
  (organization_id, ai_tool_key, enabled, integration_id, enabled_by, enabled_at)
values
  ('00000000-0000-0000-0000-00000000d002', 'get_daily_sales', true,
   '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', 'get_sales_by_period', true,
   '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', 'get_outstanding_invoices', true,
   '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', 'get_inventory_alerts', true,
   '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', now()),
  ('00000000-0000-0000-0000-00000000d002', 'get_business_summary', true,
   null, '00000000-0000-0000-0000-0000000000a1', now())
on conflict (organization_id, ai_tool_key) do nothing;

insert into public.alerts
  (organization_id, severity, title, body, source, status, dedupe_key, created_at)
values
  ('00000000-0000-0000-0000-00000000d002', 'critical',
   'Tri fakture dospele preko 30 dana',
   '{"sr":"Ukupno 412.800 RSD na tri kupca.","en":"RSD 412,800 across three customers."}',
   'rule', 'new', 'receivables-overdue-30', now() - interval '2 hours'),

  ('00000000-0000-0000-0000-00000000d002', 'warning',
   'Integracija „Sajt — kontakt forma" ne odgovara',
   '{"sr":"Poslednja uspešna veza pre tri dana.","en":"Last successful connection three days ago."}',
   'integration', 'new', 'integration-e002-down', now() - interval '6 hours'),

  ('00000000-0000-0000-0000-00000000d002', 'warning',
   'Zalihe ispod minimuma za 4 artikla',
   '{"sr":"Najkritičniji artikal ima zalihu za 2 dana.","en":"The most critical item has two days of stock."}',
   'rule', 'acknowledged', 'inventory-below-min', now() - interval '1 day');

insert into public.approvals
  (organization_id, action_type, title, summary, payload, target_system, risk_level,
   status, requested_by_user_id, ai_reason, source_refs, idempotency_key, expires_at)
values
  ('00000000-0000-0000-0000-00000000d002', 'send_email',
   'Podsetnik za dospelu fakturu — Kupac 1042',
   '{"sr":"Predlog e-poruke kupcu sa dospelim dugom od 38 dana.","en":"Draft email to a customer 38 days overdue."}',
   '{"to":"kupac1042@demo.invalid","subject":"Podsetnik o dospelom plaćanju",
     "body":"Poštovani,\n\nevidentiramo neizmirenu obavezu po fakturi 2026-1042.\n\nSrdačno,\nDemo Distribucija"}',
   'E-pošta', 'medium', 'pending',
   '00000000-0000-0000-0000-0000000000b1',
   'Faktura je dospela pre 38 dana i nema evidentirane uplate ni kontakta.',
   '[{"label":"Demo poslovni sistem","capability":"get_outstanding_invoices"}]',
   'demo-reminder-1042', now() + interval '7 days');

-- ---------------------------------------------------------------------------
-- Demo Hotel Grupa — namerno u ranijoj fazi onboardinga
-- ---------------------------------------------------------------------------

insert into public.integrations
  (id, organization_id, connector_type_key, name, environment, status, auth_type,
   config, is_read_only, is_demo, created_by)
values
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000d003',
   'demo', 'Demo PMS', 'sandbox', 'testing', 'none',
   '{"dataset":"hospitality"}', true, true, '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.alerts
  (organization_id, severity, title, body, source, status, dedupe_key)
values
  ('00000000-0000-0000-0000-00000000d003', 'info',
   'Povezivanje sa PMS-om je u fazi testiranja',
   '{"sr":"Podaci još nisu potvrđeni za produkciju.","en":"Data is not yet validated for production."}',
   'system', 'new', 'hotel-pms-testing');

-- ---------------------------------------------------------------------------
-- Onboarding liste
-- ---------------------------------------------------------------------------

insert into public.onboarding_tasks (organization_id, key, step_order, status, completed_at)
select o.id, s.key, s.step_order,
       case when s.step_order <= o.done_through then 'done' else 'pending' end,
       case when s.step_order <= o.done_through then now() - interval '2 days' else null end
from (values
  ('00000000-0000-0000-0000-00000000d002'::uuid, 9),
  ('00000000-0000-0000-0000-00000000d003'::uuid, 4)
) as o(id, done_through)
cross join (values
  ('company_created', 1), ('branding', 2), ('users_invited', 3),
  ('data_source_connected', 4), ('connection_tested', 5), ('permissions_configured', 6),
  ('ai_tools_enabled', 7), ('dashboard_configured', 8), ('first_report_generated', 9),
  ('production_enabled', 10)
) as s(key, step_order)
on conflict (organization_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- KPI kartice na početnoj
-- ---------------------------------------------------------------------------
--
-- Namerno ih je malo. Šest kartica se pročitaju za nekoliko sekundi; dvadeset
-- se ne čitaju uopšte, nego se preskaču.

insert into public.dashboard_cards
  (organization_id, ai_tool_key, integration_id, title, format, value_field,
   compare_field, higher_is_better, input, step_order)
values
  ('00000000-0000-0000-0000-00000000d002', 'get_daily_sales',
   '00000000-0000-0000-0000-00000000e001',
   '{"sr":"Prodaja danas","en":"Sales today"}', 'money', 'total',
   null, true, '{}', 1),

  ('00000000-0000-0000-0000-00000000d002', 'get_sales_by_period',
   '00000000-0000-0000-0000-00000000e001',
   '{"sr":"Prodaja ove nedelje","en":"Sales this week"}', 'money', 'total',
   'previousTotal', true, '{"period":"week"}', 2),

  ('00000000-0000-0000-0000-00000000d002', 'get_outstanding_invoices',
   '00000000-0000-0000-0000-00000000e001',
   -- Rast dospelih potraživanja NIJE dobra vest.
   '{"sr":"Dospela potraživanja","en":"Outstanding receivables"}', 'money', 'total',
   null, false, '{"overdueDays":30}', 3),

  ('00000000-0000-0000-0000-00000000d002', 'get_inventory_alerts',
   '00000000-0000-0000-0000-00000000e001',
   '{"sr":"Artikli ispod minimuma","en":"Items below minimum"}', 'count', 'items',
   null, false, '{}', 4);
