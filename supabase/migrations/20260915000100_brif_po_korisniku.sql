-- description: Lični izbor odeljaka jutarnjeg brifa.
--
-- Redosled po roli je dobra POLAZNA tačka, ne konačna: nabavka u jednoj firmi
-- prvo gleda zalihe, u drugoj obaveze. Pogađanje po roli to ne može da zna, a
-- korisnik zna.
--
-- PRILAGOĐAVANJE NIJE PRISTUP. Skriven odeljak je izbor prikaza; odeljak koji
-- korisnik ne sme da vidi uklanjaju prava i RLS, uzvodno. Zato ova tabela ne
-- može ništa da OTKRIJE — samo da preuredi ili skrati ono što je već dozvoljeno.
--
-- Odeljak „zahteva pažnju" se namerno ne podešava. On je razlog zbog kojeg brif
-- postoji; mogućnost da se ugasi bila bi mogućnost da se proizvod isključi a da
-- i dalje izgleda kao da radi.

create table public.brief_preferences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Redosled koji je korisnik postavio. Sme da bude nepotpun: odeljak koji nije
  -- na spisku ide na kraj, ne ispada. Kada se sutra doda nov odeljak, korisnik
  -- sa zapamćenim izborom mora da ga vidi — inače bi zauvek bio nevidljiv baš
  -- onima koji proizvod najduže koriste.
  section_order   text[] not null default '{}',

  -- Odeljci koje je korisnik sklonio sa svog brifa.
  hidden_sections text[] not null default '{}',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, id),
  -- Jedan izbor po korisniku i organizaciji. Isti čovek u dve firme gleda
  -- različite podatke i s pravom ih redom postavlja različito.
  unique (organization_id, user_id),

  constraint brief_preferences_sections_known check (
    section_order <@ array['sales', 'receivables', 'debtors', 'payables', 'stock']::text[]
    and hidden_sections <@ array['sales', 'receivables', 'debtors', 'payables', 'stock']::text[]
  )
);

alter table public.brief_preferences enable row level security;
alter table public.brief_preferences force row level security;
grant select, insert, update, delete on public.brief_preferences to authenticated;

/*
 * Lično podešavanje: SVOJ red, i ništa drugo.
 *
 * Ovde se ne primenjuje uobičajeno „svi u organizaciji vide" — tuđi izbor
 * prikaza nije podatak koji iko treba da čita, pa ni vlasnik klijenta ni Delta
 * Pro osoblje. Sužavanje na sopstveni red ne košta ništa, a uklanja celu jednu
 * vrstu pitanja o privatnosti.
 */
create policy brief_preferences_select on public.brief_preferences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  );

create policy brief_preferences_insert on public.brief_preferences
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  );

create policy brief_preferences_update on public.brief_preferences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  )
  with check (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  );

create policy brief_preferences_delete on public.brief_preferences
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select unnest(app.accessible_org_ids()))
  );

create trigger brief_preferences_touch
  before update on public.brief_preferences
  for each row execute function app.touch_updated_at();
