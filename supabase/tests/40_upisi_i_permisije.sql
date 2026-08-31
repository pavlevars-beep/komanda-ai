-- Zaštita upisa, nepromenljivost revizije i model permisija.

\echo ''
\echo '=== 40 — Upisi, revizija i permisije ==='

-- ---------------------------------------------------------------------------
-- Red se ne može premestiti u tuđu organizaciju
--
-- Ovo je propust koji nijedan SELECT test ne bi uhvatio: bez WITH CHECK na
-- UPDATE politici, korisnik sme da izmeni organization_id postojećeg reda.
-- ---------------------------------------------------------------------------

begin;
select testkit.login_as('00000000-0000-0000-0000-0000000000b1');  -- Jelena, Distribucija

select testkit.assert_denied(
  $q$update public.alerts
       set organization_id = '00000000-0000-0000-0000-00000000d003'
     where organization_id = '00000000-0000-0000-0000-00000000d002'$q$,
  'upozorenje se ne može premestiti u tuđu organizaciju'
);

select testkit.assert_denied(
  $q$insert into public.alerts (organization_id, severity, title, source)
     values ('00000000-0000-0000-0000-00000000d003', 'info', 'podmetnuto', 'system')$q$,
  'upozorenje se ne može kreirati u tuđoj organizaciji'
);

select testkit.assert_denied(
  $q$insert into public.integrations
       (organization_id, connector_type_key, name, auth_type, created_by)
     values ('00000000-0000-0000-0000-00000000d003', 'demo', 'podmetnuta', 'none',
             '00000000-0000-0000-0000-0000000000b1')$q$,
  'integracija se ne može kreirati u tuđoj organizaciji'
);
rollback;

-- ---------------------------------------------------------------------------
-- Složeni strani ključ: dete ne može da pripada drugoj organizaciji od roditelja
--
-- Provera se namerno radi kao superkorisnik. Poenta ograničenja je da važi
-- i kada RLS nije u igri — na primer u pozadinskom poslu sa povišenim pravima.
-- ---------------------------------------------------------------------------

begin;
insert into public.ai_conversations (id, organization_id, user_id, title)
values ('00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-00000000d003',
        '00000000-0000-0000-0000-0000000000c1', 'Razgovor Hotela');

do $$
begin
  begin
    -- Poruka tvrdi da pripada Distribuciji, a pokazuje na razgovor Hotela.
    insert into public.ai_messages (organization_id, conversation_id, role, content)
    values ('00000000-0000-0000-0000-00000000d002',
            '00000000-0000-0000-0000-00000000c001', 'user', 'unakrsno povezivanje');
    raise exception 'PAO TEST: baza je dozvolila poruku vezanu za razgovor druge organizacije';
  exception when foreign_key_violation then
    raise notice '  ok — složeni strani ključ sprečava unakrsno povezivanje organizacija';
  end;
end
$$;
rollback;

-- ---------------------------------------------------------------------------
-- Revizioni trag je samo za dopisivanje
-- ---------------------------------------------------------------------------

begin;
select app.write_audit(
  p_action => 'test.audit.write',
  p_actor_type => 'system',
  p_status => 'success',
  p_request_id => 'test-request-0001',
  p_organization_id => '00000000-0000-0000-0000-00000000d002'
);

select testkit.assert_equals(
  (select count(*) from public.audit_logs where request_id = 'test-request-0001')::integer, 1,
  'app.write_audit upisuje zapis'
);

select testkit.login_as('00000000-0000-0000-0000-0000000000b1');

select testkit.assert_denied(
  $q$update public.audit_logs set action = 'izmenjeno' where request_id = 'test-request-0001'$q$,
  'revizioni zapis se ne može izmeniti'
);
select testkit.assert_denied(
  $q$delete from public.audit_logs where request_id = 'test-request-0001'$q$,
  'revizioni zapis se ne može obrisati'
);
select testkit.assert_denied(
  $q$insert into public.audit_logs
       (organization_id, actor_type, action, status, request_id)
     values ('00000000-0000-0000-0000-00000000d002', 'user', 'podmetnuto', 'success', 'x')$q$,
  'u reviziju se ne može pisati mimo app.write_audit'
);
rollback;

-- Sesija pristupa se automatski upisuje u revizioni zapis.
begin;
insert into public.impersonation_sessions
  (id, staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-00000000f004',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'provera vezivanja revizije za sesiju pristupa', 'read_only', now() + interval '20 minutes');

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');
select app.write_audit(
  p_action => 'test.audit.during_session',
  p_actor_type => 'staff',
  p_status => 'success',
  p_request_id => 'test-request-0002',
  p_organization_id => '00000000-0000-0000-0000-00000000d002'
);
select testkit.logout();

select testkit.assert_equals(
  (select impersonation_session_id from public.audit_logs where request_id = 'test-request-0002'),
  '00000000-0000-0000-0000-00000000f004'::uuid,
  'revizioni zapis nosi identifikator aktivne sesije pristupa'
);
select testkit.assert_equals(
  (select actor_user_id from public.audit_logs where request_id = 'test-request-0002'),
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'akter se uzima sa servera, ne iz argumenta'
);
rollback;

-- ---------------------------------------------------------------------------
-- Kredencijali integracija
-- ---------------------------------------------------------------------------

begin;
select vault.create_secret('super-tajna-lozinka', 'test-secret') as secret_id \gset
insert into public.integration_credentials
  (integration_id, organization_id, vault_secret_id, auth_type, hint)
values ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000d002',
        :'secret_id', 'api_key', 'ak-••••7f31');

