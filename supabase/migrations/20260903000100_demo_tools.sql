-- description: Alati za finansijski pregled, obaveze, dužnike i zaposlene.
--
-- Katalog alata je deo definicije proizvoda, kao i postojeći unosi u
-- `20260831121200_catalog.sql`. Sposobnosti koje ih pokrivaju već postoje u
-- demo konektoru; ovde se opisuju za sloj koji ih nudi klijentu.

insert into public.ai_tools
  (key, name, description, required_permission, connector_type_key, capability_key,
   input_schema, output_schema, classification, mode) values

  ('get_financial_summary',
   '{"sr":"Prihodi i rashodi","en":"Revenue and expenses"}',
   '{"sr":"Prihod, rashod, dobit i marža za period, sa poređenjem prethodnog perioda.","en":"Revenue, expenses, profit and margin for a period, compared with the previous one."}',
   'view_financial_data', null, 'get_financial_summary',
   '{"type":"object","properties":{"from":{"type":"string","format":"date"},"to":{"type":"string","format":"date"}},"required":["from","to"],"additionalProperties":false}',
   '{"type":"object","properties":{"revenue":{"type":"string"},"expenses":{"type":"string"},"profit":{"type":"string"},"marginPercent":{"type":"number"},"currency":{"type":"string"}}}',
   -- Marža se izračunava iz prihoda i rashoda; nije zapis iz sistema.
   'calculation', 'read'),

  ('get_payables',
   '{"sr":"Obaveze prema dobavljačima","en":"Supplier payables"}',
   '{"sr":"Neizmirene obaveze, sa iznosom koji dospeva u narednih sedam dana.","en":"Outstanding payables, including the amount due within seven days."}',
   'view_financial_data', null, 'get_payables',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"string"},"dueWithin7Days":{"type":"string"},"currency":{"type":"string"},"items":{"type":"array"}}}',
   'fact', 'read'),

  ('get_top_debtors',
   '{"sr":"Najveći dužnici","en":"Largest debtors"}',
   '{"sr":"Kupci sa najvećim otvorenim potraživanjima, sabrano po kupcu.","en":"Customers with the largest open receivables, aggregated per customer."}',
   'view_financial_data', null, 'get_top_debtors',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"string"},"currency":{"type":"string"},"items":{"type":"array"}}}',
   -- Sabrano po kupcu iz otvorenih faktura — izvedeno, ne prepisano.
   'calculation', 'read'),

  ('get_headcount',
   '{"sr":"Broj zaposlenih","en":"Headcount"}',
   '{"sr":"Ukupan broj zaposlenih i raspodela po odeljenjima.","en":"Total headcount and distribution across departments."}',
   'view_customers', null, 'get_headcount',
   '{"type":"object","properties":{},"additionalProperties":false}',
   '{"type":"object","properties":{"total":{"type":"integer"},"departments":{"type":"array"}}}',
   'fact', 'read')

on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      capability_key = excluded.capability_key,
      classification = excluded.classification;
