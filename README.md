# expo-supabase-pro (lite)

A production-ready **Expo + Supabase** starter, battle-tested in real apps. Auth,
offline sync, and the session-handling edge cases already solved — so you can ship
your idea instead of your plumbing.

This is the **free, open-source (MIT) lite version**. A [**Pro version**](#pro-version)
adds the shared-groups feature, the private-or-shared data pattern, RLS hardening,
an edge-function template, and a "12 common mistakes" guide.

- **Stack:** Expo SDK 57 · Expo Router · TypeScript · Zustand · Supabase · Jest
- **Targets:** Android, iOS, and Web (react-native-web, single-page app)

---

## Features (lite)

| | |
|---|---|
| **Email auth** | Sign up, sign in, sign out, password reset — wired end to end. |
| **Google OAuth** | Separate web (redirect) and native (PKCE) flows that actually work. |
| **Session handling** | Synchronous `onAuthStateChange`, account-switch detection, offline-safe sign out. |
| **Navigation guard** | One guard redirects by session/recovery state, no flicker on boot. |
| **`withTimeout`** | Wrap every query so supabase-js can't hang forever after mobile doze. |
| **Durable offline queue** | Persisted write queue with coalescing + exponential backoff. Generic by handler. |
| **Tests** | Jest (`jest-expo`) with example unit tests + a typecheck script. |

---

## Quick start

```bash
# 1. Install
npm install

# 2. Create a Supabase project at https://supabase.com/dashboard
#    then run supabase/migrations/001_initial_schema.sql (SQL Editor).

# 3. Configure env
cp .env.example .env
#    Fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
#    (Dashboard → Project Settings → Data API / API Keys).

# 4. Run
npx expo start          # scan the QR with Expo Go (Android)
npx expo start --web    # or run it in the browser
```

That's it — sign up, and you're in.

---

## Setup guides

### Google OAuth
1. **Google Cloud Console** → create a project → **OAuth consent screen** (External, add your email as a test user).
2. **Credentials → Create OAuth client ID → Web application**. Under *Authorized redirect URIs* add:
   ```
   https://<your-ref>.supabase.co/auth/v1/callback
   ```
   Copy the **Client ID** and **Client Secret**.
3. **Supabase → Authentication → Providers → Google**: enable it, paste the Client ID + Secret.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**: add your app's redirect URIs. For web dev:
   ```
   http://localhost:8081
   http://localhost:8081/**
   ```
   For native, add your scheme: `exposupabasepro://`.

### Password recovery
The reset email links to a **web page** (mobile completes the reset on the web). Set `EXPO_PUBLIC_RESET_REDIRECT_URL` to that page's URL, and add it to the Supabase Redirect URLs allowlist. On web, `detectSessionInUrl` (already enabled) parses the token and fires the `PASSWORD_RECOVERY` event, which routes the user to the reset screen.

---

## Project structure

```
src/
  app/                     # Expo Router routes
    _layout.tsx            # root layout + NavigationGuard
    index.tsx              # authenticated home
    (auth)/                # sign-in, register, forgot-password
    reset-password.tsx     # password recovery
  hooks/use-auth.ts        # session boot, listener, auth actions
  lib/
    supabase.ts  withTimeout.ts  store.ts  confirm.ts  googleAuth.ts
    syncQueue.ts           # durable offline queue
supabase/
  migrations/001_initial_schema.sql
```

---

## Testing

```bash
npm test           # jest
npm run typecheck  # tsc (app + tests)
```

---

## Web / SPA note

`app.json` sets `web.output: "single"` (SPA). An auth-gated app can't be statically
prerendered — Supabase's session lives in the browser, so server-side rendering
hits `window is not defined`. SPA is the right default here.

---

## Pro version

The Pro version adds the features most apps eventually need, already built and
security-audited:

- **Shared groups** — create/join by invite code, members, ownership transfer.
- **Private-or-shared data pattern** — the exact RLS recipe for data that's private
  or shared with a group, with a working `notes` demo.
- **Column-level hardening** — hide sensitive columns from the auto REST API.
- **Edge function template** — a shared-secret authenticated endpoint (webhook/cron).
- **"12 common mistakes" guide** — the Expo + Supabase pitfalls that cost real
  debugging time, with symptom → cause → fix → code.

👉 **Get the Pro version:** <your-gumroad-link>

---

## License

MIT — see [LICENSE](LICENSE). Provided "as is", without warranty; you're responsible
for auditing and securing anything you ship.
