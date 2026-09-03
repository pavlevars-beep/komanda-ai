-- Reprodukuje tačno ono što konzola radi pri kreiranju klijenta i pokazuje
-- pravu grešku iz Postgresa.
--
-- U SQL Editor-u `auth.uid()` je NULL, pa bi `app.is_staff()` odbio poziv iz
-- pogrešnog razloga. Zato se identitet prvo postavlja, isto kao što to radi
-- PostgREST kada zahtev stigne iz aplikacije.
--
-- Ništa ne ostaje iza sebe: blok se namerno završava izuzetkom, pa se sve
-- poništava.

do $$
declare
  v_uid uuid;
  v_org uuid;
begin
  select s.user_id into v_uid
  from public.platform_staff s
  where s.is_active
  order by s.created_at
  limit 1;

  if v_uid is null then
    raise exception 'Nema aktivnog naloga u platform_staff — to je onda uzrok.';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );

  v_org := public.create_client_organization(
    'proba-dijagnostika', 'Proba d.o.o.', 'Proba',
    null, 'RS', 'RSD', 'Europe/Belgrade', 'standard', 'sr'
  );

  raise exception 'PROŠLO JE. Funkcija radi, organizacija bi bila %. (Namerni rollback.)', v_org;
end;
$$;
