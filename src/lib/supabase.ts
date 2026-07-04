import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in the values (or set the env vars in your EAS profile).'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On web: true → supabase-js parses the token from the URL hash (e.g. the
    // password-recovery link that arrives by email). On native: false (it never
    // receives those links; the reset is completed on the web). Platform-gated.
    detectSessionInUrl: Platform.OS === 'web',
    // processLock serializes token refreshes across tabs/instances to avoid races
    // when refreshing the session (recommended by Supabase for RN/web).
    lock: processLock,
  },
});
