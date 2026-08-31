-- Pomoćne funkcije za testove izolacije.

create schema if not exists testkit;

-- Prelazak u kontekst konkretnog korisnika, tačno kao što to radi PostgREST.
create or replace function testkit.login_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id)::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function testkit.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role none';
end;
$$;

-- Minimalne tvrdnje. Namerno bez pgTAP-a, da testovi rade nad svakim
-- PostgreSQL-om, i u CI-ju i na Supabase-u.
create or replace function testkit.assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'PAO TEST: %', p_message using errcode = 'triggered_action_exception';
  end if;
  raise notice '  ok — %', p_message;
end;
$$;

create or replace function testkit.assert_equals(p_actual anyelement, p_expected anyelement, p_message text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'PAO TEST: % (dobijeno: %, očekivano: %)', p_message, p_actual, p_expected
      using errcode = 'triggered_action_exception';
  end if;
  raise notice '  ok — %', p_message;
end;
$$;

-- Tvrdnja da operacija pada zbog nedostatka privilegija ili RLS-a.
create or replace function testkit.assert_denied(p_sql text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when insufficient_privilege or check_violation then
      raise notice '  ok — %', p_message;
      return;
    when others then
      -- RLS koji odbije INSERT vraća posebnu grešku; sve ostalo je stvarni problem.
      if sqlstate = '42501' then
        raise notice '  ok — %', p_message;
        return;
      end if;
      raise exception 'PAO TEST: % (neočekivana greška %: %)', p_message, sqlstate, sqlerrm;
  end;
  raise exception 'PAO TEST: % (operacija je PROŠLA, a nije smela)', p_message
    using errcode = 'triggered_action_exception';
end;
$$;

-- Test harness mora da bude dostupan i nakon prelaska u rolu authenticated,
-- inače test ne može da se prebaci na sledećeg korisnika.
grant usage on schema testkit to public;
grant execute on all functions in schema testkit to public;
