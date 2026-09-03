-- description: Sistemske poruke rolama i skladište za logotipe klijenata.

-- ---------------------------------------------------------------------------
-- Poruke iz sistema ka izabranim rolama
-- ---------------------------------------------------------------------------
--
-- `notifications` postoji od početka, ali je imala samo SELECT i UPDATE za
-- primaoca — niko nije mogao da UPIŠE obaveštenje nekom drugom. To je bilo
-- ispravno kao zaštita, ali je značilo da funkcija nema kako da postoji.
--
-- Rešenje nije otvaranje INSERT politike. Politika koja dozvoljava upis tuđem
-- korisniku otvara i slanje pojedincu, mimo bilo kakvog pravila. Umesto toga
-- postoji jedna funkcija koja prima ROLE, a ne spisak korisnika, i sama
-- razrešava primaoce iz aktivnog članstva.

create or replace function public.send_org_message(
  p_organization_id uuid,
  p_role_keys       text[],
  p_title           text,
  p_body            text,
  p_link            text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent    integer;
  v_title   text := btrim(p_title);
  v_body    text := nullif(btrim(coalesce(p_body, '')), '');
begin
  -- Pravo se proverava OVDE, nad organizacijom iz argumenta. Funkcija je
  -- SECURITY DEFINER i zaobilazi RLS, pa je ovo jedina kapija koja postoji.
  if not app.has_permission(p_organization_id, 'manage_alerts') then
    raise exception 'nema prava za slanje poruka u ovoj organizaciji'
      using errcode = '42501';
  end if;

  if v_title = '' then
    raise exception 'poruka mora imati naslov' using errcode = '22023';
  end if;

  if p_role_keys is null or cardinality(p_role_keys) = 0 then
    raise exception 'poruka mora imati bar jednu rolu primaoca' using errcode = '22023';
  end if;

  /*
   * Primaoci se izvode iz AKTIVNOG članstva i traženih rola.
   *
   * `distinct` je neophodan: isti čovek može imati više članstava u istoj
   * organizaciji, pa bi bez toga dobio istu poruku dvaput.
   *
   * Pošiljalac se namerno ne izuzima. Direktor koji šalje svim menadžerima
   * treba da vidi tačno ono što su oni dobili.
   */
  with primaoci as (
    select distinct m.user_id
    from public.organization_memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = p_organization_id
      and m.status = 'active'
      and r.key = any(p_role_keys)
  ), upisano as (
    insert into public.notifications (organization_id, user_id, kind, title, body, link)
    select p_organization_id, p.user_id, 'system_message', v_title, v_body, p_link
    from primaoci p
    returning 1
  )
  select count(*)::integer into v_sent from upisano;

  return v_sent;
end;
$$;

comment on function public.send_org_message(uuid, text[], text, text, text) is
  'Šalje poruku svim aktivnim članovima u zadatim rolama. Prima role, nikad spisak korisnika.';

grant execute on function public.send_org_message(uuid, text[], text, text, text) to authenticated;

-- Ko sme da pošalje, sme i da vidi kome je poslato — bez toga pošiljalac nema
-- načina da proveri da li je poruka stigla do koga treba.
create policy notifications_select_sender on public.notifications
  for select to authenticated
  using (
    kind = 'system_message'
    and organization_id in (select unnest(app.accessible_org_ids()))
    and app.has_permission(organization_id, 'manage_alerts')
  );

-- ---------------------------------------------------------------------------
-- Skladište logotipa
-- ---------------------------------------------------------------------------
--
-- Logotip je javan po prirodi — stoji na sajtu i na fakturama klijenta. Zato
-- je kofa javna za čitanje: potpisani URL-ovi bi istekli usred prikaza, a
-- ništa se time ne bi zaštitilo.
--
-- Upis je nešto sasvim drugo i vezan je za organizaciju kroz PRVI segment
-- putanje. Bez tog pravila bi bilo koji prijavljeni korisnik mogao da prepiše
-- tuđi logotip.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  -- 2 MB je više nego dovoljno za logotip; veći fajl je skoro uvek greška
  -- (fotografija umesto vektora) i usporio bi svaku stranicu klijenta.
  2097152,
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_read'
  ) then
    create policy branding_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'branding');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_write'
  ) then
    -- Prvi segment putanje mora da bude organizacija koju pozivalac
    -- administrira: 'branding/<organization_id>/logo.png'.
    create policy branding_write on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'branding'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_replace'
  ) then
    create policy branding_replace on storage.objects
      for update to authenticated
      using (
        bucket_id = 'branding'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_delete'
  ) then
    create policy branding_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'branding'
        and (storage.foldername(name))[1]::uuid
            in (select unnest(app.administrable_org_ids()))
      );
  end if;
end;
$$;
