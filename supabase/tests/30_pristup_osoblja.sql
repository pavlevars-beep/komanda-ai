-- Pristup Delta Pro osoblja podacima klijenta.
--
-- Ovo je centralno bezbednosno obećanje proizvoda: konfiguracija i poslovni
-- podaci su dva različita prava, i nijedan Delta Pro nalog — ni Super Admin —
-- ne dolazi do poslovnih podataka bez zabeležene, vremenski ograničene sesije.

\echo ''
\echo '=== 30 — Pristup Delta Pro osoblja ==='

-- ---------------------------------------------------------------------------
-- Super Admin: vidi konfiguraciju svih, ali NE i poslovne podatke
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a1');  -- Ana, Super Admin

select testkit.assert_equals(
  (select count(*) from public.organizations)::integer, 3,
  'Super Admin vidi sve tri organizacije'
);
select testkit.assert(
  (select count(*) from public.integrations) >= 3,
  'Super Admin vidi konfiguraciju integracija svih klijenata'
);

-- A ovo je suština: bez aktivne sesije nema poslovnih podataka.
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'Super Admin BEZ sesije pristupa ne vidi nijedno upozorenje klijenta'
);
select testkit.assert_equals(
  (select count(*) from public.approvals)::integer, 0,
  'Super Admin BEZ sesije pristupa ne vidi nijedno odobrenje klijenta'
);
select testkit.assert_equals(
  (select cardinality(app.accessible_org_ids()))::integer, 0,
  'accessible_org_ids je prazan za osoblje bez sesije'
);
select testkit.assert_equals(
  (select cardinality(app.administrable_org_ids()))::integer, 3,
  'administrable_org_ids pokriva sve organizacije za Super Admina'
);
rollback;

-- ---------------------------------------------------------------------------
-- Konsultant: samo dodeljeni klijent
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000a2');  -- Marko, dodeljen Distribuciji

select testkit.assert_equals(
  (select cardinality(app.administrable_org_ids()))::integer, 1,
  'konsultant administrira tačno jednu, dodeljenu organizaciju'
);
select testkit.assert_equals(
  (select count(*) from public.integrations
   where organization_id = '00000000-0000-0000-0000-00000000d003')::integer, 0,
  'konsultant ne vidi ni konfiguraciju nedodeljenog klijenta'
);
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'konsultant bez sesije ne vidi poslovne podatke ni dodeljenog klijenta'
);

-- Pokretanje sesije nad organizacijom na koju NIJE dodeljen mora da padne.
select testkit.assert_denied(
  $q$insert into public.impersonation_sessions
       (staff_user_id, organization_id, reason, scope, expires_at)
     values ('00000000-0000-0000-0000-0000000000a2',
             '00000000-0000-0000-0000-00000000d003',
             'pokusaj pristupa nedodeljenom klijentu', 'read_only', now() + interval '30 minutes')$q$,
  'konsultant ne može da pokrene sesiju nad nedodeljenim klijentom'
);

-- Sesija u tuđe ime mora da padne.
select testkit.assert_denied(
  $q$insert into public.impersonation_sessions
       (staff_user_id, organization_id, reason, scope, expires_at)
     values ('00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-00000000d002',
             'pokusaj pokretanja sesije u tudje ime', 'read_only', now() + interval '30 minutes')$q$,
  'sesija se ne može pokrenuti u ime drugog zaposlenog'
);

-- Trajanje preko tvrde granice mora da padne.
select testkit.assert_denied(
  $q$insert into public.impersonation_sessions
       (staff_user_id, organization_id, reason, scope, expires_at)
     values ('00000000-0000-0000-0000-0000000000a2',
             '00000000-0000-0000-0000-00000000d002',
             'sesija duza od dozvoljenog trajanja', 'read_only', now() + interval '30 days')$q$,
  'sesija ne može da traje duže od tvrde granice'
);

