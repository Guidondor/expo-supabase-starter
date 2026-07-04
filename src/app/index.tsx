import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@/lib/store';
import { signOut } from '@/hooks/use-auth';
import { confirm } from '@/lib/confirm';

/**
 * Authenticated home (placeholder). The NavigationGuard only lets you reach here
 * with a valid session. Replace this content with your app.
 */
export default function HomeScreen() {
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const name = profile?.display_name || session?.user?.email || 'there';

  async function confirmSignOut() {
    if (await confirm('Sign out', 'Are you sure you want to sign out?', { confirmText: 'Sign out', destructive: true })) {
      void signOut();
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.hello}>Hi, {name}</Text>
        <Text style={styles.sub}>You&apos;re signed in.</Text>
        <Text style={styles.email}>{session?.user?.email}</Text>

        <TouchableOpacity style={styles.button} onPress={confirmSignOut} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  hello: { fontSize: 26, fontWeight: '800', color: '#141824' },
  sub: { fontSize: 15, color: '#6b7280' },
  email: { fontSize: 13, color: '#9aa0aa', marginBottom: 28 },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 28,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
