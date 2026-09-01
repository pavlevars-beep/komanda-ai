-- description: Delta Pro osoblje, dodela klijenata i sesije pristupa.
--
-- Ovde je sprovedena ključna bezbednosna odluka proizvoda: administrativni
-- pristup (konfiguracija) i pristup poslovnim podacima su DVA RAZLIČITA PRAVA.
-- Dodela klijenta daje prvo. Drugo se dobija isključivo kroz vremenski
-- ograničenu sesiju sa obrazloženjem, koju klijent vidi i može da prekine.

create table public.platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  staff_role staff_role not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

comment on table public.platform_staff is
  'Delta Pro nalozi. Članstvo ovde NE daje pristup poslovnim podacima klijenata.';

create table public.client_assignments (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_by     uuid not null references auth.users(id),
  assigned_at     timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (staff_user_id, organization_id)
);

create index client_assignments_active
  on public.client_assignments (staff_user_id, organization_id) where revoked_at is null;

comment on table public.client_assignments is
  'Daje pravo na konfiguraciju i dijagnostiku, i pravo da se POKRENE sesija pristupa. Ne daje pristup podacima.';

create table public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reason          text not null,
  scope           impersonation_scope not null default 'read_only',
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  ended_by        uuid references auth.users(id),
  ip              inet,
  user_agent      text,
  request_count   integer not null default 0,

  -- Razlog mora da bude stvarno napisan, ne "test" ili prazan string.
  constraint impersonation_reason_meaningful check (length(btrim(reason)) between 10 and 500),
  constraint impersonation_expiry_future check (expires_at > started_at),
  -- Tvrda gornja granica trajanja, bez obzira na to šta aplikacija pošalje.
  constraint impersonation_max_duration check (expires_at <= started_at + interval '8 hours')
);

create index impersonation_sessions_open
  on public.impersonation_sessions (staff_user_id, organization_id)
  where ended_at is null;

create index impersonation_sessions_by_org
  on public.impersonation_sessions (organization_id, started_at desc);

comment on table public.impersonation_sessions is
  'Jedini put kojim Delta Pro osoblje dolazi do poslovnih podataka klijenta. Vidljivo klijentu i zabeleženo.';
