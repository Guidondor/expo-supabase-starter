# Security

## Reporting

Found something? Email the address in `package.json` / the repo profile. Please
don't open a public issue for anything exploitable.

## Dependency advisories

`npm audit` is not clean on this template, and it won't be until Expo updates
its own build tooling. Here is exactly what's left and why we're not "fixing" it.

Two packages carry real advisories:

| Package | Severity | Reached through | Runs |
|---|---|---|---|
| `image-size` | high | `metro` (the bundler) | Build time |
| `uuid` | moderate | `xcode` → `@expo/config-plugins` | Build time (native prebuild) |

Both are denial-of-service issues in code that runs on **your machine while
bundling**, not in the app your users install. Metro and the config plugins are
not part of the JavaScript bundle that ships to a device, so neither advisory is
reachable from your app at runtime.

The only remediation npm offers is `npm audit fix --force`, which installs
`expo@53` — a two-major-version downgrade. We tested forcing newer versions with
`overrides` instead: `uuid@11` breaks the web bundle outright
(`TypeError: The "list" argument must be an instance of SharedArrayBuffer…`),
and `image-size@2` breaks the export as well. Neither is worth shipping a broken
build for.

What we did do: `package.json` pins `brace-expansion` and `js-yaml` through
`overrides`, which clears those advisories with no effect on the build.

Re-check the current state yourself:

```bash
npm audit --omit=dev
```

If Expo has since released a version that resolves these, upgrading Expo is the
correct fix — not overriding the transitive dependency.

## Application security

The security this template actually gives you is at the database layer, and
that part is tested:

- Row-Level Security is enabled on every table, with policies split per
  operation and `WITH CHECK` on writes.
- Column-level grants restrict *which columns* a client can read and write.
  RLS gates rows, not columns — that distinction is the one most projects miss.
- `SECURITY DEFINER` functions revoke `EXECUTE` from `anon` and pin
  `search_path`.
- `supabase/tests/rls_smoke.sql` drops to the `authenticated` role, assumes a
  real user's identity inside a rolled-back transaction, and asserts they can
  see their own profile, cannot see anyone else's, cannot `SELECT *` past the
  revoked column, and cannot change an immutable one. It refuses to report a
  pass when the project holds fewer than two accounts, because with one account
  "sees no other rows" is true for lack of data rather than because RLS held.

Before shipping, run the smoke test against your own project and work through
the checklist at the end of the README.
