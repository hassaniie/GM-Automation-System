/* Accessibility (design system step C): axe over every Storybook story and the key screens, in both
   themes. Serious and critical violations fail the build. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { settle, stabilise } from './stable';

const THEMES = ['dark', 'light'] as const;
const STORIES = Object.values(JSON.parse(readFileSync(resolve(process.cwd(), 'storybook-static/index.json'), 'utf8')).entries as Record<string, { id: string; type: string }>)
  .filter((e) => e.type === 'story').map((e) => e.id);

async function serious(page: Page, include?: string) {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  if (include) b = b.include(include);
  const { violations } = await b.analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} · ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}${v.nodes.length > 3 ? ` +${v.nodes.length - 3}` : ''}`);
}

test.describe('stories', () => {
  for (const id of STORIES) for (const theme of THEMES) {
    test(`${id} · ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await stabilise(page);
      await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
      await page.locator('#storybook-root > *').first().waitFor();
      await settle(page);
      expect(await serious(page, '#storybook-root')).toEqual([]);
    });
  }
});

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
test.describe('screens', () => {
  for (const theme of THEMES) {
    test(`key screens · ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await stabilise(page);
      await page.goto(FILE);
      expect(await serious(page), 'sign-in').toEqual([]);
      await page.getByText('Hamza Siddiqui').click();
      await page.locator('.si-go').click();
      await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
      const found: Record<string, string[]> = {};
      for (const r of ['floor', 'dash', 'display/final', 'reports', 'admin/takt', 'admin/users', 'how']) {
        await page.evaluate((r) => { location.hash = '#/' + r; }, r);
        await page.waitForTimeout(500);
        await settle(page);
        const v = await serious(page);
        if (v.length) found[r] = v;
      }
      // open states: menus, the station panel, the alarm drawer and a dialog (audit D3)
      await page.evaluate(() => { location.hash = '#/floor'; });
      await page.waitForTimeout(400);
      const opens: [string, () => Promise<void>][] = [
        ['user menu', () => page.locator('.ubtn').click()],
        ['tools menu', () => page.locator('.tools-menu > button, .tools-btn').first().click()],
        ['station panel', () => page.evaluate(() => (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ selection: { kind: 'pos', id: 'FL3' } }))],
        ['alarm drawer', () => page.evaluate(() => (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ selection: null, drawer: 'active' }))],
        ['VIN dialog', () => page.evaluate(() => (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ drawer: null, dialog: { type: 'vin' } }))],
      ];
      for (const [name, open] of opens) {
        await open();
        await page.waitForTimeout(400);
        const v = await serious(page);
        if (v.length) found[name] = v;
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      expect(found).toEqual({});
    });
  }
});
