-- description: Uvoz tabela — Excel i CSV kao izvor podataka.
--
-- Konektor koji čita iz otpremljene tabele je jedini put do stvarnih podataka
-- klijenta koji ne zavisi ni od koga: ne traži API, ne traži pristup bazi, ne
-- traži saglasnost dobavljača ERP-a. Firma izveze ono što ionako svakodnevno
-- izvozi, i alat radi.
--
-- Podaci se NORMALIZUJU pri uvozu, ne pri čitanju. Parsiranje tabele na svaki
-- poziv sposobnosti značilo bi da svaka kartica na tabli ponovo raspakuje ZIP
-- i tumači datume — a tabla poziva pet sposobnosti odjednom.

create type import_status as enum ('pending', 'ready', 'failed', 'superseded');

create table public.imported_datasets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null,

  -- Šta tabela sadrži: prodaju, potraživanja, obaveze ili zalihe.
  kind            text not null,
  status          import_status not null default 'pending',

  -- Putanja u privatnoj kofi. Original se ČUVA: kada se posle mesec dana
  -- ispostavi da je kolona pogrešno mapirana, bez originala se ne može ni
  -- proveriti ni ponoviti.
  file_path       text not null,
  file_name       text not null,
  file_size       bigint not null,

  -- Mapiranje po kojem je ovaj uvoz pročitan. Čuva se UZ SKUP, ne samo uz
  -- integraciju: kada se mapiranje kasnije promeni, mora da se zna po kojem
  -- je pravilu svaki red nastao.
  mapping         jsonb not null default '{}'::jsonb,

  row_count       integer not null default 0,
  problem_count   integer not null default 0,
  -- Prvih nekoliko grešaka, radi prikaza. Ceo spisak se ne čuva.
  problems        jsonb not null default '[]'::jsonb,

  -- Vreme na koje se PODACI odnose, po sopstvenoj proceni izvoza. Različito od
  -- vremena otpremanja: izvoz od juče otpremljen danas nosi jučerašnje podatke.
  data_as_of      timestamptz,
  imported_at     timestamptz not null default now(),
  imported_by     uuid references public.user_profiles(id) on delete set null,

  unique (organization_id, id),
  constraint imported_datasets_kind_known
    check (kind in ('sales', 'receivables', 'payables', 'stock')),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

/*
 * Samo JEDAN spreman skup po vrsti i integraciji.
 *
 * Novi uvoz iste vrste zamenjuje prethodni, koji prelazi u `superseded`. Bez
 * toga bi se sabirali podaci iz dva izvoza istog perioda — a klijent koji
 * otpremi ispravljenu tabelu očekuje ispravku, ne udvostručene brojeve.
 */
create unique index imported_datasets_one_ready
  on public.imported_datasets (integration_id, kind)
  where status = 'ready';

create index imported_datasets_recent
  on public.imported_datasets (organization_id, imported_at desc);

alter table public.imported_datasets enable row level security;
alter table public.imported_datasets force row level security;
grant select, insert, update on public.imported_datasets to authenticated;

-- Klijent VIDI šta je uvezeno i kada — bez toga broj na tabli nema poreklo.
create policy imported_datasets_select on public.imported_datasets
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

-- Uvoz je podešavanje integracije, ne svakodnevni rad.
create policy imported_datasets_insert on public.imported_datasets
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy imported_datasets_update on public.imported_datasets
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

-- ---------------------------------------------------------------------------
-- Normalizovani redovi
-- ---------------------------------------------------------------------------
--
-- Tipizovane kolone, ne jsonb. Zbir i grupisanje po datumu rade u bazi, a nad
-- jsonb-om bi svaki upit morao da izvlači i pretvara vrednost pri svakom redu.
-- To je razlika između upita koji traje milisekunde i upita koji traje sekunde
-- na sto hiljada redova.

create table public.imported_sales (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  dataset_id      uuid not null,
  doc_date        date not null,
  amount          numeric(18, 2) not null,
  currency        char(3) not null default 'RSD',
  customer        text,
  product         text,
  category        text,

  foreign key (organization_id, dataset_id)
    references public.imported_datasets (organization_id, id) on delete cascade
);

create index imported_sales_by_date on public.imported_sales (dataset_id, doc_date);

