import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAppStore, type Profile } from '@/lib/store';
import { withTimeout } from '@/lib/withTimeout';

/**
 * Extension point: register a callback that runs when the active user changes
 * (login, logout, or account switch on the same device). Use it to clear your
 * app's user-scoped caches (stores, timers, queries).
 *
 *   onUserChange((prevUserId, nextUserId) => { clearMyCaches(prevUserId) })
 *
 * `nextUserId` is undefined on logout.
 */
type UserChangeHandler = (prevUserId: string | undefined, nextUserId: string | undefined) => void;
const userChangeHandlers = new Set<UserChangeHandler>();
export function onUserChange(handler: UserChangeHandler): () => void {
  userChangeHandlers.add(handler);
  return () => userChangeHandlers.delete(handler);
}
function emitUserChange(prev: string | undefined, next: string | undefined) {
  userChangeHandlers.forEach((h) => {
    try {
      h(prev, next);
    } catch {
      // a handler that throws must not take down the auth flow
    }
  });
}

// Clears the whole local session without relying on the network.
// supabase.auth.signOut() — even with scope:'local' — makes a fetch to
// /auth/v1/logout that hangs offline. This helper clears the store + the gotrue
// tokens in AsyncStorage so logout works without a connection.
async function clearLocalSession(exitingUserId: string | undefined): Promise<void> {
  const { setSession, setLastUserId, reset } = useAppStore.getState();
  setSession(null);
  setLastUserId(null);
  reset();
  emitUserChange(exitingUserId, undefined);
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sbKeys = keys.filter((k) => k.startsWith('sb-') && k.includes('auth-token'));
    if (sbKeys.length > 0) await AsyncStorage.multiRemove(sbKeys);
  } catch (e) {
    if (__DEV__) console.warn('[clearLocalSession storage cleanup]', e);
  }
}

async function fetchProfile(userId: string, email: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('id', userId)
    .single();
  if (!data) return null;
  return { ...data, email } as Profile;
}

/**
 * Mount this hook ONCE, in the root layout. It boots the session, listens for
 * auth changes, and keeps the store in sync.
 */
export function useAuthListener() {
  const { session, setSession, setProfile, setHydrated, setLastUserId, resetUserData, reset } =
    useAppStore();

  // Initial boot + auth listener.
  useEffect(() => {
    async function init() {
      try {
        const result = await withTimeout(supabase.auth.getSession(), 8000);
        setSession(result.data.session);
      } catch (e) {
        if (__DEV__) console.warn('[auth init timeout]', e);
      } finally {
        setHydrated();
      }
    }
    void init();

    // SYNCHRONOUS callback — no async, no queries inside. The Supabase docs warn
    // that running awaits/queries inside the callback can deadlock.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        const exitingUserId = useAppStore.getState().session?.user?.id;
        setSession(null);
        setLastUserId(null);
        reset();
        emitUserChange(exitingUserId, undefined);
      } else if (event === 'PASSWORD_RECOVERY') {
        // Recovery link (web): a temporary session used only to change the
        // password. Set recoveryMode → the guard forces the reset screen.
        setSession(newSession);
        useAppStore.getState().setRecoveryMode(true);
      } else if (newSession) {
        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION with a session.
        setSession(newSession);
      }
      // Other events with newSession=null: don't touch the store (keep persisted).
    });

    // AppState: only refresh tokens while the app is active.
    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.unsubscribe();
      appStateSub.remove();
    };
    // Mount-once by design: the listener has to be installed exactly one time,
    // and everything it touches is module-level and stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profile fetch + account-switch detection — decoupled from the callback.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const { lastUserId } = useAppStore.getState();
    if (lastUserId && lastUserId !== userId) {
      // Account switch on the same device → clear user-scoped data.
      resetUserData();
      emitUserChange(lastUserId, userId);
    }
    setLastUserId(userId);

    let cancelled = false;
    void (async () => {
      try {
        const profile = await withTimeout(fetchProfile(userId, session?.user?.email ?? ''), 8000);
        if (!cancelled) setProfile(profile);
      } catch (e) {
        if (__DEV__) console.warn('[profile fetch failed]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the user id alone on purpose: the session object gets a new
    // identity on every token refresh, and the profile only changes when the
    // user does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);
}

// ---- Auth actions (generic, timeout-wrapped) ----

export async function signIn(email: string, password: string) {
  const { error } = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    12000
  );
  if (error) throw error;
}

export async function signUp(email: string, password: string, displayName: string) {
  const { error } = await withTimeout(
    supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    }),
    12000
  );
  if (error) throw error;
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined),
    12000
  );
  if (error) throw error;
}

export async function setNewPassword(password: string) {
  const { error } = await withTimeout(supabase.auth.updateUser({ password }), 12000);
  if (error) throw error;
}

export async function signOut() {
  const exitingUserId = useAppStore.getState().session?.user?.id;
  await clearLocalSession(exitingUserId);
  // Best-effort server logout (3s timeout). If it fails offline it doesn't
  // matter: local state is already clean and the refresh token expires by TTL.
  void withTimeout(supabase.auth.signOut({ scope: 'local' }).catch(() => {}), 3000).catch(() => {});
}

export async function deleteAccount(): Promise<void> {
  const exitingUserId = useAppStore.getState().session?.user?.id;
  const { error } = await withTimeout(supabase.rpc('delete_own_account'), 15000);
  if (error) throw error;
  await clearLocalSession(exitingUserId);
  void withTimeout(supabase.auth.signOut({ scope: 'local' }).catch(() => {}), 3000).catch(() => {});
}
