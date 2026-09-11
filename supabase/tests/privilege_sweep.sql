-- ============================================================
-- privilege_sweep.sql — Declared-baseline privilege check.
--
-- WHAT THIS IS FOR, AND WHY rls_smoke.sql IS NOT ENOUGH
--
-- rls_smoke.sql asserts BEHAVIOUR on the columns someone thought to write an
-- assertion for. It proves `SELECT *` on profiles raises, that email can't be
-- updated, that you don't see other people's rows. All still true, all still
-- worth running. But it only ever looks at profiles.
--
-- On Supabase, `ALTER DEFAULT PRIVILEGES` in the public schema grants
-- arwdDxtm (INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
-- to BOTH anon and authenticated on every new table, and EXECUTE on every new
-- function. Verify it on your own project:
--
--   SELECT n.nspname, d.defaclobjtype, array_to_string(d.defaclacl, ' | ')
--   FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
--   WHERE n.nspname = 'public';
--
-- So the table you add next week is wide open at the privilege layer the moment
-- it exists, and rls_smoke.sql stays green because it never heard of it. RLS is
-- then the only thing between anon and your data — and if you forget to enable
-- it on that one table, nothing is.
--
-- This file closes that gap the other way round: instead of asserting behaviour
-- table by table, it takes a census of what the database ACTUALLY grants, and
-- fails on anything you did not declare. A privilege you never thought about is
-- a failure by default, which is the opposite of how the smoke test behaves.
--
-- HOW TO RUN
--   Paste into the Supabase SQL Editor, or run in CI against your database.
--   It is READ ONLY — no DDL, no DML, nothing to roll back. That is also why it
--   RAISEs only on failure, unlike rls_smoke.sql: a clean run is silent so a CI
--   step passes on exit code.
--
-- FIRST RUN: the baseline below is the one that matches this starter's schema.
-- When you add your own tables, regenerate it with the block at the bottom of
-- this file, read every line it prints, and paste the result back here. Reading
-- it is the point — this list is the thing your reviewer sees in the diff when
-- someone widens a grant.
-- ============================================================

DO $$
DECLARE
  -- ==================== BASELINE ====================
  -- Every privilege the app is allowed to have, as 'role|table|column|privilege'.
  -- Anything the database grants beyond this list is a failure.
  -- anon appears nowhere on purpose: this starter gives it nothing.
  baseline_columns text[] := ARRAY[
    'authenticated|profiles|id|SELECT',
    'authenticated|profiles|display_name|SELECT',
    'authenticated|profiles|created_at|SELECT',
    'authenticated|profiles|display_name|UPDATE'
  ];

  -- DELETE and TRUNCATE have no column-level form, so they are checked per table.
  baseline_tables text[] := ARRAY[]::text[];

  -- Functions callable as an RPC through PostgREST.
  -- handle_new_user is absent on purpose: it is a trigger function and must not
  -- be reachable at /rest/v1/rpc/handle_new_user.
  baseline_functions text[] := ARRAY[
    'authenticated|delete_own_account'
  ];
  -- ==================================================

  roles       text[] := ARRAY['anon', 'authenticated'];
  col_privs   text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
  tbl_privs   text[] := ARRAY['DELETE', 'TRUNCATE'];

  fails       text[] := '{}';
  v_role      text;
  v_priv      text;
  v_key       text;
  r           record;
  n_checks    int := 0;
  n_tables    int := 0;

  -- Findings are collected with a sort rank, not appended in discovery order.
  -- The first run of this against a real project returned 424 lines, and a
  -- 424-line wall gets skimmed and then ignored — which is the same as having no
  -- check at all, except it costs you CI minutes. anon reaching a SECURITY
  -- DEFINER function has to be readable above the noise of a table that simply
  -- never had its default grants revoked.
  findings    text[] := '{}';   -- each entry is 'rank|message'
  v_cols_total int;
  v_undeclared int;
BEGIN
  -- Fail loudly if a role is missing rather than silently checking nothing.
  -- has_column_privilege() would error anyway, but with a message that sends you
  -- looking at the wrong thing.
  FOREACH v_role IN ARRAY roles LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      RAISE EXCEPTION 'PRIV_SWEEP INCONCLUSIVE — role "%" does not exist in this database. Nothing below was checked for it.', v_role;
    END IF;
  END LOOP;

  -- ---------- Column-level privileges ----------
  -- Driven off information_schema.columns, NOT role_column_grants. A column left
  -- on the schema default has no explicit ACL entry, so it does not appear in
  -- role_column_grants at all — and the column nobody thought about is exactly
  -- the one this sweep exists to find.
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    FOREACH v_role IN ARRAY roles LOOP
      FOREACH v_priv IN ARRAY col_privs LOOP

        SELECT count(*),
               count(*) FILTER (
                 WHERE has_column_privilege(v_role, format('public.%I', r.table_name), col.column_name, v_priv)
                   AND NOT (v_role||'|'||r.table_name||'|'||col.column_name||'|'||v_priv = ANY (baseline_columns))
               )
          INTO v_cols_total, v_undeclared
        FROM information_schema.columns col
        WHERE col.table_schema = 'public' AND col.table_name = r.table_name;

        n_checks := n_checks + v_cols_total;

        IF v_undeclared > 0 THEN
          -- One line when the whole table is open, which is what a table-level
          -- grant looks like. Listing it column by column turns a single fact
          -- into fifteen lines and buries the ones that matter.
          IF v_undeclared = v_cols_total THEN
            findings := array_append(findings, format('%s|WIDER THAN DECLARED: %s can %s every column of %s (%s cols)',
              CASE WHEN v_role = 'anon' THEN 2 ELSE 3 END, v_role, v_priv, r.table_name, v_cols_total));
          ELSE
            findings := array_append(findings, format('%s|WIDER THAN DECLARED: %s can %s %s of %s columns of %s — %s',
              CASE WHEN v_role = 'anon' THEN 2 ELSE 3 END, v_role, v_priv, v_undeclared, v_cols_total, r.table_name,
              (SELECT string_agg(col.column_name, ', ' ORDER BY col.ordinal_position)
               FROM information_schema.columns col
               WHERE col.table_schema = 'public' AND col.table_name = r.table_name
                 AND has_column_privilege(v_role, format('public.%I', r.table_name), col.column_name, v_priv)
                 AND NOT (v_role||'|'||r.table_name||'|'||col.column_name||'|'||v_priv = ANY (baseline_columns)))));
          END IF;
        END IF;

        -- The baseline is also wrong when it promises a privilege the app needs
        -- and the database does not actually have. That breaks the app, and a
        -- sweep that only looks for "too much" would report it as clean.
        FOR v_key IN
          SELECT col.column_name FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = r.table_name
            AND (v_role||'|'||r.table_name||'|'||col.column_name||'|'||v_priv = ANY (baseline_columns))
            AND NOT has_column_privilege(v_role, format('public.%I', r.table_name), col.column_name, v_priv)
        LOOP
          findings := array_append(findings, format('1|MISSING: baseline declares %s may %s %s.%s, but it cannot — the app is broken, not just loose',
            v_role, v_priv, r.table_name, v_key));
        END LOOP;

      END LOOP;
    END LOOP;
  END LOOP;

  -- ---------- Table-level privileges + RLS ----------
  FOR r IN
    SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    n_tables := n_tables + 1;

    -- A table with default grants and no RLS is readable and writable by anon
    -- with nothing in the way at all. This is the single check that catches the
    -- table you added and forgot to harden, and it outranks everything else.
    IF NOT r.relrowsecurity THEN
      findings := array_append(findings, format('0|RLS DISABLED: public.%s — with Supabase default grants this table is fully exposed to anon', r.table_name));
    END IF;

    FOREACH v_role IN ARRAY roles LOOP
      FOREACH v_priv IN ARRAY tbl_privs LOOP
        n_checks := n_checks + 1;
        v_key := v_role || '|' || r.table_name || '|' || v_priv;
        IF has_table_privilege(v_role, format('public.%I', r.table_name), v_priv)
           AND NOT (v_key = ANY (baseline_tables)) THEN
          findings := array_append(findings, format('%s|WIDER THAN DECLARED: %s can %s on %s',
            CASE WHEN v_role = 'anon' THEN 2 ELSE 3 END, v_role, v_priv, r.table_name));
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- ---------- Function EXECUTE ----------
  -- The same default privileges hand anon EXECUTE on every new function in
  -- public. A SECURITY DEFINER function left on the default is a public endpoint
  -- running as its owner.
  FOR r IN
    SELECT p.oid, p.proname, p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  LOOP
    FOREACH v_role IN ARRAY roles LOOP
      n_checks := n_checks + 1;
      v_key := v_role || '|' || r.proname;
      IF has_function_privilege(v_role, r.oid, 'EXECUTE')
         AND NOT (v_key = ANY (baseline_functions)) THEN
        -- anon reaching a SECURITY DEFINER function is the worst thing this sweep
        -- can find: an unauthenticated endpoint running as the function's owner,
        -- with RLS not in the picture. Ranked above everything but RLS being off.
        findings := array_append(findings, format('%s|WIDER THAN DECLARED: %s can EXECUTE %s()%s',
          CASE WHEN v_role = 'anon' AND r.prosecdef THEN 0
               WHEN v_role = 'anon' THEN 2
               ELSE 3 END,
          v_role, r.proname, CASE WHEN r.prosecdef THEN ' [SECURITY DEFINER]' ELSE '' END));
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(findings, 1) IS NULL THEN
    RAISE NOTICE 'PRIV_SWEEP PASS — % checks across % tables, live privileges match the declared baseline', n_checks, n_tables;
  ELSE
    SELECT array_agg(msg ORDER BY rank, msg) INTO fails
    FROM (
      SELECT split_part(f, '|', 1)::int AS rank,
             substr(f, strpos(f, '|') + 1) AS msg
      FROM unnest(findings) AS f
    ) s;

    RAISE EXCEPTION E'PRIV_SWEEP FAIL — % findings over % checks, worst first:\n  %\n\nIf a line is deliberate, add it to the baseline at the top of this file, so the next person reading the diff can see it was a decision and not a drift.',
      array_length(fails, 1), n_checks, array_to_string(fails, E'\n  ');
  END IF;
END $$;


-- ============================================================
-- BASELINE GENERATOR
--
-- Run this when you add tables, then READ every line before pasting it into the
-- arrays above. A baseline you generated without reading is not a baseline, it
-- is a snapshot of whatever the database happens to allow today — including the
-- grant somebody added by hand at 11pm to make an error go away.
-- ============================================================
--
-- SELECT string_agg(DISTINCT quote_literal(line), E',\n' ORDER BY quote_literal(line)) AS baseline_columns
-- FROM (
--   SELECT r.role || '|' || c.table_name || '|' || c.column_name || '|' || p.priv AS line
--   FROM information_schema.columns c
--   JOIN information_schema.tables t
--     ON t.table_schema = c.table_schema AND t.table_name = c.table_name
--   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
--   CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS p(priv)
--   WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
--     AND has_column_privilege(r.role, format('public.%I', c.table_name), c.column_name, p.priv)
-- ) s;
