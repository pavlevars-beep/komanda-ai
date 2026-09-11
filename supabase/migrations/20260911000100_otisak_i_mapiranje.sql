-- description: Otisak sadržaja i zapamćeno mapiranje kolona.
--
-- Dve zaštite koje čuvaju istu stvar: da uvoz ne slaže o tome šta se desilo.
--
-- 1. ISTI FAJL NIJE NOV PODATAK. Bez otiska, ponovno slanje jučerašnje tabele
--    pomera vreme podatka i sve izgleda sveže, iako ništa nije stiglo. To je
--    tiho laganje i gore je od greške — greška se bar vidi.
--
-- 2. MAPIRANJE SE NE POGAĐA SVAKI PUT. Kolone se pamte uz integraciju, pa isti
--    izvoz svaki put daje isto čitanje. Ponovno pogađanje je način na koji
--    kolona sa obavezama počne da se čita kao potraživanja, a mesec dana niko
--    ne primeti.

alter table public.imported_datasets
  -- SHA-256 sadržaja fajla, heksadecimalno.
  add column content_hash char(64),
  -- Kada je ISTI sadržaj poslednji put ponovo poslat, i koliko puta ukupno.
  -- Pokušaj se ne briše: „klijent svaki dan šalje istu tabelu" je nalaz, ne
  -- šum, i objašnjava zašto alarm na tišinu i dalje stoji.
  add column last_seen_at timestamptz,
  add column seen_count integer not null default 1;

-- Traži se samo unutar jedne integracije i vrste, i to po pravilu nad aktivnim
-- skupom — zato indeks stoji nad tom trojkom, a ne nad samim otiskom.
create index imported_datasets_by_hash
  on public.imported_datasets (integration_id, kind, content_hash)
  where content_hash is not null;

-- ---------------------------------------------------------------------------
-- Zapamćeno mapiranje kolona
-- ---------------------------------------------------------------------------

create table public.import_mappings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null,
  kind            text not null,

  -- Polje u našem modelu → indeks kolone u tabeli klijenta.
  mapping         jsonb not null default '{}'::jsonb,

  /*
   * Zaglavlje po kojem je mapiranje nastalo.
   *
   * Indeks nije stabilan: ubačena kolona pomera sve posle sebe. Naziv jeste,
   * pa se zapamćeno mapiranje prevodi preko naziva na novo zaglavlje. Bez
   * sačuvanog zaglavlja taj prevod nema od čega da krene.
   */
  headers         text[] not null default '{}',

  confirmed_at    timestamptz not null default now(),
  confirmed_by    uuid references public.user_profiles(id) on delete set null,

  unique (organization_id, id),
  -- Jedno mapiranje po vrsti i integraciji: dva bi značila dva različita
  -- čitanja iste tabele.
  unique (integration_id, kind),

  constraint import_mappings_kind_known
    check (kind in ('sales', 'receivables', 'payables', 'stock')),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

alter table public.import_mappings enable row level security;
alter table public.import_mappings force row level security;
grant select, insert, update, delete on public.import_mappings to authenticated;

-- Klijent SME da vidi kako se njegova tabela čita. To je poreklo broja, ne
-- interna postavka.
create policy import_mappings_select on public.import_mappings
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy import_mappings_insert on public.import_mappings
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy import_mappings_update on public.import_mappings
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy import_mappings_delete on public.import_mappings
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );
