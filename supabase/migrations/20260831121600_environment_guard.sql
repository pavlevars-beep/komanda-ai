-- description: Zaštita od demo podataka u produkciji.
--
-- Aplikacija već odbija da prikaže demo podatke van razvoja, ali to je provera
-- u kodu koji neko sutra može da zaobiđe pozadinskim poslom, ručnim upitom ili
-- greškom u skripti. Ovde je ista zabrana spuštena u bazu.
--
-- Mehanizam: razvojna baza NOSI oznaku da je razvojna. Produkcijska je nema, i
-- to je podrazumevano stanje — nema koraka koji neko može da zaboravi da uradi
-- da bi produkcija bila zaštićena.

create or replace function app.is_development_database()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.environment', true), ''),
    'production'
  ) = 'development';
$$;

comment on function app.is_development_database() is
  'Podrazumevano vraća false. Razvojna baza se izričito označava sa: alter database <ime> set app.environment = ''development'';';

create or replace function app.guard_demo_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo and not app.is_development_database() then
    raise exception
      'Demo podaci nisu dozvoljeni van razvojne baze. Organizacija "%" je označena kao demo.',
      new.display_name
      using errcode = '42501',
            hint = 'Ako je ovo zaista razvojna baza: alter database <ime> set app.environment = ''development'';';
  end if;
  return new;
end;
$$;

create trigger organizations_demo_guard
  before insert or update on public.organizations
  for each row execute function app.guard_demo_data();

grant execute on function app.is_development_database() to authenticated, service_role;
