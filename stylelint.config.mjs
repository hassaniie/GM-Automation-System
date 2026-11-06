/* Design-system guardrails for CSS (Andon DS release 1).
   - corners only from the radius tokens, everywhere;
   - in the token files only: raw colours; elsewhere colours come from tokens;
   - stacking only from the named z-index layers.
   The legacy stylesheet (apps/web/src/styles/app.css) still has raw colours and z-index numbers: warnings
   there until it is migrated (design system steps C–E), errors everywhere else. */
const radius = ['/var\\(--ds-radius-(sm|md|round)\\)/', '0', 'inherit', 'calc(var(--box-r, var(--ds-radius-md)) - var(--tick-inset))'];
const z = ['/var\\(--ds-z-[a-z-]+\\)/', 'auto', '0', '1', '2', '-1'];

export default {
  rules: {
    'color-no-hex': true,
    'declaration-property-value-allowed-list': { 'border-radius': radius, 'z-index': z },
  },
  overrides: [
    { files: ['apps/web/src/styles/tokens/**/*.css'], rules: { 'color-no-hex': null } },
    {
      files: ['apps/web/src/styles/app.css'],
      rules: {
        'color-no-hex': [true, { severity: 'warning' }],
        'declaration-property-value-allowed-list': [{ 'border-radius': radius, 'z-index': z }, { severity: 'warning' }],
      },
    },
  ],
};
