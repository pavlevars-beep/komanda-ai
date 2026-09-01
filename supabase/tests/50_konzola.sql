-- Funkcije konzole poštuju iste granice kao i sve ostalo.
--
-- Agregatne funkcije su SECURITY DEFINER i zaobilaze RLS na tabelama koje
-- čitaju. Zato u njima stoji eksplicitan filter po app.administrable_org_ids()
-- — i zato ovaj test postoji: da se taj filter ne bi mogao tiho izgubiti.

\echo ''
\echo '=== 50 — Konzola ==='

-- ---------------------------------------------------------------------------
-- console_clients
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a1');  -- Ana, Super Admin
select testkit.assert_equals(
  (select count(*) from public.console_clients())::integer, 2,
  'Super Admin vidi obe klijentske organizacije'
);
select testkit.assert_equals(
  (select count(*) from public.console_clients()
   where display_name = 'Delta Pro')::integer, 0,
  'platformska organizacija se ne prikazuje kao klijent'
);

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');  -- Marko, konsultant
select testkit.assert_equals(
  (select count(*) from public.console_clients())::integer, 1,
  'konsultant vidi samo dodeljenog klijenta'
);
select testkit.assert_equals(
  (select organization_id from public.console_clients()),
  '00000000-0000-0000-0000-00000000d002'::uuid,
  'konsultant vidi tačno Demo Distribuciju'
);

select testkit.login_as('00000000-0000-0000-0000-0000000000b2');  -- Petar, prodaja
select testkit.assert_equals(
  (select count(*) from public.console_clients())::integer, 0,
  'klijentski korisnik bez administrativnih prava ne vidi listu klijenata'
);

select testkit.login_as('00000000-0000-0000-0000-0000000000f1');  -- bez članstva
select testkit.assert_equals(
  (select count(*) from public.console_clients())::integer, 0,
  'korisnik bez članstva ne vidi nijednog klijenta'
);
rollback;

-- Brojevi u agregatu moraju da budu tačni, ne samo prisutni.
begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a1');
select testkit.assert_equals(
  (select active_users from public.console_clients()
   where organization_id = '00000000-0000-0000-0000-00000000d002')::integer, 2,
  'broji se samo aktivno članstvo — opozvano se ne računa'
);
select testkit.assert_equals(
  (select integrations_attention from public.console_clients()
   where organization_id = '00000000-0000-0000-0000-00000000d002')::integer, 1,
  'integracija u stanju needs_attention se prepoznaje'
);
select testkit.assert_equals(
  (select onboarding_done || '/' || onboarding_total from public.console_clients()
   where organization_id = '00000000-0000-0000-0000-00000000d003'),
  '4/10',
  'napredak onboardinga se računa iz tabele koraka'
);
rollback;

-- ---------------------------------------------------------------------------
-- console_onboarding i console_org_members
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a2');  -- dodeljen samo Distribuciji

select testkit.assert_equals(
  (select count(*) from public.console_onboarding('00000000-0000-0000-0000-00000000d002'))::integer,
  10,
  'onboarding lista dodeljenog klijenta je dostupna'
);
select testkit.assert_equals(
  (select count(*) from public.console_onboarding('00000000-0000-0000-0000-00000000d003'))::integer,
  0,
  'onboarding lista nedodeljenog klijenta nije dostupna'
);
select testkit.assert_equals(
  (select count(*) from public.console_org_members('00000000-0000-0000-0000-00000000d003'))::integer,
  0,
  'korisnici nedodeljenog klijenta nisu dostupni'
);
select testkit.assert(
  (select count(*) from public.console_org_members('00000000-0000-0000-0000-00000000d002')) >= 3,
  'korisnici dodeljenog klijenta su dostupni'
);

-- Konsultant vidi korisnike kroz administrativni pristup, ali i dalje NEMA
-- poslovne podatke bez sesije.
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'pregled korisnika ne otvara pristup poslovnim podacima'
);
rollback;

-- ---------------------------------------------------------------------------
-- my_open_access_sessions
-- ---------------------------------------------------------------------------

begin;
insert into public.impersonation_sessions
  (staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'provera trake sa otvorenom sesijom u konzoli', 'read_only', now() + interval '30 minutes');

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');
select testkit.assert_equals(
  (select count(*) from public.my_open_access_sessions())::integer, 1,
  'konsultant vidi sopstvenu otvorenu sesiju'
);
select testkit.assert_equals(
  (select organization_name from public.my_open_access_sessions()),
  'Demo Distribucija',
  'sesija nosi naziv organizacije za prikaz u traci'
);

-- Tuđa sesija se ne prikazuje ni Super Adminu — traka pokazuje ono za šta
-- pozivalac odgovara, ne sve što se dešava u sistemu.
select testkit.login_as('00000000-0000-0000-0000-0000000000a1');
select testkit.assert_equals(
  (select count(*) from public.my_open_access_sessions())::integer, 0,
  'Super Admin ne vidi tuđu sesiju kao svoju'
);
rollback;

\echo '=== 50 — prošlo ==='

-- ---------------------------------------------------------------------------
-- Brendiranje
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a2');  -- dodeljen samo Distribuciji

-- Nad dodeljenim klijentom izmena prolazi.
update public.organization_branding
set workspace_name = 'Izmenjeno ime'
where organization_id = '00000000-0000-0000-0000-00000000d002';

select testkit.assert_equals(
  (select workspace_name from public.organization_branding
   where organization_id = '00000000-0000-0000-0000-00000000d002'),
  'Izmenjeno ime',
  'konsultant menja brendiranje dodeljenog klijenta'
);

-- Nad nedodeljenim ne prolazi, i to bez greške — red se prosto ne vidi.
update public.organization_branding
set workspace_name = 'Podmetnuto'
where organization_id = '00000000-0000-0000-0000-00000000d003';

select testkit.logout();
select testkit.assert_equals(
  (select workspace_name from public.organization_branding
   where organization_id = '00000000-0000-0000-0000-00000000d003'),
  'Demo Hotel Grupa',
  'brendiranje nedodeljenog klijenta ostaje netaknuto'
);
rollback;

-- Baza odbija boju koja nije heksadecimalni zapis, nezavisno od aplikacije.
begin;
select testkit.assert_denied(
  $q$update public.organization_branding
       set primary_color = 'plava'
     where organization_id = '00000000-0000-0000-0000-00000000d002'$q$,
  'baza odbija boju koja nije u obliku #RRGGBB'
);

-- Poruka dobrodošlice mora da postoji na oba jezika ili ni na jednom.
select testkit.assert_denied(
  $q$update public.organization_branding
       set welcome_message = '{"sr":"Samo srpski"}'::jsonb
     where organization_id = '00000000-0000-0000-0000-00000000d002'$q$,
  'poruka dobrodošlice ne sme da postoji samo na jednom jeziku'
);
rollback;

\echo '=== 50 (brendiranje) — prošlo ==='
