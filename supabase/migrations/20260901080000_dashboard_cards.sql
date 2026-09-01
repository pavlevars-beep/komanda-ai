-- description: Konfigurabilne KPI kartice na početnoj klijentskog radnog prostora.
--
-- Koje kartice klijent vidi odlučuje Delta Pro, ne klijent i ne AI. Kartica
-- pokazuje na SPOSOBNOST konektora, ne na proizvoljan upit — vrednost prolazi
-- kroz isti runner kao i svaki drugi poziv, sa istom proverom permisije,
-- validacijom izlaza i podatkom o poreklu.
--
-- Namerno se ne čuva izračunata vrednost. Keširan broj u bazi vremenom
-- prestane da odgovara stvarnosti, a korisnik nema način da to primeti —
-- što je upravo ono što ovaj proizvod ne sme da radi.

create type card_format as enum ('money', 'number', 'percent', 'count');

create table public.dashboard_cards (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  -- Sposobnost koja daje vrednost. Bez nje kartica nema šta da prikaže.
  ai_tool_key         text not null references public.ai_tools(key),
  integration_id      uuid,

  title               jsonb not null,
  format              card_format not null default 'number',
  -- Naziv polja u izlazu sposobnosti iz kojeg se čita vrednost.
  value_field         text not null default 'total',
  -- Opciono polje za poređenje sa prethodnim periodom.
  compare_field       text,
  -- Da li je rast dobra vest. Za prodaju jeste; za dospela potraživanja nije,
  -- pa bi zeleno +18% bilo obmanjujuće. Boja promene se izvodi odavde, ne iz
  -- samog znaka broja.
  higher_is_better    boolean not null default true,
  -- Fiksni ulaz za sposobnost, npr. {"overdueDays": 30}. Dinamički ulaz
  -- (današnji datum) popunjava server.
  input               jsonb not null default '{}'::jsonb,

  step_order          integer not null,
  enabled             boolean not null default true,
  created_at          timestamptz not null default now(),

  unique (organization_id, id),
  constraint dashboard_cards_title_bilingual check (title ? 'sr' and title ? 'en'),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete set null
);

create index dashboard_cards_visible
  on public.dashboard_cards (organization_id, step_order) where enabled;

alter table public.dashboard_cards enable row level security;
alter table public.dashboard_cards force row level security;
grant select, insert, update, delete on public.dashboard_cards to authenticated;

-- Klijent VIDI svoje kartice; menja ih samo Delta Pro kroz administrativni
-- pristup. Raspored početne je deo usluge, ne podešavanje koje klijent sam
-- prepravlja dok mu se ne dopadne.
create policy dashboard_cards_select on public.dashboard_cards
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy dashboard_cards_insert on public.dashboard_cards
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.is_staff()
  );

create policy dashboard_cards_update on public.dashboard_cards
  for update to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff())
  with check (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());

create policy dashboard_cards_delete on public.dashboard_cards
  for delete to authenticated
  using (organization_id in (select unnest(app.administrable_org_ids())) and app.is_staff());

-- ---------------------------------------------------------------------------
-- Kartice koje korisnik sme da vidi
-- ---------------------------------------------------------------------------
--
-- Permisija se ne čuva na kartici nego se uzima iz definicije alata. Tako
-- pogrešan unos u konfiguraciji ne može da spusti prag — isto pravilo koje
-- runner primenjuje pri svakom pozivu.

create or replace function public.dashboard_cards_for_user(p_organization_id uuid)
returns table (
  card_id         uuid,
  ai_tool_key     text,
  integration_id  uuid,
  title           jsonb,
  format          text,
  value_field     text,
  compare_field   text,
  higher_is_better boolean,
  input           jsonb,
  step_order      integer,
  classification  text,
  connector_type  text,
  capability_key  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.ai_tool_key, c.integration_id, c.title, c.format::text,
    c.value_field, c.compare_field, c.higher_is_better, c.input, c.step_order,
    t.classification::text, i.connector_type_key, t.capability_key
  from public.dashboard_cards c
  join public.ai_tools t on t.key = c.ai_tool_key
  left join public.integrations i
    on i.organization_id = c.organization_id and i.id = c.integration_id
  where c.organization_id = p_organization_id
    and c.enabled
    and c.organization_id = any (app.accessible_org_ids())
    -- Permisija iz DEFINICIJE alata, ne iz konfiguracije kartice.
    and app.has_permission(c.organization_id, t.required_permission)
    -- Alat mora biti uključen za organizaciju; kartica sama po sebi ne otvara pristup.
    and exists (
      select 1 from public.organization_ai_tools o
      where o.organization_id = c.organization_id
        and o.ai_tool_key = c.ai_tool_key
        and o.enabled
    )
  order by c.step_order;
$$;

grant execute on function public.dashboard_cards_for_user(uuid) to authenticated;
