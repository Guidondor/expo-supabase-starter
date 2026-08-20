// Flat config, committed on purpose. `expo lint` autogenerates one on first run
// when it's missing, which rewrites package.json and the lockfile mid-command
// and leaves the script non-reproducible.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    files: ['**/__tests__/**/*.ts'],
    rules: {
      // jest.mock() is hoisted above the imports, so its factory has to use
      // require() and has to sit before them. Both rules fight that.
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
    },
  },
];
