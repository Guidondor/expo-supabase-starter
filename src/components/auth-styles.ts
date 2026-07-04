import { StyleSheet } from 'react-native';

/**
 * Shared styles for the auth screens (login, register, forgot, reset).
 * Neutral palette with an indigo accent — swap the colors for your brand's.
 */
export const authStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 30, fontWeight: '800', color: '#141824', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e6e8ec',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e0e2e7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#141824',
  },
  error: { color: '#dc2626', fontSize: 13, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  linkMuted: { color: '#6b7280', fontSize: 13, textAlign: 'center', marginTop: 14 },
  link: { color: '#4f46e5', fontWeight: '700' },
  footerText: { textAlign: 'center', color: '#6b7280', fontSize: 14, marginTop: 22 },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#e6e8ec' },
  separatorText: { color: '#9aa0aa', fontSize: 12 },
  googleButton: {
    marginTop: 16,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7dae0',
  },
  googleButtonText: { fontSize: 15, fontWeight: '600', color: '#141824' },
});
