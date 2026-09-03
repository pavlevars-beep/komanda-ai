-- description: Kontekst radnog prostora nosi i rolu člana.
--
-- Brif se prikazuje drugačije direktoru, prodaji, nabavci i finansijama. Do
-- sada je kontekst nosio samo PRAVA, a prava su odgovor na pitanje „šta sme
-- da vidi", ne na pitanje „šta ga prvo zanima".
--
-- Rola se NE koristi za autorizaciju. Autorizaciju i dalje sprovode prava i
-- RLS; rola određuje samo redosled i naglasak na ekranu. Da rola odlučuje o
-- pristupu, imali bismo dva izvora istine o istoj stvari — a takav par se
-- vremenom raziđe.
--
-- `create or replace` ne može da promeni tip povratne vrednosti, pa funkcija
-- mora prvo da se ukloni.

drop function if exists public.workspace_context(text);

create function public.workspace_context(p_slug text)
returns table (
  organization_id            uuid,
  organization_slug          text,
  organization_name          text,
  default_locale             text,
  default_currency           text,
  timezone                   text,
  is_demo                    boolean,
  permissions                text[],
  member_role                text,
  staff_role                 text,
  impersonation_session_id   uuid,
  impersonation_expires_at   timestamptz,
  impersonation_staff_name   text,
  impersonation_reason       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id, o.slug, o.display_name, o.default_locale, o.default_currency, o.timezone, o.is_demo,
    public.effective_permissions(o.id),
    -- Prazno za osoblje u sesiji pristupa: konsultant nije član i nema rolu u
    -- klijentovoj organizaciji. Brif mu se prikazuje u punom obimu.
    (select r.key
       from public.organization_memberships m
       join public.roles r on r.id = m.role_id
      where m.organization_id = o.id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
      limit 1),
    (select s.staff_role::text from public.platform_staff s
      where s.user_id = (select auth.uid()) and s.is_active),
    i.id, i.expires_at,
    (select pr.full_name from public.user_profiles pr where pr.id = i.staff_user_id),
    i.reason
  from public.organizations o
  left join lateral (
    select ses.id, ses.expires_at, ses.staff_user_id, ses.reason
    from public.impersonation_sessions ses
    where ses.organization_id = o.id
      and ses.staff_user_id = (select auth.uid())
      and ses.ended_at is null
      and ses.expires_at > now()
    order by ses.started_at desc
    limit 1
  ) i on true
  where lower(o.slug) = lower(p_slug)
    and o.id = any (app.accessible_org_ids());
$$;

grant execute on function public.workspace_context(text) to authenticated;