create table public.imported_receivables (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  dataset_id      uuid not null,
  customer        text not null,
  amount          numeric(18, 2) not null,
  currency        char(3) not null default 'RSD',
  due_date        date not null,
  invoice_number  text,

  foreign key (organization_id, dataset_id)
    references public.imported_datasets (organization_id, id) on delete cascade
);

create index imported_receivables_by_due on public.imported_receivables (dataset_id, due_date);

create table public.imported_payables (
  id              bigint generated always as identity primary key,
  organization_id uuid not null,
  dataset_id      uuid not null,
  supplier        text not null,
  amount          numeric(18, 2) not null,
  currency        char(3) not null default 'RSD',
  due_date        date not null,

  foreign key (organization_id, dataset_id)
    references public.imported_datasets (organization_id, id) on delete cascade
);

create index imported_payables_by_due on public.imported_payables (dataset_id, due_date);

create table public.imported_stock (
  id                  bigint generated always as identity primary key,
  organization_id     uuid not null,
  dataset_id          uuid not null,
  item                text not null,
  on_hand             numeric(18, 3) not null,
  minimum             numeric(18, 3),
  average_daily_sales numeric(18, 3),
  lead_time_days      integer,

  foreign key (organization_id, dataset_id)
    references public.imported_datasets (organization_id, id) on delete cascade
);

create index imported_stock_by_item on public.imported_stock (dataset_id, item);

-- Iste politike za sve četiri: čita se sa pristupom organizaciji, upisuje samo
-- kroz uvoz. Petlja umesto četiri prepisana bloka — jedno pravilo na jednom
-- mestu se ne može razići samo sa sobom.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'imported_sales', 'imported_receivables', 'imported_payables', 'imported_stock'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('grant select, insert, delete on public.%I to authenticated', v_table);

    execute format($p$
      create policy %1$I_select on public.%1$I
        for select to authenticated
        using (
          organization_id in (select unnest(app.accessible_org_ids()))
          or organization_id in (select unnest(app.administrable_org_ids()))
        )
    $p$, v_table);

    execute format($p$
      create policy %1$I_insert on public.%1$I
        for insert to authenticated
        with check (
          organization_id in (select unnest(app.administrable_org_ids()))
          and app.has_permission(organization_id, 'manage_integrations')
        )
    $p$, v_table);

    execute format($p$
      create policy %1$I_delete on public.%1$I
        for delete to authenticated
        using (
          organization_id in (select unnest(app.administrable_org_ids()))
          and app.has_permission(organization_id, 'manage_integrations')
        )
    $p$, v_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tip konektora
-- ---------------------------------------------------------------------------

insert into public.connector_types
  (key, name, category, availability, supported_auth, supports_agent, capability_manifest)
values (
  'file',
  '{"sr":"Excel / CSV","en":"Excel / CSV"}',
  'file',
  'ga',
  -- Fajl se otprema kroz konzolu; nema pristupnih podataka koji bi se čuvali.
  '{none}',
  false,
  '[{"key":"get_sales_summary","mode":"read"},
    {"key":"get_sales_daily","mode":"read"},
    {"key":"get_sales_history","mode":"read"},
    {"key":"get_receivables_aging","mode":"read"},
    {"key":"get_top_debtors","mode":"read"},
    {"key":"get_outstanding_invoices","mode":"read"},
    {"key":"get_payables","mode":"read"},
    {"key":"get_stock_status","mode":"read"},
    {"key":"get_inventory_alerts","mode":"read"}]'
)
on conflict (key) do update
set name = excluded.name,
    availability = excluded.availability,
    capability_manifest = excluded.capability_manifest;

-- ---------------------------------------------------------------------------
-- Privatna kofa za otpremljene tabele
-- ---------------------------------------------------------------------------
--
-- Za razliku od logotipa, ova kofa NIJE javna. U njoj su prodaja, kupci i
-- dugovanja — podaci zbog kojih ceo proizvod ima bezbednosne zahteve.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  -- 25 MB pokriva izvoz od sto hiljada redova sa rezervom.
  26214400,
  array[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'imports_read'
  ) then
    -- Čitanje samo za osoblje koje administrira organizaciju iz prvog segmenta
    -- putanje. Klijent vidi UVEZENE PODATKE, ne sam fajl.
    create policy imports_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'imports'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'imports_write'
  ) then
    create policy imports_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'imports'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'imports_delete'
  ) then
    create policy imports_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'imports'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;
end;
$$;
