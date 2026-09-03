-- description: Beleške u radnom prostoru klijenta.
--
-- Najjednostavnija tabela u sistemu, ali sa istim pravilima kao i sve ostale:
-- pripada organizaciji, RLS je uključen i primoran, i vidljivost se izvodi iz
-- `app.accessible_org_ids()` a ne iz identifikatora koji stigne iz zahteva.
--
-- Beleška je timska, ne lična. Zato je čita svako ko ima pristup organizaciji,
-- a briše je samo autor: tuđi zapis nije nečije da ga ukloni, a beleška koju
-- niko osim autora ne vidi ne bi ni imala svrhu u zajedničkom radnom prostoru.

create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Autor se čuva radi prikaza i radi prava na brisanje. `set null` pri
  -- brisanju naloga: beleška preživljava odlazak čoveka iz firme.
  --
  -- Ključ pokazuje na `user_profiles`, ne na `auth.users`, iako je red isti.
  -- Razlog je praktičan: PostgREST ume da uz belešku dovuče ime autora samo
  -- kada između tabela postoji strani ključ, a `auth` šema nije izložena.
  -- Brisanje naloga i dalje stiže dovde — profil se briše kaskadno, pa se
  -- ovde autor postavlja na null.
  author_id       uuid references public.user_profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now(),

  constraint notes_body_not_blank check (length(btrim(body)) > 0),
  -- Gornja granica postoji da beleška ne postane skladište dokumenata.
  constraint notes_body_length check (length(body) <= 2000)
);

create index notes_by_org on public.notes (organization_id, created_at desc);

alter table public.notes enable row level security;
alter table public.notes force row level security;
grant select, insert, delete on public.notes to authenticated;

-- Izmena se namerno NE dozvoljava. Beleška sa vremenom nastanka koju je neko
-- u međuvremenu prepravio je gora od beleške koje nema — čitalac joj veruje
-- kao zapisu iz tog trenutka.
revoke update on public.notes from authenticated, anon;

create policy notes_select on public.notes
  for select to authenticated
  using (organization_id in (select unnest(app.accessible_org_ids())));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (
    organization_id in (select unnest(app.accessible_org_ids()))
    -- Autor je uvek onaj ko upisuje. Bez ovoga bi se beleška mogla potpisati
    -- tuđim imenom, a potpis je jedino po čemu se zna ko je šta zapisao.
    and author_id = (select auth.uid())
  );

create policy notes_delete on public.notes
  for delete to authenticated
  using (
    organization_id in (select unnest(app.accessible_org_ids()))
    and author_id = (select auth.uid())
  );