-- A ispravno pokretanje prolazi i ODMAH otvara pristup podacima.
insert into public.impersonation_sessions
  (staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'dijagnostika prekinute veze ka kontakt formi', 'read_only', now() + interval '30 minutes');

select testkit.assert_equals(
  (select cardinality(app.accessible_org_ids()))::integer, 1,
  'aktivna sesija otvara pristup tačno jednoj organizaciji'
);
select testkit.assert(
  (select count(*) from public.alerts) >= 3,
  'konsultant u aktivnoj sesiji vidi upozorenja klijenta'
);
select testkit.assert_equals(
  (select count(*) from public.alerts
   where organization_id = '00000000-0000-0000-0000-00000000d003')::integer, 0,
  'sesija otvara SAMO tu organizaciju, ne i ostale'
);
rollback;

-- ---------------------------------------------------------------------------
-- Istekla sesija se ponaša kao da je nema
-- ---------------------------------------------------------------------------

begin;
-- Ubacujemo isteklu sesiju kao superkorisnik, jer politika s razlogom
-- ne dozvoljava kreiranje sesije koja je već istekla.
insert into public.impersonation_sessions
  (id, staff_user_id, organization_id, reason, scope, started_at, expires_at)
values
  ('00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'istekla sesija za potrebe testa', 'read_only',
   now() - interval '3 hours', now() - interval '2 hours');

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');
select testkit.assert_equals(
  (select cardinality(app.accessible_org_ids()))::integer, 0,
  'istekla sesija ne daje pristup'
);
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'nakon isteka sesije poslovni podaci ponovo nisu vidljivi'
);
rollback;

-- ---------------------------------------------------------------------------
-- Klijent vidi sesiju i sme da je prekine
-- ---------------------------------------------------------------------------

begin;
insert into public.impersonation_sessions
  (id, staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-00000000f002',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'dijagnostika sinhronizacije po prijavi klijenta', 'read_only',
   now() + interval '60 minutes');

select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- Jelena, vlasnik klijenta

select testkit.assert_equals(
  (select count(*) from public.impersonation_sessions
   where ended_at is null and expires_at > now())::integer, 1,
  'klijent vidi da Delta Pro ima otvoren pristup'
);

update public.impersonation_sessions
set ended_at = now(), ended_by = '00000000-0000-0000-0000-0000000000b1'
where id = '00000000-0000-0000-0000-00000000f002';

select testkit.assert_equals(
  (select count(*) from public.impersonation_sessions
   where id = '00000000-0000-0000-0000-00000000f002' and ended_at is not null)::integer, 1,
  'klijent je prekinuo sesiju'
);

-- Nakon prekida konsultant gubi pristup istog trenutka.
select testkit.login_as('00000000-0000-0000-0000-0000000000a2');
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'prekinuta sesija odmah zatvara pristup podacima'
);
rollback;

-- ---------------------------------------------------------------------------
-- Sesija se ne može produžiti niti preinačiti
-- ---------------------------------------------------------------------------

begin;
insert into public.impersonation_sessions
  (id, staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-00000000f003',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'sesija za proveru nepromenljivosti polja', 'read_only',
   now() + interval '15 minutes');

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');

select testkit.assert_denied(
  $q$update public.impersonation_sessions
       set expires_at = now() + interval '7 hours'
     where id = '00000000-0000-0000-0000-00000000f003'$q$,
  'sesija se ne može produžiti izmenom'
);
select testkit.assert_denied(
  $q$update public.impersonation_sessions
       set scope = 'full'
     where id = '00000000-0000-0000-0000-00000000f003'$q$,
  'opseg sesije se ne može proširiti nakon pokretanja'
);
select testkit.assert_denied(
  $q$update public.impersonation_sessions
       set reason = 'izmenjen razlog'
     where id = '00000000-0000-0000-0000-00000000f003'$q$,
  'razlog sesije se ne može naknadno prepraviti'
);
rollback;

\echo '=== 30 — prošlo ==='
