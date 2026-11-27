-- ============================================================================
-- Table privileges for the Data API roles
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, after every other file. Idempotent.
--
-- Every other migration assumes Supabase's long-standing default: a table
-- created in `public` is automatically granted to `anon`, `authenticated` and
-- `service_role`, and row-level security decides what each may actually see.
-- Newer Supabase projects no longer grant that automatically, so on a fresh
-- project even the service role is refused ("permission denied for table
-- admin_users") and the console cannot sign anyone in.
--
-- This restores that default. It opens nothing RLS does not already govern:
-- every table in these migrations has row-level security enabled, and
-- `service_role` bypasses RLS by design.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Tables a later migration creates get the same treatment.
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Re-apply the one deliberate table-level exception (see sites.sql): the site
-- list is read by the service only, never through the browser's keys.
revoke all on table public.sites from public, anon, authenticated;
grant select on table public.sites to service_role;
