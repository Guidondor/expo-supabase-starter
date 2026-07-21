-- ============================================================
-- 001_initial_schema.sql
-- Generic base: profiles table + auto-create trigger + RLS.
-- ============================================================

-- One profile per user. `id` references auth.users with cascade delete, so
-- deleting the user in Auth cleans up their profile automatically.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'User',
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Each user only sees and edits their own profile. Policies are split per
-- operation; UPDATE carries WITH CHECK to prevent changing the id to another user.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Column-level hardening. RLS gates rows, not columns — for reads AND writes.
-- Hide `email` from the auto REST API, and keep it (plus id/created_at) immutable
-- from the client (it mirrors auth.users.email). Only display_name is user-editable.
-- Copy this pattern for your own sensitive columns. NOTE: with revoked columns,
-- `select('*')` fails — always select explicit columns.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT  SELECT (id, display_name, created_at) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (display_name) ON public.profiles TO authenticated;

-- Creates the profile automatically on signup. SECURITY DEFINER so it can insert
-- bypassing RLS; search_path is pinned for hardening (avoids function hijacking
-- via caller schemas).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1), 'User'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- IMPORTANT: wire the trigger to auth.users. Without this, signups create the
-- user but NOT the profile.
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- handle_new_user is a TRIGGER function: it runs with the table owner's privileges
-- when the trigger fires, and needs EXECUTE granted to no one. Revoke it so it is
-- NOT exposed as a public RPC (/rest/v1/rpc/handle_new_user).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Lets the user delete their own account from the client (RPC).
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = (SELECT auth.uid());
END;
$$;

-- Defense-in-depth: only authenticated users can run the RPC (never anon).
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
