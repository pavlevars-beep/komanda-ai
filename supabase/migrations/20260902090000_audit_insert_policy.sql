-- description: Eksplicitna INSERT politika na reviziji.
--
-- `audit_logs` ima `force row level security`, a to ukida izuzeće koje vlasnik
-- tabele inače ima. `app.write_audit` je SECURITY DEFINER i upisuje kao
-- vlasnik, pa je upis do sada prolazio samo zato što ta rola ima BYPASSRLS.
--
-- To je oslonac na atribut role, ne na nešto što je ovde zapisano. Lokalni
-- Postgres u CI-ju je superuser i uvek prolazi, pa razlika između okruženja
-- ostaje nevidljiva sve dok se ne pojavi na produkciji.
--
-- Politika NE otvara upis aplikaciji: `authenticated` nema INSERT privilegiju
-- na ovoj tabeli (dodeljen je samo SELECT), a privilegija se proverava pre
-- politike. Politika je bez učinka za svakoga ko privilegiju nema — jedini
-- kome menja stvar je vlasnik, kroz `app.write_audit`.

-- `create policy` nema `if not exists`, a politika može već da postoji — ručno
-- puštena pre ove migracije, u hitnom slučaju. Migracija koja tada pukne
-- blokira i sve ostale u istom `db push`, pa se stanje prvo proverava.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_insert'
  ) then
    create policy audit_insert on public.audit_logs
      for insert with check (true);
  end if;

  -- Isto važi i za default particiju: upit koji cilja particiju direktno ne
  -- prolazi kroz politike roditelja.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs_default' and policyname = 'audit_insert'
  ) then
    create policy audit_insert on public.audit_logs_default
      for insert with check (true);
  end if;
end;
$$;

comment on policy audit_insert on public.audit_logs is
  'Bez učinka za authenticated (nema INSERT privilegiju). Postoji da upis kroz app.write_audit ne zavisi od BYPASSRLS atributa role.';

-- Postojeće mesečne particije su napravljene pre ove migracije, pa ih treba
-- obuhvatiti; `ensure_audit_partitions` sve buduće pravi sa istom politikom.
do $$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'audit_logs'
      and c.relname <> 'audit_logs_default'
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.relname and policyname = 'audit_insert'
    ) then
      execute format(
        'create policy audit_insert on public.%I for insert with check (true)',
        r.relname
      );
    end if;
  end loop;
end;
$$;
