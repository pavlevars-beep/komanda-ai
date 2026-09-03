-- Sistemske poruke rolama.
--
-- `send_org_message` je SECURITY DEFINER i zaobilazi RLS — jedina zaštita je
-- provera prava unutar same funkcije. Zato se ovde ne testira „da li poruka
-- stiže" nego „ko sme da je pošalje i kome".

\echo ''
\echo '=== 60 — Sistemske poruke ==='

-- ---------------------------------------------------------------------------
-- Vlasnik klijenta sme; poruka stiže samo traženim rolama
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- Jelena, client_owner

select testkit.assert_equals(
  public.send_org_message(
    '00000000-0000-0000-0000-00000000d002',
    array['sales'],
    'Sastanak u 9',
    'Molimo pripremite pregled naplate.'
  ),
  1,
  'poruka za rolu sales stiže tačno jednom primaocu'
);
rollback;

-- Opozvano članstvo se ponaša kao da ga nema — Milan je `employee`, ali
-- `revoked`. Poruka svim zaposlenima ne sme da stigne nikome.
begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');

select testkit.assert_equals(
  public.send_org_message(
    '00000000-0000-0000-0000-00000000d002',
    array['employee'],
    'Obaveštenje',
    null
  ),
  0,
  'opozvano članstvo ne prima poruke'
);
rollback;

-- ---------------------------------------------------------------------------
-- Primaoci se ne mogu proširiti van organizacije
--
-- Ovo je najozbiljniji rizik ove funkcije: ona upisuje redove tuđim
-- korisnicima. Da razrešavanje primalaca nije vezano za organizaciju iz
-- argumenta, poruka bi mogla da završi kod klijenta koji sa pošiljaocem nema
-- nikakve veze.
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- samo Distribucija

select testkit.assert_raises(
  $q$select public.send_org_message(
       '00000000-0000-0000-0000-00000000d003',
       array['client_owner'],
       'Podmetnuto',
       null
     )$q$,
  '42501',
  'poruka se ne može poslati u organizaciju kojoj pošiljalac nema pristup'
);
rollback;

-- ---------------------------------------------------------------------------
-- Bez prava `manage_alerts` nema slanja
--
-- Petar je `sales` — vidi podatke, ali ne upravlja upozorenjima. Bez ove
-- provere bi svaki zaposleni mogao da pošalje poruku celoj upravi.
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b2');  -- Petar, sales

select testkit.assert_raises(
  $q$select public.send_org_message(
       '00000000-0000-0000-0000-00000000d002',
       array['client_owner'],
       'Bez prava',
       null
     )$q$,
  '42501',
  'rola bez manage_alerts ne može da šalje poruke'
);
rollback;

-- ---------------------------------------------------------------------------
-- Prazan naslov i prazan spisak rola se odbijaju
--
-- Poruka bez naslova je red u bazi koji na ekranu izgleda kao kvar, a poruka
-- bez rola tiho ne stiže nikome — i pošiljalac misli da jeste.
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');

select testkit.assert_raises(
  $q$select public.send_org_message(
       '00000000-0000-0000-0000-00000000d002', array['sales'], '   ', null)$q$,
  '22023',
  'poruka bez naslova se odbija'
);

select testkit.assert_raises(
  $q$select public.send_org_message(
       '00000000-0000-0000-0000-00000000d002', array[]::text[], 'Naslov', null)$q$,
  '22023',
  'poruka bez ijedne role se odbija'
);
rollback;

-- ---------------------------------------------------------------------------
-- Primalac vidi svoju poruku, kolega iz druge organizacije ne
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');
select public.send_org_message(
  '00000000-0000-0000-0000-00000000d002', array['sales'], 'Za prodaju', 'telo');

select testkit.login_as('00000000-0000-0000-0000-0000000000b2');  -- Petar, primalac
select testkit.assert(
  (select count(*) from public.notifications where title = 'Za prodaju') = 1,
  'primalac vidi poruku koja mu je poslata'
);

select testkit.login_as('00000000-0000-0000-0000-0000000000c1');  -- Hotel Grupa
select testkit.assert(
  (select count(*) from public.notifications where title = 'Za prodaju') = 0,
  'korisnik druge organizacije ne vidi tuđu poruku'
);
rollback;

\echo '=== 60 (poruke) — prošlo ==='
