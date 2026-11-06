/* Design-system guardrails for CSS (Andon DS release 1).
   - corners only from the radius tokens, everywhere;
   - in the token files only: raw colours; elsewhere colours come from tokens;
   - stacking only from the named z-index layers;
   - in the design-system styles (styles/ds): spacing only from the 4-px scale tokens, plus 1–3 px optical nudges.
   The legacy stylesheet (apps/web/src/styles/app.css) still has raw colours and z-index numbers: warnings
   there until it is migrated (design system steps C–E), errors everywhere else. */
const radius = ['/var\\(--ds-radius-(sm|md|round)\\)/', '0', 'inherit', 'calc(var(--box-r, var(--ds-radius-md)) - var(--tick-inset))'];
const z = ['/var\\(--ds-z-[a-z-]+\\)/', 'auto', '0', '1', '2', '-1'];
// each part of a spacing value: a space token, a component's own short property (--gap, --pad, set from the
// space tokens in ui/*.js), 0, auto, a 1–3 px nudge, or a calc() of those
const part = String.raw`(var\(--(ds-[a-z0-9-]+|[a-z]{1,4})\)|0|auto|-?[1-3]px|calc\([^)]*\)+)`;
const spacing = [new RegExp(String.raw`^${part}(\s+${part})*$`)];
const spacingProps = '/^(padding|margin|gap|row-gap|column-gap)(-(inline|block|top|bottom|left|right))?(-(start|end))?$/';

export default {
  rules: {
    'color-no-hex': true,
    'declaration-property-value-allowed-list': { 'border-radius': radius, 'z-index': z },
  },
  overrides: [
    { files: ['apps/web/src/styles/tokens/**/*.css'], rules: { 'color-no-hex': null } },
    { files: ['apps/web/src/styles/ds/**/*.css'], rules: { 'declaration-property-value-allowed-list': { 'border-radius': radius, 'z-index': z, [spacingProps]: spacing } } },
    {
      files: ['apps/web/src/styles/app.css'],
      rules: {
        'color-no-hex': [true, { severity: 'warning' }],
        'declaration-property-value-allowed-list': [{ 'border-radius': radius, 'z-index': z }, { severity: 'warning' }],
      },
    },
  ],
};
