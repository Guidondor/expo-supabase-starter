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
import { Link, useRouter } from 'expo-router';
import { signUp } from '@/hooks/use-auth';
import { authStyles as s } from '@/components/auth-styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleRegister() {
    setError('');
    if (!displayName.trim()) return setError('Enter a name.');
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      await signUp(email.trim(), password, displayName.trim());
      // If the project has email confirmation enabled, there's no session yet:
      // we show a notice. If it's disabled, useAuth picks up the session and the
      // guard redirects on its own.
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={[s.container, s.inner]}>
        <Text style={s.title}>Check your email</Text>
        <Text style={s.subtitle}>
          We sent you a link to confirm your account. After confirming, sign in.
        </Text>
        <TouchableOpacity style={s.button} onPress={() => router.replace('/sign-in')}>
          <Text style={s.buttonText}>Go to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.inner}>
        <Text style={s.title}>Create account</Text>
        <Text style={s.subtitle}>Get started in seconds</Text>

        <View style={s.form}>
          <Text style={s.label}>Name</Text>
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor="#9aa0aa"
            value={displayName}
            onChangeText={(v) => {
              setDisplayName(v);
              setError('');
            }}
            autoCapitalize="words"
          />

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@email.com"
            placeholderTextColor="#9aa0aa"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

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
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.footerText}>
          Already have an account?{' '}
          <Link href="/sign-in" style={s.link}>
            Sign in
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
