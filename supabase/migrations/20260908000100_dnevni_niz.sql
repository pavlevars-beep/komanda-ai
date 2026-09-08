-- description: Dnevni niz prodaje za grafikon na početnoj strani.

insert into public.ai_tools
  (key, name, description, required_permission, connector_type_key, capability_key,
   input_schema, output_schema, classification, mode) values

  ('get_sales_daily',
   '{"sr":"Prodaja po danima","en":"Daily sales series"}',
   '{"sr":"Dnevne vrednosti prodaje unazad, za prikaz kretanja.","en":"Daily sales values going back, for a trend view."}',
   'view_sales', null, 'get_sales_daily',
   '{"type":"object","properties":{"days":{"type":"integer","minimum":1,"maximum":90}},"required":["days"],"additionalProperties":false}',
   '{"type":"object","properties":{"currency":{"type":"string"},"days":{"type":"array"}}}',
   -- Niz je prepis dnevnih vrednosti, ali ga sastavlja sistem; klasifikacija
   -- prati postupak, ne pojedinačnu vrednost.
   'calculation', 'read')

on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    capability_key = excluded.capability_key;

insert into public.integration_capabilities
  (organization_id, integration_id, capability_key, mode, required_permission, enabled)
select i.organization_id, i.id, 'get_sales_daily', 'read', 'view_sales', true
from public.integrations i
where i.connector_type_key = 'demo'
on conflict (integration_id, capability_key) do update set enabled = true;

insert into public.organization_ai_tools (organization_id, ai_tool_key, enabled, integration_id)
select i.organization_id, 'get_sales_daily', true, i.id
from public.integrations i
where i.connector_type_key = 'demo'
on conflict (organization_id, ai_tool_key) do update set enabled = true;
