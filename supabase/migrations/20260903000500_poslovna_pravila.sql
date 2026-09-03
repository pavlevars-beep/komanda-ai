-- description: Poslovna pravila po klijentu i nove sposobnosti za jutarnji brif.
--
-- Šta je „dospelo", šta je „kritična zaliha" i koji period je uporedni nije
-- ista stvar za distributera i za hotel. Dok su ti pragovi u kodu, svaka firma
-- koja ih vidi drugačije traži izmenu koda — a prvi klijent koji to zatraži
-- otkrije da je pola logike napisano oko njegovih brojeva.
--
-- Zato su pragovi PODATAK. Čuvaju se kao jedan jsonb umesto kao dvadeset
-- kolona: skup pravila će rasti, a svako novo pravilo kao kolona znači
-- migraciju i isporuku za promenu koja je po prirodi podešavanje.
--
-- Oblik se NE proverava ovde nego u aplikaciji, Zod šemom, pri čitanju.
-- Provera u bazi bi morala da se održava uporedo sa istom tom šemom, a dve
-- definicije istog pravila se vremenom raziđu — i tada tiše popušta ona koju
-- niko ne gleda.

create table public.organization_business_rules (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  rules           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.user_profiles(id) on delete set null,

  constraint business_rules_is_object check (jsonb_typeof(rules) = 'object')
);

create trigger organization_business_rules_touch before update
  on public.organization_business_rules
  for each row execute function app.touch_updated_at();

alter table public.organization_business_rules enable row level security;
alter table public.organization_business_rules force row level security;
grant select on public.organization_business_rules to authenticated;
grant insert, update on public.organization_business_rules to authenticated;

-- Klijent VIDI svoje pragove — bez toga upozorenje „preko 90 dana" ostaje broj
-- bez objašnjenja odakle je došao.
create policy business_rules_select on public.organization_business_rules
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

-- Menja ih onaj ko u organizaciji upravlja upozorenjima, i Delta Pro kroz
-- administrativni pristup. Pragovi menjaju šta se uopšte prijavljuje, pa to
-- nije podešavanje koje sme svako.
create policy business_rules_write on public.organization_business_rules
  for insert to authenticated
  with check (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_alerts')
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy business_rules_update on public.organization_business_rules
  for update to authenticated
  using (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_alerts')
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  )
  with check (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_alerts')
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

-- ---------------------------------------------------------------------------
-- Nove sposobnosti koje brif koristi
-- ---------------------------------------------------------------------------

insert into public.ai_tools
  (key, name, description, required_permission, connector_type_key, capability_key,
   input_schema, output_schema, classification, mode) values

  ('get_sales_summary',
   '{"sr":"Pregled prodaje","en":"Sales summary"}',
   '{"sr":"Juče, sedam dana i mesec, svaki sa poređenjem uporednog perioda.","en":"Yesterday, seven days and month, each compared with the comparable period."}',
   'view_sales', null, 'get_sales_summary',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"currency":{"type":"string"},"asOf":{"type":"string"},"yesterday":{"type":"object"},"last7Days":{"type":"object"},"monthToDate":{"type":"object"}}}',
   -- Zbirovi i procenti su izvedeni sabiranjem dnevnih vrednosti.
   'calculation', 'read'),

  ('get_receivables_aging',
   '{"sr":"Starosna struktura potraživanja","en":"Receivables aging"}',
   '{"sr":"Otvorena potraživanja razvrstana po opsezima kašnjenja.","en":"Outstanding receivables grouped by overdue bucket."}',
   'view_financial_data', null, 'get_receivables_aging',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"string"},"overdue":{"type":"string"},"currency":{"type":"string"},"buckets":{"type":"array"}}}',
   'calculation', 'read'),

  ('get_stock_status',
   '{"sr":"Pokrivenost zaliha","en":"Stock coverage"}',
   '{"sr":"Stanje, prosečna dnevna potrošnja, pokrivenost u danima i rok isporuke.","en":"On hand, average daily demand, coverage in days and lead time."}',
   'view_inventory', null, 'get_stock_status',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"items":{"type":"array"}}}',
   -- Pokrivenost je količnik stanja i potrošnje, ne zapis iz sistema.
   'calculation', 'read')

on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    capability_key = excluded.capability_key,
    classification = excluded.classification;

/*
 * Nove sposobnosti se uključuju za organizacije koje već koriste demo
 * konektor, i samo za njih.
 *
 * Bez ovoga bi brif kod postojećeg demo klijenta prikazao tri prazna bloka sa
 * porukom „sposobnost nije uključena" — tehnički tačno, a na ekranu izgleda
 * kao da proizvod ne radi.
 */
insert into public.integration_capabilities
  (organization_id, integration_id, capability_key, mode, required_permission, enabled)
select i.organization_id, i.id, v.key, 'read', v.permission, true
from public.integrations i
cross join (values
  ('get_sales_summary', 'view_sales'),
  ('get_receivables_aging', 'view_financial_data'),
  ('get_stock_status', 'view_inventory')
) as v(key, permission)
where i.connector_type_key = 'demo'
on conflict (integration_id, capability_key) do update
set enabled = true;

insert into public.organization_ai_tools (organization_id, ai_tool_key, enabled, integration_id)
select i.organization_id, v.key, true, i.id
from public.integrations i
cross join (values
  ('get_sales_summary'),
  ('get_receivables_aging'),
  ('get_stock_status')
) as v(key)
where i.connector_type_key = 'demo'
on conflict (organization_id, ai_tool_key) do update
set enabled = true;
