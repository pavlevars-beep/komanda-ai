-- description: Osnovne šeme, zaključavanje privilegija i pomoćni tipovi.
--
-- Prva brava izolacije: role dostupne iz browsera dobijaju najuže moguće
-- privilegije, i to eksplicitno, pre nego što ijedna tabela postoji.
--
-- Napomena o modelu pristupa:
--   anon          — nema NIKAKVA prava nad aplikativnim tabelama. Anon ključ
--                   u browseru služi isključivo za autentikaciju.
--   authenticated — prava dobija po tabeli, i uvek uz RLS koji proverava i
--                   pripadnost organizaciji i permisiju. Autorizacija je time
--                   sprovedena u BAZI, pa je jednako važeća i kada zahtev
--                   stigne mimo naše aplikacije.
--   service_role  — zaobilazi RLS. Koristi se samo u migracijama, seed-u i
--                   pozadinskim poslovima, nikad u kodu koji opslužuje korisnika.

create schema if not exists app;
comment on schema app is
  'Pomoćne funkcije za autorizaciju. Namerno odvojene od public, i nisu izložene kroz PostgREST.';

-- PostgREST ne sme da servira ovu šemu.
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- Podrazumevano ne dajemo ništa novim objektima; svaka tabela grantove
-- dobija eksplicitno, uz svoje RLS politike.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- Tipovi
-- ---------------------------------------------------------------------------

create type org_status as enum ('prospect', 'onboarding', 'active', 'suspended', 'archived');
create type membership_status as enum ('invited', 'active', 'suspended', 'revoked');
create type role_scope as enum ('platform', 'client');
create type permission_effect as enum ('grant', 'deny');
create type staff_role as enum ('super_admin', 'consultant', 'support');
create type impersonation_scope as enum ('read_only', 'full');

create type integration_status as enum (
  'draft', 'testing', 'connected', 'needs_attention', 'disconnected', 'disabled'
);
create type environment_kind as enum ('sandbox', 'production');
create type capability_mode as enum ('read', 'prepare', 'execute');
create type connector_availability as enum ('ga', 'beta', 'planned');

create type claim_classification as enum ('fact', 'calculation', 'interpretation', 'forecast');
create type message_role as enum ('user', 'assistant', 'tool', 'system');

create type risk_level as enum ('low', 'medium', 'high', 'critical');
create type approval_status as enum (
  'pending', 'approved', 'rejected', 'expired', 'executing', 'executed', 'failed'
);
create type decision_kind as enum ('approve', 'reject', 'edit');

create type alert_severity as enum ('info', 'warning', 'critical');
create type alert_status as enum ('new', 'acknowledged', 'resolved', 'dismissed');

create type audit_actor_type as enum ('user', 'staff', 'system', 'ai');
create type audit_status as enum ('success', 'failure', 'denied');

-- ---------------------------------------------------------------------------
-- Zajednički trigger za updated_at
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
