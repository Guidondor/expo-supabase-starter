-- ============================================================
-- rls_smoke.sql — Reproducible RLS / security smoke test (lite base).
--
-- Proves the profiles table is locked down: a user sees only their own row,
-- can't read the sensitive column via SELECT *, and can't mutate immutable
-- columns. Runs inside one transaction and ends with a RAISE that ROLLS BACK,
-- so it never mutates your data.
--
-- HOW TO RUN
--   1. Sign up a user through the app, put their auth user id below.
--   2. Run it in the Supabase SQL Editor. A clean run RAISES "RLS_SMOKE PASS";
--      any "FAIL" means a check did not hold — investigate before shipping.
-- ============================================================

DO $$
DECLARE
  -- >>> replace with a real user id <<<
  u uuid := '00000000-0000-0000-0000-000000000000';
  fails text[] := '{}';
  v_bool boolean;
  v_int int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);

  -- Sees own profile
  SELECT count(*) INTO v_int FROM public.profiles WHERE id = u;
  IF v_int <> 1 THEN fails := fails || 'own profile not visible'; END IF;

  -- Does NOT see other profiles
  SELECT count(*) INTO v_int FROM public.profiles WHERE id <> u;
  IF v_int <> 0 THEN fails := fails || 'other profiles visible'; END IF;

  -- SELECT * fails (email column revoked)
  v_bool := false;
  BEGIN PERFORM * FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_bool := true; END;
  IF NOT v_bool THEN fails := fails || 'SELECT * on profiles did not fail'; END IF;

  -- Cannot change own email (immutable column)
  v_bool := false;
  BEGIN UPDATE public.profiles SET email = 'evil@x.com' WHERE id = u;
  EXCEPTION WHEN insufficient_privilege THEN v_bool := true; END;
  IF NOT v_bool THEN fails := fails || 'email UPDATE was allowed'; END IF;

  IF array_length(fails, 1) IS NULL THEN
    RAISE EXCEPTION 'RLS_SMOKE PASS — all checks held (rolled back)';
  ELSE
    RAISE EXCEPTION 'RLS_SMOKE FAIL — %', array_to_string(fails, ' | ');
  END IF;
END $$;
