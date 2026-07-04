import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { setNewPassword } from '@/hooks/use-auth';
import { useAppStore } from '@/lib/store';
import { authStyles as s } from '@/components/auth-styles';

/**
 * Password recovery screen. Shown when the user arrives from the email link
 * (PASSWORD_RECOVERY event → recoveryMode in the store). Sets the new password
 * and exits recovery mode. Mostly relevant on web, where `detectSessionInUrl`
 * parses the token from the URL hash.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const setRecoveryMode = useAppStore((s) => s.setRecoveryMode);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleReset() {
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      await setNewPassword(password);
      setRecoveryMode(false);
      router.replace('/');
    } catch (e: any) {
      setError(e?.message ?? 'Could not update the password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.inner}>
        <Text style={s.title}>New password</Text>
        <Text style={s.subtitle}>Choose a new password for your account</Text>

        <View style={s.form}>
          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="At least 6 characters"
            placeholderTextColor="#9aa0aa"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError('');
            }}
            secureTextEntry
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity
            style={[s.button, loading && s.disabled]}
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Save password</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
