import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation. Returns a promise that resolves to `true` if the
 * user accepts.
 *
 * Why it exists: React Native's `Alert.alert` does NOT work on react-native-web
 * (it renders no buttons and fires no callbacks). On web we use `window.confirm`.
 * Wrapping both in a promise gives a single call for the whole app:
 *
 *   if (await confirm('Sign out', 'Are you sure?')) doThing();
 */
export function confirm(
  title: string,
  message?: string,
  { confirmText = 'OK', cancelText = 'Cancel', destructive = false } = {}
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(text) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
