-- description: Proizvodni katalozi — permisije, sistemske role, tipovi konektora, AI alati.
--
-- Ovo NIJE seed za razvoj. To su definicije proizvoda i deo su migracije,
-- jer se na njih oslanjaju strani ključevi i RLS politike.

-- ---------------------------------------------------------------------------
-- Permisije
-- ---------------------------------------------------------------------------

insert into public.permissions (key, category, name, is_sensitive) values
  ('view_financial_data', 'data',  '{"sr":"Uvid u finansijske podatke","en":"View financial data"}', true),
  ('view_sales',          'data',  '{"sr":"Uvid u prodaju","en":"View sales"}', false),
  ('view_customers',      'data',  '{"sr":"Uvid u kupce","en":"View customers"}', false),
  ('view_inventory',      'data',  '{"sr":"Uvid u zalihe","en":"View inventory"}', false),
  ('view_documents',      'data',  '{"sr":"Uvid u dokumenta","en":"View documents"}', false),
  ('export_data',         'data',  '{"sr":"Izvoz podataka","en":"Export data"}', true),

  ('ask_ai',              'ai',    '{"sr":"Postavljanje pitanja AI-ju","en":"Ask AI"}', false),
  ('run_reports',         'ai',    '{"sr":"Pokretanje izveštaja","en":"Run reports"}', false),

  ('approve_actions',     'action','{"sr":"Odobravanje akcija","en":"Approve actions"}', true),
  ('execute_actions',     'action','{"sr":"Izvršavanje akcija","en":"Execute actions"}', true),

  ('manage_integrations', 'admin', '{"sr":"Upravljanje integracijama","en":"Manage integrations"}', true),
  ('manage_users',        'admin', '{"sr":"Upravljanje korisnicima","en":"Manage users"}', true),
  ('manage_branding',     'admin', '{"sr":"Upravljanje brendiranjem","en":"Manage branding"}', false),
  ('manage_alerts',       'admin', '{"sr":"Upravljanje upozorenjima","en":"Manage alerts"}', false),
  ('manage_reports',      'admin', '{"sr":"Upravljanje izveštajima","en":"Manage reports"}', false),

  ('view_audit_log',      'security','{"sr":"Uvid u revizioni trag","en":"View audit log"}', true);

-- ---------------------------------------------------------------------------
-- Sistemske role
-- ---------------------------------------------------------------------------

insert into public.roles (key, scope, is_system, name, description) values
  ('platform_super_admin', 'platform', true,
   '{"sr":"Delta Pro Super Admin","en":"Delta Pro Super Admin"}',
   '{"sr":"Puna administracija platforme. Pristup poslovnim podacima klijenta i dalje traži sesiju pristupa.","en":"Full platform administration. Access to client business data still requires an access session."}'),
  ('platform_consultant', 'platform', true,
   '{"sr":"Delta Pro konsultant","en":"Delta Pro consultant"}',
   '{"sr":"Konfiguracija i dijagnostika dodeljenih klijenata.","en":"Configuration and diagnostics for assigned clients."}'),
  ('platform_support', 'platform', true,
   '{"sr":"Delta Pro podrška","en":"Delta Pro support"}',
   '{"sr":"Nadzor i dijagnostika, bez izmena konfiguracije.","en":"Monitoring and diagnostics, without configuration changes."}'),

  ('client_owner', 'client', true,
   '{"sr":"Vlasnik","en":"Owner"}',
   '{"sr":"Pun pristup radnom prostoru organizacije.","en":"Full access to the organisation workspace."}'),
  ('client_admin', 'client', true,
   '{"sr":"Administrator","en":"Administrator"}',
   '{"sr":"Upravljanje korisnicima i podešavanjima organizacije.","en":"Manages users and organisation settings."}'),
  ('manager', 'client', true,
   '{"sr":"Rukovodilac","en":"Manager"}', '{"sr":"","en":""}'),
  ('finance', 'client', true,
   '{"sr":"Finansije","en":"Finance"}', '{"sr":"","en":""}'),
  ('sales', 'client', true,
   '{"sr":"Prodaja","en":"Sales"}', '{"sr":"","en":""}'),
  ('employee', 'client', true,
   '{"sr":"Zaposleni","en":"Employee"}', '{"sr":"","en":""}'),
  ('viewer', 'client', true,
   '{"sr":"Pregled","en":"Viewer"}', '{"sr":"","en":""}');

