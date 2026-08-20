// React Native declares __DEV__ in its own ambient types, but the test program
// only pulled those in transitively through Expo's generated files
// (expo-env.d.ts and .expo/types/). Both are gitignored build output, so on a
// fresh clone they don't exist yet and `npm run typecheck` fails until you've
// run the app once. Declaring it here keeps the check independent of anything
// generated.
declare const __DEV__: boolean;
