-- description: Poslovni kontekstni događaji — ono što firma kaže da je bilo izuzetno.
--
-- Istorijski podaci sami po sebi vode na pogrešne zaključke. Firma koja je
-- imala jedan veliki jednokratni projekat u martu i aprilu 2025. imaće „pad
-- prodaje" u martu 2026. — a nikakvog pada nema; poredi se sa nečim što se ne
-- ponavlja.
--
-- Zato sistem ne sme da zna samo ŠTA SE DOGODILO nego i ŠTA FIRMA KAŽE DA JE
-- BILO IZUZETNO i zašto. To je podatak koji nijedan ERP ne čuva, jer nije
-- knjigovodstvena kategorija — a bez njega je svako poređenje sumnjivo.
--
-- Događaj NE MENJA izvorne podatke. On menja samo TUMAČENJE: šta ulazi u
-- osnovicu za poređenje, šta u prognozu, i šta stoji kao napomena uz broj.
-- Ispravljanje samih brojeva bi značilo da se prikazuje nešto što ne postoji
-- ni u jednom sistemu klijenta.

create type context_event_kind as enum (
  'one_off_project',      -- veliki jednokratni posao
  'major_order',          -- neuobičajeno velika porudžbina
  'supplier_disruption',  -- zastoj kod dobavljača
  'warehouse_closure',    -- zatvaranje magacina
  'price_change',         -- promena cena
  'holiday_period',       -- praznici i kolektivni odmor
  'strike',               -- štrajk
  'market_shock',         -- tržišni šok
  'new_location',         -- otvaranje ogranka
  'lost_customer',        -- gubitak velikog kupca
  'campaign',             -- promocija ili kampanja
  'clearance',            -- rasprodaja zaliha
  'other'
);

create table public.business_context_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  kind            context_event_kind not null default 'other',
  title           text not null,
  note            text,

  -- Period na koji se događaj odnosi. Otvoren kraj znači „još traje".
  starts_on       date not null,
  ends_on         date,

  -- Procenjeni uticaj na prihod, u valuti organizacije. Predznak nosi smer:
  -- veliki projekat je pozitivan, gubitak kupca negativan.
  revenue_impact  numeric(18, 2),

  /*
   * Postupanje. Četiri nezavisna izbora, ne jedan režim.
   *
   * Isti događaj se po pravilu ISKLJUČUJE iz osnovice a ZADRŽAVA u finansijskim
   * zbirovima — novac je stvarno ušao. Jedan režim bi terao na izbor između
   * tačnog zbira i tačnog poređenja, a potrebno je oboje.
   */
  exclude_from_baseline  boolean not null default true,
  keep_in_totals         boolean not null default true,
  exclude_from_forecast  boolean not null default true,
  annotate_comparison    boolean not null default true,

  created_at      timestamptz not null default now(),
  created_by      uuid references public.user_profiles(id) on delete set null,
  updated_at      timestamptz not null default now(),

  unique (organization_id, id),
  constraint context_event_title_not_blank check (length(btrim(title)) > 0),
  constraint context_event_period_ordered check (ends_on is null or ends_on >= starts_on)
);

create index context_events_by_period
  on public.business_context_events (organization_id, starts_on desc);

create trigger business_context_events_touch before update
  on public.business_context_events
  for each row execute function app.touch_updated_at();

alter table public.business_context_events enable row level security;
alter table public.business_context_events force row level security;
grant select, insert, update, delete on public.business_context_events to authenticated;

-- Vidi ga svako ko vidi podatke — napomena uz broj je beskorisna ako je ne
-- vidi onaj ko broj čita.
create policy context_events_select on public.business_context_events
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

/*
 * Upisuje ga onaj ko u organizaciji upravlja upozorenjima.
 *
 * Događaj menja osnovicu za poređenje, dakle menja i koja se upozorenja
 * otvaraju. To nije komentar nego podešavanje analize, i ne sme svako.
 */
create policy context_events_insert on public.business_context_events
  for insert to authenticated
  with check (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_alerts')
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy context_events_update on public.business_context_events
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

create policy context_events_delete on public.business_context_events
  for delete to authenticated
  using (
    (
      organization_id in (select unnest(app.accessible_org_ids()))
      and app.has_permission(organization_id, 'manage_alerts')
    )
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

comment on table public.business_context_events is
  'Šta firma kaže da je bilo izuzetno. Ne menja izvorne podatke — menja tumačenje.';

-- ---------------------------------------------------------------------------
-- Istorija prodaje po mesecima
-- ---------------------------------------------------------------------------

insert into public.ai_tools
  (key, name, description, required_permission, connector_type_key, capability_key,
   input_schema, output_schema, classification, mode) values

  ('get_sales_history',
   '{"sr":"Istorija prodaje","en":"Sales history"}',
   '{"sr":"Mesečna prodaja kroz više godina, za poređenje i trend.","en":"Monthly sales across several years, for comparison and trend."}',
   'view_sales', null, 'get_sales_history',
   '{"type":"object","properties":{"years":{"type":"integer","minimum":1,"maximum":10}},"additionalProperties":false}',
   '{"type":"object","properties":{"currency":{"type":"string"},"months":{"type":"array"}}}',
   -- Mesečni zbir se sabira iz dnevnih vrednosti; nije zapis iz sistema.
   'calculation', 'read')

on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    capability_key = excluded.capability_key,
    classification = excluded.classification;

insert into public.integration_capabilities
  (organization_id, integration_id, capability_key, mode, required_permission, enabled)
select i.organization_id, i.id, 'get_sales_history', 'read', 'view_sales', true
from public.integrations i
where i.connector_type_key = 'demo'
on conflict (integration_id, capability_key) do update set enabled = true;

insert into public.organization_ai_tools (organization_id, ai_tool_key, enabled, integration_id)
select i.organization_id, 'get_sales_history', true, i.id
from public.integrations i
where i.connector_type_key = 'demo'
on conflict (organization_id, ai_tool_key) do update set enabled = true;
