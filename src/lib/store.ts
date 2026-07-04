import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  created_at?: string;
}

interface AppState {
  // Auth
  session: Session | null;
  profile: Profile | null;
  // hydrated: the initial boot (getSession + persist rehydrate) has finished.
  // NavigationGuard does not redirect until this is true, to avoid flashing the
  // login screen.
  hydrated: boolean;
  // Last user id seen on this device. Used to detect an account switch and clear
  // user-scoped data before hydrating the new session.
  lastUserId: string | null;
  // Transient flag: a password-recovery session is active (from the email link).
  // The guard forces the reset screen while this is true. Not persisted.
  recoveryMode: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setHydrated: () => void;
  setLastUserId: (id: string | null) => void;
  setRecoveryMode: (v: boolean) => void;
  // Clears only the current user's data (account switch). Keeps `hydrated`.
  resetUserData: () => void;
  // Full session reset (sign out). Keeps `hydrated` (it's boot state).
  reset: () => void;
}

const initialState = {
  session: null,
  profile: null,
  hydrated: false,
  lastUserId: null as string | null,
  recoveryMode: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,

      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setHydrated: () => set({ hydrated: true }),
      setLastUserId: (lastUserId) => set({ lastUserId }),
      setRecoveryMode: (recoveryMode) => set({ recoveryMode }),

      resetUserData: () => set({ profile: null }),
      reset: () =>
        set((state) => ({
          ...initialState,
          hydrated: state.hydrated,
        })),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      // The session is NOT persisted here — supabase-js keeps it in its own
      // storage. `hydrated` is boot state, never persisted. We only persist
      // profile + lastUserId so the name is available on the next cold start.
      partialize: (state) => ({
        profile: state.profile,
        lastUserId: state.lastUserId,
      }),
      version: 1,
    }
  )
);
