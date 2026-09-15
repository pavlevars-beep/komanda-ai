-- Lični izbor odeljaka brifa.
--
-- Ovo je PRVA politika u projektu koja sužava na sopstveni red, umesto na
-- organizaciju. Meta-testovi proveravaju da politika postoji i da joj je oblik
-- ispravan — ne i da radi ono što treba. Zato ovde stoji ponašanje.

\echo ''
\echo '=== 70 — Lični brif ==='

-- ---------------------------------------------------------------------------
-- Svoj red se upisuje i čita
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- Jelena

insert into public.brief_preferences (organization_id, user_id, section_order, hidden_sections)
values (
  '00000000-0000-0000-0000-00000000d002',
  '00000000-0000-0000-0000-0000000000b1',
  array['stock', 'sales'],
  array['payables']
);

select testkit.assert_equals(
  (select count(*) from public.brief_preferences)::integer, 1,
  'korisnik vidi svoj izbor'
);
rollback;

-- ---------------------------------------------------------------------------
-- TUĐI izbor se ne vidi ni unutar iste organizacije
-- ---------------------------------------------------------------------------
--
-- Tuđi izbor prikaza nije podatak koji iko treba da čita. Uobičajeno „svi u
-- organizaciji vide" ovde bi bilo šire nego što treba, bez ijedne koristi.

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');
insert into public.brief_preferences (organization_id, user_id, section_order)
values (
  '00000000-0000-0000-0000-00000000d002',
  '00000000-0000-0000-0000-0000000000b1',
  array['stock']
);

-- Petar je u ISTOJ organizaciji.
select testkit.login_as('00000000-0000-0000-0000-0000000000b2');
select testkit.assert_equals(
  (select count(*) from public.brief_preferences)::integer, 0,
  'kolega iz iste firme ne vidi tuđi izbor'
);
rollback;

-- ---------------------------------------------------------------------------
-- Ne može se upisati izbor u tuđe ime
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b2');  -- Petar

select testkit.assert_raises(
  $$insert into public.brief_preferences (organization_id, user_id, section_order)
    values ('00000000-0000-0000-0000-00000000d002',
            '00000000-0000-0000-0000-0000000000b1',
            array['stock'])$$,
  '42501',
  'upis u tuđe ime je odbijen'
);
rollback;

-- ---------------------------------------------------------------------------
-- Izbor se ne može premestiti u tuđu organizaciju
-- ---------------------------------------------------------------------------
--
-- WITH CHECK na UPDATE: bez njega bi se sopstveni red mogao prepisati na
-- organizaciju kojoj korisnik nema pristup i tako iznositi podatke iz nje.

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');
insert into public.brief_preferences (organization_id, user_id, section_order)
values (
  '00000000-0000-0000-0000-00000000d002',
  '00000000-0000-0000-0000-0000000000b1',
  array['stock']
);

-- WITH CHECK ODBIJA upis, ne propušta ga u prazno. Razlika je bitna: tiho
-- nepogađanje nijednog reda bi aplikacija prijavila kao uspeh.
select testkit.assert_raises(
  $$update public.brief_preferences
    set organization_id = '00000000-0000-0000-0000-00000000d003'
    where user_id = '00000000-0000-0000-0000-0000000000b1'$$,
  '42501',
  'red se ne može premestiti u organizaciju bez pristupa'
);
rollback;

-- ---------------------------------------------------------------------------
-- Nepoznat odeljak se ne upisuje
-- ---------------------------------------------------------------------------
--
-- Provera stoji u BAZI, ne samo u kodu: naziv odeljka koji aplikacija ne
-- poznaje bi tiho nestao pri prikazu, a korisnik bi mislio da je podešen.

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');

select testkit.assert_raises(
  $$insert into public.brief_preferences (organization_id, user_id, section_order)
    values ('00000000-0000-0000-0000-00000000d002',
            '00000000-0000-0000-0000-0000000000b1',
            array['plate'])$$,
  '23514',
  'nepoznat odeljak obara ograničenje'
);
rollback;

\echo '=== 70 (brif) — prošlo ==='
