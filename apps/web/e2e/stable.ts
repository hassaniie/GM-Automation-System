/* Shared set-up for the screenshot and accessibility tests: the same fonts, clock and plant on every
   machine, so a baseline made locally matches a run in CI. */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const FONTS: [string, string, number[]][] = [
  ['Barlow', '@fontsource/barlow', [300, 400, 500, 600, 700]],
  ['JetBrains Mono', '@fontsource/jetbrains-mono', [400, 500, 600]],
];
const files = new Map<string, Buffer>();
let css = '';
for (const [family, pkg, weights] of FONTS) {
  const dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  const slug = pkg.split('/')[1];
  for (const w of weights) {
    const name = `${slug}-latin-${w}-normal.woff2`;
    files.set(name, readFileSync(join(dir, name)));
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:block;src:url(https://fonts.gstatic.com/local/${name}) format('woff2')}\n`;
  }
}

/** Serve Barlow and JetBrains Mono from node_modules instead of Google Fonts, and fix the date. */
export async function stabilise(page: Page) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://fonts.gstatic.com/**', (r) => {
    const body = files.get(r.request().url().split('/').pop() || '');
    return body ? r.fulfill({ contentType: 'font/woff2', body }) : r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-11-05T09:50:00'));
}

/** Wait for web fonts, then for layout to settle. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
}
