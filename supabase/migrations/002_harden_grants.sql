-- ============================================================
-- 002_harden_grants.sql — Close the privileges 001 left on the default.
--
-- WHY THIS EXISTS
--
-- 001 revoked SELECT and UPDATE on profiles and granted back only the columns
-- the app needs. It never touched INSERT, DELETE, TRUNCATE or REFERENCES, which
-- means those stayed on Supabase's schema default — and that default is:
--
--   anon=arwdDxtm/postgres | authenticated=arwdDxtm/postgres
--
-- Check it on your own project:
--
--   SELECT n.nspname, d.defaclobjtype, array_to_string(d.defaclacl, ' | ')
--   FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
--   WHERE n.nspname = 'public';
--
-- So before this migration, anon could INSERT, DELETE and TRUNCATE profiles at
-- the privilege layer. RLS still blocked it — there is no INSERT or DELETE
-- policy on profiles, and no policy means deny — so this was not an open door.
-- It was the second lock missing on a door with one lock, which matters the day
-- somebody adds a permissive policy without thinking about who can already
-- reach the table.
--
-- The client never inserts or deletes a profile: the row is created by the
-- handle_new_user trigger on signup and removed by the cascade when the auth
-- user is deleted. So authenticated needs exactly SELECT on three columns and
-- UPDATE on one, and anon needs nothing at all.
--
-- NOTE ON FUTURE TABLES: this fixes the tables that exist today. The schema
-- default above still applies to the next table you create, which will arrive
-- fully granted to anon and authenticated the moment it exists. Run
-- supabase/tests/privilege_sweep.sql after adding tables — that is the check
-- that catches it.
-- ============================================================

-- Written as REVOKE ALL followed by the two grants rather than revoking the
-- specific missing privileges, so the end state is stated in full instead of
-- being the result of reading this file and 001 together. It is idempotent:
-- re-running it lands on the same privileges.
REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT (id, display_name, created_at) ON public.profiles TO authenticated;
GRANT UPDATE (display_name)                 ON public.profiles TO authenticated;
