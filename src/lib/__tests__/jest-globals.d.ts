// Forces jest's global types (describe/it/expect/jest) into the test program.
// Needed because Expo's base tsconfig doesn't auto-include @types/jest, and we
// don't want to restrict `types` (that would drop RN globals like __DEV__).
/// <reference types="jest" />
// `node` for the `require()` used to load the AsyncStorage mock. Scoped to the
// test program only (the app tsconfig excludes __tests__), so RN's own globals
// are never shadowed by Node's.
/// <reference types="node" />
