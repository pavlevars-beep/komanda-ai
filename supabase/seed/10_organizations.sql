-- Tri organizacije: platformska i dve demo.
--
-- Demo organizacije nose is_demo = true, pa ih UI vidljivo označava i
-- aplikacija odbija da ih pokrene u produkciji.

insert into public.organizations
  (id, slug, legal_name, display_name, industry, status, plan, is_platform_org, is_demo,
   default_locale, default_currency)
values
  ('00000000-0000-0000-0000-00000000d001', 'delta-pro',
   'Delta Pro DOO', 'Delta Pro', 'IT konsalting', 'active', 'internal', true, false, 'sr', 'RSD'),

  ('00000000-0000-0000-0000-00000000d002', 'demo-distribucija',
   'Demo Distribucija d.o.o.', 'Demo Distribucija', 'Veleprodaja', 'active', 'standard',
   false, true, 'sr', 'RSD'),

  ('00000000-0000-0000-0000-00000000d003', 'demo-hotel-grupa',
   'Demo Hotel Grupa d.o.o.', 'Demo Hotel Grupa', 'Hotelijerstvo', 'onboarding', 'standard',
   false, true, 'sr', 'EUR')
on conflict (id) do nothing;

insert into public.organization_branding
  (organization_id, primary_color, workspace_name, welcome_message)
values
  ('00000000-0000-0000-0000-00000000d002', '#1F5FA8', 'Demo Distribucija',
   '{"sr":"Dobrodošli u komandni centar Demo Distribucije.","en":"Welcome to the Demo Distribucija command centre."}'),
  ('00000000-0000-0000-0000-00000000d003', '#0E6E6B', 'Demo Hotel Grupa',
   '{"sr":"Dobrodošli u komandni centar Demo Hotel Grupe.","en":"Welcome to the Demo Hotel Group command centre."}')
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Delta Pro osoblje
-- ---------------------------------------------------------------------------

insert into public.platform_staff (user_id, staff_role) values
  ('00000000-0000-0000-0000-0000000000a1', 'super_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'consultant')
on conflict (user_id) do nothing;

-- Marko je konsultant SAMO za Demo Distribuciju. Hotel ne sme ni da vidi.
insert into public.client_assignments (staff_user_id, organization_id, assigned_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002',
   '00000000-0000-0000-0000-0000000000a1')
on conflict (staff_user_id, organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- Članstva
-- ---------------------------------------------------------------------------

insert into public.organization_memberships
  (organization_id, user_id, role_id, status, accepted_at)
select v.org, v.usr, r.id, v.status::membership_status, now()
from (values
  -- Demo Distribucija
  ('00000000-0000-0000-0000-00000000d002'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid,
   'client_owner', 'active'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000b2',
   'sales', 'active'),
  -- Opozvano članstvo: mora da se ponaša kao da ga nema.
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000b3',
   'employee', 'revoked'),

  -- Demo Hotel Grupa
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-0000000000c1',
   'client_owner', 'active'),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-0000000000c2',
   'finance', 'active')
) as v(org, usr, role_key, status)
join public.roles r on r.key = v.role_key and r.is_system
on conflict (organization_id, user_id) do nothing;
