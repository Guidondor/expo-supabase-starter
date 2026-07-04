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
import { Link } from 'expo-router';
import { requestPasswordReset } from '@/hooks/use-auth';
import { authStyles as s } from '@/components/auth-styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Web page where the user sets the new password (the email link points here).
// On mobile the reset is completed on the web; put your deploy's URL here.
// See README → "Password recovery".
const RESET_REDIRECT_URL = process.env.EXPO_PUBLIC_RESET_REDIRECT_URL;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setError('');
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email.');
    setLoading(true);
    try {
      await requestPasswordReset(email.trim(), RESET_REDIRECT_URL);
      setSent(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the email.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={[s.container, s.inner]}>
        <Text style={s.title}>Email sent</Text>
        <Text style={s.subtitle}>
          If an account exists for that email, you&apos;ll get a link to reset your password.
        </Text>
        <Link href="/sign-in" style={[s.link, { textAlign: 'center' }]}>
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.inner}>
        <Text style={s.title}>Reset your password</Text>
        <Text style={s.subtitle}>We&apos;ll email you a link to set a new one</Text>

        <View style={s.form}>
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

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity
            style={[s.button, loading && s.disabled]}
            onPress={handleSend}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Send link</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.footerText}>
          <Link href="/sign-in" style={s.link}>
            Back
          </Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
