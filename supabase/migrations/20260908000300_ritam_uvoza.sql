-- description: Ritam uvoza i alarm na tišinu.
--
-- Najopasniji kvar nije pogrešan broj nego IZOSTANAK podatka. Kada tabela ne
-- stigne, sistem nastavlja da radi i prikazuje jučerašnje brojeve kao današnje.
-- Nema poruke o grešci jer greške nema — postoji samo tišina, a tišina se ne
-- primeti dok neko ne donese odluku na osnovu podatka od pre nedelju dana.
--
-- Zato se očekivanje zapisuje UNAPRED. Bez zapisanog „radnim danima do 08:00"
-- sistem nema prema čemu da izmeri tišinu i mora da je prećuti.

create table public.import_expectations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null,
  kind            text not null,

  -- ISO dani kada se podatak očekuje: ponedeljak 1 … nedelja 7.
  weekdays        smallint[] not null default '{1,2,3,4,5}',

  -- Lokalno vreme firme, ne UTC. Dogovor se vodi u vremenu koje klijent gleda
  -- na svom satu, a 08:00 u Beogradu nije isti trenutak leti i zimi.
  by_time         time not null default '08:00',
  time_zone       text not null default 'Europe/Belgrade',

  -- Koliko kašnjenja se toleriše pre oglašavanja. Bez tolerancije bi svaki
  -- izvoz koji krene u 08:00 a završi u 08:03 svakodnevno dizao alarm.
  grace_minutes   integer not null default 30,

  -- Rokovi pre ovog trenutka se ne broje: pre dogovora nije bilo šta da se
  -- prekrši, pa tek podešeno očekivanje ne sme odmah da prijavi mesec tišine.
  active_from     timestamptz not null default now(),

  -- Kolektivni odmor i praznici. Namerno ručno, a ne kalendar praznika: tuđi
  -- radni dani se ne pogađaju, a pogrešna pretpostavka ovde ili ućutka pravi
  -- alarm ili svakog 1. maja digne lažni.
  paused_until    timestamptz,

  enabled         boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.user_profiles(id) on delete set null,

  unique (organization_id, id),
  -- Jedan dogovor po vrsti podatka i integraciji. Dva bi značila dva različita
  -- odgovora na pitanje da li podatak kasni.
  unique (integration_id, kind),

  constraint import_expectations_kind_known
    check (kind in ('sales', 'receivables', 'payables', 'stock')),
  constraint import_expectations_weekdays_valid
    check (
      array_length(weekdays, 1) between 1 and 7
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
  constraint import_expectations_grace_sane
    check (grace_minutes between 0 and 1440),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

create index import_expectations_active
  on public.import_expectations (organization_id, integration_id)
  where enabled;

alter table public.import_expectations enable row level security;
alter table public.import_expectations force row level security;
grant select, insert, update, delete on public.import_expectations to authenticated;

-- Klijent VIDI dogovor. Bez toga traka „podatak nije stigao" nema objašnjenje,
-- a rukovodilac ne može da zna da li je izostanak kvar ili nedogovoreno.
create policy import_expectations_select on public.import_expectations
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy import_expectations_insert on public.import_expectations
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy import_expectations_update on public.import_expectations
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy import_expectations_delete on public.import_expectations
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create trigger import_expectations_touch
  before update on public.import_expectations
  for each row execute function app.touch_updated_at();