select testkit.login_as('00000000-0000-0000-0000-0000000000b1');

select testkit.assert_denied(
  $q$select count(*) from public.integration_credentials$q$,
  'tabela kredencijala je nedostupna i vlasniku organizacije'
);

-- Bezbedan podskup se dobija isključivo kroz funkciju.
select testkit.assert_equals(
  (select hint from app.integration_credential_summary('00000000-0000-0000-0000-00000000e002')),
  'ak-••••7f31',
  'naznaka kredencijala je dostupna kroz kontrolisanu funkciju'
);

-- Funkcija ne vraća ni referencu na tajnu, a kamoli vrednost.
-- Provera ide nad stvarnim potpisom funkcije, pa pada ako neko sutra doda
-- kolonu vault_secret_id u povratni skup.
select testkit.assert(
  not exists (
    select 1
    from pg_proc pr
    join pg_namespace n on n.oid = pr.pronamespace
    cross join lateral unnest(coalesce(pr.proargnames, '{}')) as arg(name)
    where n.nspname = 'app'
      and pr.proname = 'integration_credential_summary'
      and arg.name in ('vault_secret_id', 'secret', 'value')
  ),
  'funkcija ne izlaže vault_secret_id ni vrednost tajne'
);

-- Korisnik druge organizacije ne dobija ništa.
select testkit.login_as('00000000-0000-0000-0000-0000000000c1');
select testkit.assert_equals(
  (select count(*) from app.integration_credential_summary('00000000-0000-0000-0000-00000000e002'))::integer,
  0,
  'korisnik druge organizacije ne dobija podatke o kredencijalu'
);
rollback;

-- ---------------------------------------------------------------------------
-- Permisije
-- ---------------------------------------------------------------------------

begin;
-- Petar je u prodaji: vidi prodaju, ne vidi finansije.
select testkit.login_as('00000000-0000-0000-0000-0000000000b2');

select testkit.assert(
  app.has_permission('00000000-0000-0000-0000-00000000d002', 'view_sales'),
  'prodaja ima permisiju view_sales'
);
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d002', 'view_financial_data'),
  'prodaja nema permisiju view_financial_data'
);
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d002', 'manage_users'),
  'prodaja ne može da upravlja korisnicima'
);
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d003', 'view_sales'),
  'permisija ne prelazi granicu organizacije'
);
rollback;

-- deny uvek pobeđuje rolu
begin;
insert into public.membership_permission_overrides (membership_id, permission_key, effect)
select m.id, 'view_sales', 'deny'
from public.organization_memberships m
where m.user_id = '00000000-0000-0000-0000-0000000000b2';

select testkit.login_as('00000000-0000-0000-0000-0000000000b2');
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d002', 'view_sales'),
  'zabrana na nivou članstva poništava permisiju iz role'
);
rollback;

-- grant iznad role dodaje permisiju koju rola nema
begin;
insert into public.membership_permission_overrides (membership_id, permission_key, effect)
select m.id, 'view_financial_data', 'grant'
from public.organization_memberships m
where m.user_id = '00000000-0000-0000-0000-0000000000b2';

select testkit.login_as('00000000-0000-0000-0000-0000000000b2');
select testkit.assert(
  app.has_permission('00000000-0000-0000-0000-00000000d002', 'view_financial_data'),
  'pojedinačna dodela proširuje permisije iznad role'
);
rollback;

-- Sesija sa opsegom read_only ne daje pravo odobravanja akcija.
begin;
insert into public.impersonation_sessions
  (staff_user_id, organization_id, reason, scope, expires_at)
values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   'provera opsega sesije samo za citanje', 'read_only', now() + interval '20 minutes');

select testkit.login_as('00000000-0000-0000-0000-0000000000a2');
select testkit.assert(
  app.has_permission('00000000-0000-0000-0000-00000000d002', 'view_sales'),
  'sesija read_only dozvoljava čitanje'
);
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d002', 'approve_actions'),
  'sesija read_only NE dozvoljava odobravanje akcija'
);
select testkit.assert(
  not app.has_permission('00000000-0000-0000-0000-00000000d002', 'execute_actions'),
  'sesija read_only NE dozvoljava izvršavanje akcija'
);
rollback;

\echo '=== 40 — prošlo ==='
