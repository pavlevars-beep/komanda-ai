-- description: Prijem podataka poštom — namenska adresa i dnevnik dolazaka.
--
-- Pošta je jedini put koji potpuno izbacuje čoveka iz svakodnevnog kruga:
-- skoro svaki ERP ume da zakaže izveštaj i pošalje ga mejlom, podesi se jednom,
-- ništa se ne instalira i ništa ne mora da bude ulogovano.
--
-- ADRESA NIJE LOZINKA. Token u adresi stoji u podešavanjima tuđeg ERP-a,
-- prolazi kroz njihove logove i kroz svaki mejl server na putu. Zato adresa
-- kaže samo KOJI izvor se puni; da li se sme puniti odlučuju spisak dozvoljenih
-- pošiljalaca i provera autentičnosti (SPF/DKIM).

create table public.mail_inboxes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  integration_id   uuid not null,
  kind             text not null,

  -- 128 bita, heksadecimalno. Jedinstven u celoj bazi jer JE ključ rutiranja:
  -- poruka stiže samo sa adresom, bez ikakvog drugog konteksta.
  token            char(32) not null unique,

  /*
   * Adrese (`erp@firma.rs`) ili domeni (`@firma.rs`).
   *
   * Prazan spisak ne propušta NIKOGA. Podrazumevano „primaj od svih" bi značilo
   * da svako ko sazna adresu upisuje brojeve u tuđu tablu — a adresa se ne
   * čuva kao tajna.
   */
  allowed_senders  text[] not null default '{}',

  -- Prijem je isključen dok se spisak pošiljalaca ne popuni. Uključena adresa
  -- bez ijednog dozvoljenog pošiljaoca ne bi primila ništa, ali bi u konzoli
  -- izgledala kao da radi.
  enabled          boolean not null default false,

  max_bytes        integer not null default 26214400,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.user_profiles(id) on delete set null,

  unique (organization_id, id),
  -- Jedna adresa po vrsti podatka i integraciji. Jedna adresa = jedna vrsta je
  -- razlog zbog kojeg dve tabele u istoj poruci smeju da se odbiju umesto da se
  -- pogađa koja je koja.
  unique (integration_id, kind),

  constraint mail_inboxes_kind_known
    check (kind in ('sales', 'receivables', 'payables', 'stock')),
  constraint mail_inboxes_token_shape check (token ~ '^[0-9a-f]{32}$'),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

alter table public.mail_inboxes enable row level security;
alter table public.mail_inboxes force row level security;
grant select, insert, update, delete on public.mail_inboxes to authenticated;

create policy mail_inboxes_select on public.mail_inboxes
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

create policy mail_inboxes_insert on public.mail_inboxes
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy mail_inboxes_update on public.mail_inboxes
  for update to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  )
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create policy mail_inboxes_delete on public.mail_inboxes
  for delete to authenticated
  using (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );

create trigger mail_inboxes_touch
  before update on public.mail_inboxes
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Dnevnik dolazaka
-- ---------------------------------------------------------------------------
--
-- Zapisuje se SVAKA poruka, i primljena i odbijena, sa razlogom.
--
-- Bez ovoga odbijena poruka nestaje bez traga: klijent tvrdi da je poslao,
-- sistem tvrdi da nije stiglo, i niko ne može da proveri ko je u pravu. Razlog
-- odbijanja je jedini podatak koji taj razgovor zatvara za minut.

create table public.mail_deliveries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  integration_id   uuid not null,
  mail_inbox_id    uuid,
  kind             text,

  sender           text,
  subject          text,
  -- Nazivi priloga, radi objašnjenja zašto je poruka odbijena.
  attachments      text[] not null default '{}',

  accepted         boolean not null,
  -- Kratka oznaka razloga; prevodi se u UI, ne čuva se prevedena.
  reason           text,
  detail           text,

  -- Skup koji je iz ove poruke nastao, kada je poruka primljena.
  dataset_id       uuid,

  received_at      timestamptz not null default now(),

  unique (organization_id, id),
  foreign key (organization_id, integration_id)
    references public.integrations (organization_id, id) on delete cascade
);

create index mail_deliveries_recent
  on public.mail_deliveries (organization_id, integration_id, received_at desc);

alter table public.mail_deliveries enable row level security;
alter table public.mail_deliveries force row level security;
grant select, insert on public.mail_deliveries to authenticated;

-- Klijent VIDI šta je stiglo i šta je odbijeno. To je poreklo njegovih brojeva
-- i jedini način da sam proveri da li njegov ERP zaista šalje.
create policy mail_deliveries_select on public.mail_deliveries
  for select to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    or organization_id in (select unnest(app.administrable_org_ids()))
  );

-- Upisuje pozadinski prijem servisnom rolom, koja zaobilazi RLS. Politika za
-- korisnika postoji da tabela ne bi ostala bez ijedne — i namerno je uska.
create policy mail_deliveries_insert on public.mail_deliveries
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.administrable_org_ids()))
    and app.has_permission(organization_id, 'manage_integrations')
  );
