-- Izolacija organizacija: korisnik jedne firme ne sme da vidi ništa od druge.
--
-- Test je GENERISAN nad svim tabelama koje nose organization_id. Zbog toga
-- nova tabela automatski ulazi u proveru, umesto da neko mora da se seti da
-- doda test.

\echo ''
\echo '=== 20 — Izolacija organizacija ==='

-- Prvo se uverimo da test uopšte ima šta da uhvati.
--
-- Test koji prolazi zato što u tuđoj organizaciji nema podataka je gori od
-- nikakvog testa — daje lažnu sigurnost. Zato tražimo da Hotel stvarno ima
-- redove u više tabela pre nego što proverimo da ih Distribucija ne vidi.
do $$
declare
  r record;
  v_rows bigint;
  v_tables_with_data integer := 0;
begin
  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped
      )
  loop
    execute format(
      'select count(*) from public.%I where organization_id = %L',
      r.t, '00000000-0000-0000-0000-00000000d003'
    ) into v_rows;
    if v_rows > 0 then
      v_tables_with_data := v_tables_with_data + 1;
    end if;
  end loop;

  perform testkit.assert(
    v_tables_with_data >= 5,
    format('Hotel ima podatke u %s tabela — test nije prazan', v_tables_with_data)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Vlasnik Demo Distribucije ne vidi nijedan red Demo Hotel Grupe
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- Jelena, Distribucija

do $$
declare
  r record;
  v_rows bigint;
  v_checked integer := 0;
begin
  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped
      )
    order by c.relname
  loop
    begin
      execute format(
        'select count(*) from public.%I where organization_id = %L',
        r.t, '00000000-0000-0000-0000-00000000d003'
      ) into v_rows;
    exception when insufficient_privilege then
      -- Tabela uopšte nije dostupna ovoj roli — još jača garancija od nula redova.
      v_rows := 0;
    end;

    if v_rows <> 0 then
      raise exception 'PAO TEST: % — korisnik Distribucije vidi % redova Hotela', r.t, v_rows;
    end if;
    v_checked := v_checked + 1;
  end loop;

  raise notice '  ok — nijedan red Hotela nije vidljiv (provereno tabela: %)', v_checked;
end
$$;

-- Ista provera u suprotnom smeru.
select testkit.login_as('00000000-0000-0000-0000-0000000000c1');  -- Nikola, Hotel

do $$
declare
  r record;
  v_rows bigint;
begin
  for r in
    select c.relname as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped
      )
  loop
    begin
      execute format(
        'select count(*) from public.%I where organization_id = %L',
        r.t, '00000000-0000-0000-0000-00000000d002'
      ) into v_rows;
    exception when insufficient_privilege then
      v_rows := 0;
    end;

    if v_rows <> 0 then
      raise exception 'PAO TEST: % — korisnik Hotela vidi % redova Distribucije', r.t, v_rows;
    end if;
  end loop;

  raise notice '  ok — nijedan red Distribucije nije vidljiv korisniku Hotela';
end
$$;

-- ---------------------------------------------------------------------------
-- Korisnik ipak vidi SVOJE podatke — inače bi test prolazio i da je sve slomljeno
-- ---------------------------------------------------------------------------

select testkit.login_as('00000000-0000-0000-0000-0000000000b1');
select testkit.assert(
  (select count(*) from public.alerts) >= 3,
  'vlasnik Distribucije vidi sopstvena upozorenja'
);
select testkit.assert(
  (select count(*) from public.integrations) >= 2,
  'vlasnik Distribucije vidi sopstvene integracije'
);
select testkit.assert_equals(
  (select count(*) from public.organizations)::integer, 1,
  'vlasnik Distribucije vidi tačno jednu organizaciju — svoju'
);

-- ---------------------------------------------------------------------------
-- Korisnik bez ijednog članstva ne vidi apsolutno ništa
-- ---------------------------------------------------------------------------

select testkit.login_as('00000000-0000-0000-0000-0000000000f1');  -- Stefan, bez članstva
select testkit.assert_equals(
  (select count(*) from public.organizations)::integer, 0,
  'korisnik bez članstva ne vidi nijednu organizaciju'
);
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'korisnik bez članstva ne vidi nijedno upozorenje'
);
select testkit.assert_equals(
  (select count(*) from public.integrations)::integer, 0,
  'korisnik bez članstva ne vidi nijednu integraciju'
);

-- ---------------------------------------------------------------------------
-- Opozvano članstvo se ponaša kao da ga nema
-- ---------------------------------------------------------------------------

select testkit.login_as('00000000-0000-0000-0000-0000000000b3');  -- Milan, opozvan
select testkit.assert_equals(
  (select count(*) from public.alerts)::integer, 0,
  'opozvano članstvo ne daje pristup podacima'
);
select testkit.assert_equals(
  (select count(*) from public.organizations)::integer, 0,
  'opozvano članstvo ne prikazuje ni samu organizaciju'
);

rollback;

\echo '=== 20 — prošlo ==='
