import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-demo/**', '**/dist-edge/**', '**/node_modules/**', 'coverage/**', '**/storybook-static/**', '**/test-results/**', '**/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The safety net for the module migration: every name must be imported or declared.
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
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
    // Design system (step C): screens use the components in apps/web/src/ui, so the old patterns can't come back.
    files: ['apps/web/src/**/*.js'],
    ignores: ['apps/web/src/ui/**', 'apps/web/src/stories/**'],
    rules: {
      'no-restricted-syntax': ['error',
        { selector: 'TemplateElement[value.raw=/class="(btn|panel|field|tabs|toggle|result)[ "]/]', message: 'Use the design-system component (Button, Panel, Field, Tabs, Switch, Notice) from ui/index.js.' },
        { selector: 'TemplateElement[value.raw=/<(input|select|textarea)[ >]/]', message: 'Use the form components (TextInput, NumberInput, Select, Textarea …) inside a Field.' },
        { selector: 'TemplateElement[value.raw=/<table class="data/]', message: 'Use DataTable.' },
      ],
    },
  },
  {
    // TypeScript checks names itself (typescript-eslint recommends turning this off for .ts).
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/edge/**', '**/test/**', '*.config.{js,ts}', '**/vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
