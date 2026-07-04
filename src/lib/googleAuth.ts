import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';

/**
 * Google login via Supabase OAuth in Expo/React Native.
 *
 * The native flow is longer than a simple `signInWithOAuth` because on native you
 * have to:
 *   1. open the auth browser and wait for the redirect back into the app,
 *   2. recover the redirect URL (result.url, or the Linking listener as a
 *      fallback when it comes back empty),
 *   3. exchange the `code` for a session (PKCE) — or, if the provider returned
 *      tokens in the hash instead of a code, call setSession with those tokens.
 *
 * One-time configuration:
 *   - Supabase → Authentication → Providers → Google (client id/secret).
 *   - Supabase → Authentication → URL Configuration → add the app's redirect URI
 *     to the allowlist. In dev, log `makeRedirectUri()` to see it.
 *   - `scheme` in app.json (already set by the scaffold).
 *
 * Throws on cancel/failure; resolves void on success (the session ends up set in
 * supabase-js and the useAuth listener picks it up).
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectUri = makeRedirectUri();

  // WEB: the correct flow is to redirect the whole page to Google and let
  // supabase-js complete the exchange on return (detectSessionInUrl=true on web).
  // We do NOT use openAuthSessionAsync here (that's for native). After the
  // redirect no more code runs: the page reloads and the useAuth listener picks
  // up the session. `redirectTo` must be in Supabase's allowlist (e.g. the origin).
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUri },
    });
    if (error) throw error;
    return;
  }

  let urlFromLink: string | null = null;
  const linkSub = Linking.addEventListener('url', ({ url }) => {
    urlFromLink = url;
  });

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      }),
      15000
    );
    if (error || !data?.url) throw error ?? new Error('Could not start Google sign-in.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    let url: string | null = result.type === 'success' ? result.url : null;

    // Fallback: some environments deliver the URL through the Linking listener.
    if (!url) {
      for (let i = 0; i < 30 && !urlFromLink; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      url = urlFromLink;
    }
    if (!url) {
      // Last resort: maybe the session got set already.
      const { data: sd } = await withTimeout(supabase.auth.getSession(), 10000);
      if (sd?.session) return;
      throw new Error('Google sign-in did not complete.');
    }

    // PKCE case: ?code=...
    const codeMatch = /[?&]code=([^&]+)/.exec(url);
    if (codeMatch) {
      const code = decodeURIComponent(codeMatch[1]);
      const { error: exErr } = await withTimeout(supabase.auth.exchangeCodeForSession(code), 15000);
      if (exErr) throw exErr;
      return;
    }

    // Implicit case: tokens in the hash #access_token=...&refresh_token=...
    const hashIdx = url.indexOf('#');
    if (hashIdx !== -1) {
      const params = new URLSearchParams(url.slice(hashIdx + 1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { error: setErr } = await withTimeout(
          supabase.auth.setSession({ access_token, refresh_token }),
          10000
        );
        if (setErr) throw setErr;
        return;
      }
    }

    throw new Error('Google sign-in did not return a valid session.');
  } finally {
    linkSub.remove();
  }
}
