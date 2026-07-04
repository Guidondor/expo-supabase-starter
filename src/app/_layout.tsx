import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { useAppStore } from '@/lib/store';
import { useAuthListener } from '@/hooks/use-auth';

SplashScreen.preventAutoHideAsync();

/**
 * Single navigation guard. Redirects based on session state:
 *  - recoveryMode → password reset screen (from the email link)
 *  - no session   → (auth) group
 *  - session      → authenticated app (root)
 *
 * Does nothing until `hydrated` so we don't flash the login screen while the
 * boot (getSession + store rehydration) is still in progress.
 */
function NavigationGuard() {
  const { session, hydrated, recoveryMode } = useAppStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;

    const inAuth = segments[0] === '(auth)';
    const inReset = segments[0] === 'reset-password';

    if (recoveryMode) {
      if (!inReset) router.replace('/reset-password');
      return;
    }
    if (!session && !inAuth) {
      router.replace('/sign-in');
    } else if (session && inAuth) {
      router.replace('/');
    }
  }, [session, hydrated, recoveryMode, segments[0]]);

  return null;
}

export default function RootLayout() {
  const hydrated = useAppStore((s) => s.hydrated);

  useAuthListener();

  useEffect(() => {
    if (hydrated) void SplashScreen.hideAsync();
  }, [hydrated]);

  // Safety net: never leave the splash forever if hydrated never arrives.
  useEffect(() => {
    const timer = setTimeout(() => void SplashScreen.hideAsync(), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </SafeAreaProvider>
  );
}
