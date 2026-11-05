import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120000,
    include: ['packages/*/test/**/*.test.{js,ts}', 'apps/*/test/**/*.test.{js,ts}'],
  },
});
