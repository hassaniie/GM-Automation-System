/* Visual regression (design system step C): every Storybook story in both themes, and the key screens
   at 1440 and 1920 px, compared with the committed baselines in e2e/__screenshots__.
   Update the baselines on purpose with:  pnpm --filter @mg/web test:visual --update-snapshots */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { settle, stabilise } from './stable';

const THEMES = ['dark', 'light'] as const;
const STORIES = Object.values(JSON.parse(readFileSync(resolve(process.cwd(), 'storybook-static/index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>)
  .filter((e) => e.type === 'story').map((e) => e.id);

test.describe('stories', () => {
  for (const id of STORIES) for (const theme of THEMES) {
    test(`${id} · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await stabilise(page);
      await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
      await page.locator('#storybook-root > *').first().waitFor();
      await settle(page);
      await expect(page).toHaveScreenshot(`story-${id}-${theme}.png`, { fullPage: true });
    });
  }
});

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
const SCREENS = ['floor', 'dash', 'display/final', 'reports', 'admin/takt', 'how'];
const SIZES = [[1440, 900], [1920, 1080]] as const;

async function plantAt0950(page: Page, theme: 'dark' | 'light') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await stabilise(page);
  await page.goto(FILE);
  await page.getByText('Hamza Siddiqui').click();
  await page.locator('.si-go').click();
  await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
  await page.evaluate(() => {
    const w = window as unknown as { __mg: { RT: { running: boolean; S: unknown } }; MGE: { runUntil: (s: unknown, t: number) => void } };
    w.__mg.RT.running = false; w.MGE.runUntil(w.__mg.RT.S, 9 * 3600 + 50 * 60);
  });
}

test.describe('screens', () => {
  for (const theme of THEMES) for (const [width, height] of SIZES) {
    test(`${width} · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await plantAt0950(page, theme);
      for (const r of SCREENS) {
        await page.evaluate((r) => { location.hash = '#/' + r; }, r);
        await page.waitForTimeout(r === 'floor' ? 1500 : 500);
        await settle(page);
        // the 3D floor and its labels are drawn by the GPU and differ between machines: hidden, the chrome over them is compared
        const hide = r === 'floor' ? await page.addStyleTag({ content: '#scene canvas, .anchors { visibility: hidden !important; }' }) : null;
        await expect(page).toHaveScreenshot(`screen-${r.replace('/', '_')}-${width}-${theme}.png`);
        await hide?.evaluate((el) => el.remove());
      }
    });
  }
});
