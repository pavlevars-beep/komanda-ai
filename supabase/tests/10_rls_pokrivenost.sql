-- Meta-testovi: sprečavaju da nova tabela uđe u šemu bez izolacije.
--
-- Ovi testovi ne proveravaju podatke nego ŠEMU. Zbog njih programer koji
-- sutra doda tabelu ne može da zaboravi RLS — build pada pre code review-a.

\echo ''
\echo '=== 10 — Pokrivenost RLS-a ==='

do $$
declare
  v_missing text;
  v_count integer;
begin
  -- 1. Svaka tabela sa organization_id mora imati ENABLE i FORCE.
  select string_agg(table_name, ', '), count(*)
  into v_missing, v_count
  from app.tables_missing_rls();

  perform testkit.assert(
    v_count = 0,
    coalesce('tabele bez RLS-a: ' || v_missing, 'svaka tabela sa organization_id ima RLS i FORCE')
  );

  -- 2. Tabela sa uključenim RLS-om a bez politika je isto greška — samo tiša.
  select string_agg(table_name, ', '), count(*)
  into v_missing, v_count
  from app.tables_without_policies();

  perform testkit.assert(
    v_count = 0,
    coalesce('tabele sa RLS-om bez politika: ' || v_missing, 'nijedna tabela nije ostala bez politike')
  );

  -- 3. UPDATE bez WITH CHECK dozvoljava premeštanje reda u tuđu organizaciju.
  select string_agg(table_name || '.' || policy_name, ', '), count(*)
  into v_missing, v_count
  from app.update_policies_without_check();

  perform testkit.assert(
    v_count = 0,
    coalesce('UPDATE politike bez WITH CHECK: ' || v_missing, 'svaka UPDATE politika ima WITH CHECK')
  );

  -- 4. Oblik poziva pomoćnih funkcija mora da bude onaj koji skalira.
  select string_agg(table_name || '.' || policy_name, ', '), count(*)
  into v_missing, v_count
  from app.policies_with_slow_shape();

  perform testkit.assert(
    v_count = 0,
    coalesce('politike sa sporim oblikom: ' || v_missing, 'sve politike koriste podupit umesto poziva po redu')
  );
end
$$;

-- 5. anon rola ne sme da ima ijedno pravo nad aplikativnim tabelama.
do $$
declare
  v_grants text;
  v_count integer;
begin
  select string_agg(distinct table_name, ', '), count(distinct table_name)
  into v_grants, v_count
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';

  perform testkit.assert(
    v_count = 0,
    coalesce('anon ima prava nad: ' || v_grants, 'anon rola nema nikakva prava nad tabelama')
  );
end
$$;

-- 6. Tabela sa referencama na tajne ne sme da bude dostupna roli authenticated.
do $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from information_schema.role_table_grants
  where grantee in ('authenticated', 'anon')
    and table_schema = 'public'
    and table_name = 'integration_credentials';

  perform testkit.assert(
    v_count = 0,
    'integration_credentials je nedostupna rolama iz browsera'
  );
end
$$;

-- 7. Revizioni trag se ne sme menjati ni brisati — ni servisnom rolom.
do $$
declare
  v_bad text;
begin
  select string_agg(grantee || ':' || privilege_type, ', ')
  into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'audit_logs'
    and privilege_type in ('UPDATE', 'DELETE')
    and grantee in ('anon', 'authenticated', 'service_role');

  perform testkit.assert(
    v_bad is null,
    coalesce('revizija je izmenjiva: ' || v_bad, 'revizioni trag je samo za dopisivanje')
  );
end
$$;

\echo '=== 10 — prošlo ==='

-- ---------------------------------------------------------------------------
-- Demo podaci ne mogu u produkcijsku bazu
-- ---------------------------------------------------------------------------

do $$
begin
  perform testkit.assert(
    app.is_development_database(),
    'razvojna baza je označena kao razvojna'
  );
end
$$;

-- Simulacija produkcije: skida se oznaka i proverava da upis demo podataka pada.
begin;
set local app.environment = 'production';

do $$
begin
  perform testkit.assert(
    not app.is_development_database(),
    'bez oznake se baza smatra produkcijskom'
  );

  begin
    insert into public.organizations (slug, legal_name, display_name, is_demo)
    values ('demo-u-produkciji', 'Demo d.o.o.', 'Demo u produkciji', true);
    raise exception 'PAO TEST: demo organizacija je upisana u produkcijsku bazu';
  exception when insufficient_privilege then
    raise notice '  ok — demo podaci se odbijaju u produkcijskoj bazi';
  end;

  -- Obična organizacija i dalje prolazi — zabrana pogađa samo demo.
  insert into public.organizations (slug, legal_name, display_name, is_demo)
  values ('stvarni-klijent', 'Stvarni Klijent d.o.o.', 'Stvarni Klijent', false);
  raise notice '  ok — obična organizacija prolazi i u produkcijskoj bazi';
end
$$;
rollback;
