// React Native injects __DEV__ at runtime. Expo generates `expo-env.d.ts` with
// this declaration, but that file is gitignored (it's build output), so a fresh
// clone fails `npm run typecheck` until you've run the app once. Declaring it
// here keeps a clean clone typechecking straight away.
declare const __DEV__: boolean;