-- Dodela permisija rolama.
--
-- Napomena o platformskim rolama: one NEMAJU permisije za poslovne podatke.
-- Delta Pro osoblje ih dobija privremeno, kroz sesiju pristupa, preko
-- app.has_permission() — ne kroz stalnu dodelu.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('manage_integrations'), ('manage_users'), ('manage_branding'),
  ('manage_alerts'), ('manage_reports'), ('view_audit_log')
) as p(key)
where r.key in ('platform_super_admin', 'platform_consultant');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'view_audit_log' from public.roles r where r.key = 'platform_support';

-- Klijentske role.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('view_financial_data'), ('view_sales'), ('view_customers'), ('view_inventory'),
  ('view_documents'), ('export_data'), ('ask_ai'), ('run_reports'),
  ('approve_actions'), ('execute_actions'),
  ('manage_users'), ('manage_branding'), ('manage_alerts'), ('manage_reports'),
  ('manage_integrations'), ('view_audit_log')
) as p(key)
where r.key = 'client_owner';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('view_financial_data'), ('view_sales'), ('view_customers'), ('view_inventory'),
  ('view_documents'), ('ask_ai'), ('run_reports'), ('approve_actions'),
  ('manage_users'), ('manage_branding'), ('manage_alerts'), ('manage_reports'),
  ('view_audit_log')
) as p(key)
where r.key = 'client_admin';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('view_financial_data'), ('view_sales'), ('view_customers'), ('view_inventory'),
  ('view_documents'), ('ask_ai'), ('run_reports'), ('approve_actions')
) as p(key)
where r.key = 'manager';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('view_financial_data'), ('view_customers'), ('view_documents'),
  ('ask_ai'), ('run_reports'), ('export_data')
) as p(key)
where r.key = 'finance';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values
  ('view_sales'), ('view_customers'), ('view_inventory'), ('ask_ai'), ('run_reports')
) as p(key)
where r.key = 'sales';

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join lateral (values ('view_sales'), ('view_documents'), ('ask_ai')) as p(key)
where r.key = 'employee';

insert into public.role_permissions (role_id, permission_key)
select r.id, 'view_sales' from public.roles r where r.key = 'viewer';

-- ---------------------------------------------------------------------------
-- Tipovi konektora
-- ---------------------------------------------------------------------------
--
-- Dostupnost je iskrena: 'ga' su konektori koji stvarno rade, 'planned' su
-- oni čiji su interfejsi spremni ali implementacija nije. UI 'planned'
-- konektore prikazuje kao nedostupne, umesto da ponudi dugme koje ne radi.

insert into public.connector_types
  (key, name, category, availability, supported_auth, supports_agent, capability_manifest) values

  ('demo', '{"sr":"Demo konektor","en":"Demo connector"}', 'demo', 'ga',
   '{none}', false,
   '[{"key":"get_daily_sales","mode":"read"},
     {"key":"get_outstanding_invoices","mode":"read"},
     {"key":"get_inventory_alerts","mode":"read"},
     {"key":"get_sales_by_period","mode":"read"}]'),

  ('rest', '{"sr":"REST API","en":"REST API"}', 'api', 'ga',
   '{none,api_key,bearer,basic,oauth2_client_credentials}', false, '[]'),

  ('webhook', '{"sr":"Webhook","en":"Webhook"}', 'api', 'ga',
   '{hmac}', false, '[]'),

  -- Pripremljeno: interfejsi postoje, implementacija dolazi po prvom klijentu.
  ('mssql', '{"sr":"SQL Server","en":"SQL Server"}', 'database', 'planned',
   '{sql_login}', true, '[]'),
  ('postgres', '{"sr":"PostgreSQL","en":"PostgreSQL"}', 'database', 'planned',
   '{password}', true, '[]'),
  ('tim_erp', '{"sr":"Tim ERP","en":"Tim ERP"}', 'erp', 'planned',
   '{}', true, '[]'),
  ('ms_system', '{"sr":"M&S system","en":"M&S system"}', 'erp', 'planned',
   '{}', true, '[]'),
  ('m365', '{"sr":"Microsoft 365","en":"Microsoft 365"}', 'office', 'planned',
   '{oauth2}', false, '[]'),
  ('n8n', '{"sr":"n8n automatizacija","en":"n8n automation"}', 'automation', 'planned',
   '{api_key}', false, '[]');

