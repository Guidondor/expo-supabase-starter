-- ============================================================
-- rls_smoke.sql — Reproducible RLS / security smoke test (lite base).
--
-- Proves the profiles table is locked down: a user sees only their own row,
-- can't read the sensitive column via SELECT *, and can't mutate immutable
-- columns. Runs inside one transaction and ends with a RAISE that ROLLS BACK,
-- so it never mutates your data.
--
-- HOW TO RUN
--   1. Sign up TWO users through the app. One is the identity the test assumes;
--      the second exists so the isolation check has something to fail against.
--      Put the first one's auth user id below.
--   2. Run it in the Supabase SQL Editor. A clean run RAISES "RLS_SMOKE PASS";
--      any "FAIL" means a check did not hold — investigate before shipping.
--
-- Why two users: with a single account in the project, "this user sees no other
-- rows" is true because there ARE no other rows. The test would pass without
-- ever exercising RLS. The guard below turns that into an explicit failure
-- instead of a green tick you can't trust.
-- ============================================================

DO $$
DECLARE
  -- >>> replace with a real user id <<<
  u uuid := '00000000-0000-0000-0000-000000000000';
  fails text[] := '{}';
  v_bool boolean;
  v_int int;
  v_total int;
  v_role text;
BEGIN
  -- Counted before dropping privileges, so RLS doesn't hide the answer.
  SELECT count(*) INTO v_total FROM public.profiles;
  IF v_total < 2 THEN
    fails := array_append(fails, format(
      'INCONCLUSIVE: only %s profile(s) exist. Sign up a second user, otherwise the isolation check passes for lack of data', v_total));
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);

  -- The role switch is what gives every check below its meaning. A connection that
  -- bypasses RLS passes all of them without exercising a single policy, so verify it
  -- took effect before trusting any result. Note: on Supabase `postgres` is NOT a
  -- superuser (rolsuper is false) but it does carry rolbypassrls, so a "is this a
  -- superuser?" guard would pass while reading straight past every policy.
  SELECT current_user INTO v_role;
  SELECT rolbypassrls INTO v_bool FROM pg_roles WHERE rolname = current_user;
  IF v_role <> 'authenticated' OR coalesce(v_bool, true) THEN
    RAISE EXCEPTION 'RLS_SMOKE INCONCLUSIVE — running as "%" (bypassrls=%). Every check below would pass without testing a policy. Run this so it reaches the database as the role your app uses.', v_role, coalesce(v_bool::text, 'unknown');
  END IF;

  -- Sees own profile
  SELECT count(*) INTO v_int FROM public.profiles WHERE id = u;
  IF v_int <> 1 THEN fails := array_append(fails, 'own profile not visible'); END IF;

  -- Does NOT see other profiles
  SELECT count(*) INTO v_int FROM public.profiles WHERE id <> u;
  IF v_int <> 0 THEN fails := array_append(fails, 'other profiles visible'); END IF;

  -- SELECT * fails (email column revoked)
  v_bool := false;
  BEGIN PERFORM * FROM public.profiles LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_bool := true; END;
  IF NOT v_bool THEN fails := array_append(fails, 'SELECT * on profiles did not fail'); END IF;

  -- Cannot change own email (immutable column)
  v_bool := false;
  BEGIN UPDATE public.profiles SET email = 'evil@x.com' WHERE id = u;
  EXCEPTION WHEN insufficient_privilege THEN v_bool := true; END;
  IF NOT v_bool THEN fails := array_append(fails, 'email UPDATE was allowed'); END IF;

  IF array_length(fails, 1) IS NULL THEN
    RAISE EXCEPTION 'RLS_SMOKE PASS — all checks held (rolled back)';
  ELSE
    RAISE EXCEPTION 'RLS_SMOKE FAIL — %', array_to_string(fails, ' | ');
  END IF;
END $$;
