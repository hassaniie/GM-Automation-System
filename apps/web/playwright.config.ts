import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off', deviceScaleFactor: 1, launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
});