comment on table public.connector_types is
  'Katalog konektora. Za tim_erp i ms_system način pristupa (API, baza ili izvoz) tek treba potvrditi sa klijentima — do tada manifest sposobnosti namerno ostaje prazan.';

-- ---------------------------------------------------------------------------
-- Registar AI alata
-- ---------------------------------------------------------------------------
--
-- Klasifikacija dolazi ODAVDE, ne iz modela. Alat koji vraća podatak iz ERP-a
-- je 'fact'; alat koji nešto procenjuje je 'forecast' i UI ga tako i prikazuje.

insert into public.ai_tools
  (key, name, description, required_permission, connector_type_key, capability_key,
   input_schema, output_schema, classification, mode) values

  ('get_daily_sales',
   '{"sr":"Prodaja za dan","en":"Daily sales"}',
   '{"sr":"Ukupna prodaja za zadati dan iz povezanog poslovnog sistema.","en":"Total sales for a given day from the connected business system."}',
   'view_sales', null, 'get_daily_sales',
   '{"type":"object","properties":{"date":{"type":"string","format":"date"}},"required":["date"],"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"string"},"currency":{"type":"string"},"as_of":{"type":"string"}}}',
   'fact', 'read'),

  ('get_sales_by_period',
   '{"sr":"Prodaja po periodu","en":"Sales by period"}',
   '{"sr":"Prodaja u zadatom periodu, sa poređenjem prethodnog perioda.","en":"Sales over a period, with prior-period comparison."}',
   'view_sales', null, 'get_sales_by_period',
   '{"type":"object","properties":{"from":{"type":"string","format":"date"},"to":{"type":"string","format":"date"}},"required":["from","to"],"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"string"},"previous_total":{"type":"string"},"currency":{"type":"string"},"as_of":{"type":"string"}}}',
   'calculation', 'read'),

  ('get_outstanding_invoices',
   '{"sr":"Dospela potraživanja","en":"Outstanding invoices"}',
   '{"sr":"Neplaćene fakture starije od zadatog broja dana.","en":"Unpaid invoices older than a given number of days."}',
   'view_financial_data', null, 'get_outstanding_invoices',
   '{"type":"object","properties":{"overdue_days":{"type":"integer","minimum":0,"maximum":365}},"required":["overdue_days"],"additionalProperties":false}',
   '{"type":"object","properties":{"items":{"type":"array"},"total":{"type":"string"},"currency":{"type":"string"},"as_of":{"type":"string"}}}',
   'fact', 'read'),

  ('get_inventory_alerts',
   '{"sr":"Zalihe ispod praga","en":"Inventory below threshold"}',
   '{"sr":"Artikli čije su zalihe ispod definisanog minimuma.","en":"Items whose stock is below the defined minimum."}',
   'view_inventory', null, 'get_inventory_alerts',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"items":{"type":"array"},"as_of":{"type":"string"}}}',
   'fact', 'read'),

  ('get_business_summary',
   '{"sr":"Pregled poslovanja","en":"Business summary"}',
   '{"sr":"Sažetak onoga što danas traži pažnju, sastavljen iz više izvora.","en":"A summary of what needs attention today, assembled from several sources."}',
   'ask_ai', null, null,
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"items":{"type":"array"},"as_of":{"type":"string"}}}',
   'interpretation', 'read');
