-- Seed korisnika za razvoj.
--
-- LOZINKE NISU OVDE I NEĆE BITI. Heš lozinke u repozitorijumu je tajna u
-- verzionisanom fajlu, bez obzira na to što je razvojna. Nalozi se ovde samo
-- kreiraju; razvojne lozinke se postavljaju zasebnim korakom kroz Supabase
-- Admin API (vidi scripts/set-dev-passwords.md).
--
-- Namerno postoje i dva granična slučaja, jer bez njih testovi izolacije
-- proveravaju samo srećan tok:
--   • korisnik bez ijednog članstva
--   • korisnik sa opozvanim članstvom

insert into auth.users (id, email, raw_user_meta_data) values
  -- Delta Pro
  ('00000000-0000-0000-0000-0000000000a1', 'ana.jovanovic@deltapro.rs',
   '{"full_name":"Ana Jovanović"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'marko.ilic@deltapro.rs',
   '{"full_name":"Marko Ilić"}'),

  -- Demo Distribucija
  ('00000000-0000-0000-0000-0000000000b1', 'jelena.savic@demo-distribucija.rs',
   '{"full_name":"Jelena Savić"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'petar.mitic@demo-distribucija.rs',
   '{"full_name":"Petar Mitić"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'milan.kostic@demo-distribucija.rs',
   '{"full_name":"Milan Kostić"}'),

  -- Demo Hotel Grupa
  ('00000000-0000-0000-0000-0000000000c1', 'nikola.pavlovic@demo-hotel.rs',
   '{"full_name":"Nikola Pavlović"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'sara.djordjevic@demo-hotel.rs',
   '{"full_name":"Sara Đorđević"}'),

  -- Bez ijednog članstva — mora da ne vidi apsolutno ništa.
  ('00000000-0000-0000-0000-0000000000f1', 'stefan.nikolic@example.com',
   '{"full_name":"Stefan Nikolić"}')
on conflict (id) do nothing;

-- Na Supabase-u profil pravi trigger; lokalno ga shim takođe okida.
insert into public.user_profiles (id, full_name)
select u.id, u.raw_user_meta_data ->> 'full_name'
from auth.users u
on conflict (id) do nothing;
