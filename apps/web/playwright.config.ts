import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL: 'http://127.0.0.1:6007',
    trace: 'off',
    deviceScaleFactor: 1,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  // the built Storybook (pnpm build-storybook), served for the story screenshots and axe scans
  webServer: { command: 'python3 -m http.server 6007 --bind 127.0.0.1 -d storybook-static', url: 'http://127.0.0.1:6007/index.json', reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'ignore' },
});
