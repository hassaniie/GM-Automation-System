import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-demo/**', '**/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The safety net for the module migration: every name must be imported or declared.
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    // The rules (core) must run on a server with live devices: no simulator, no UI, no browser.
    files: ['packages/core/src/**', 'packages/contracts/src/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@mg/sim', '@mg/engine', '@mg/scene', '@mg/web', 'react', 'react-dom', 'three'], message: 'The rules must not depend on the simulator or the UI.' }] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage'],
    },
  },
  {
    files: ['**/test/**', '*.config.{js,ts}', '**/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
