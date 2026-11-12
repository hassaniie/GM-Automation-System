/* Reports → Print / PDF (audit B1): the whole report prints, on white, without the app chrome, even from dark theme. */
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;

test('the report prints in full, light, without the rail or top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto(FILE);
  await page.getByText('Hamza Siddiqui').click();
  await page.locator('.si-go').click();
  await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
  await page.evaluate(() => { location.hash = '#/reports'; });
  await page.locator('.ds-rail').waitFor();
  await page.waitForTimeout(600);

  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  const look = await page.evaluate(() => {
    const vis = (s: string) => [...document.querySelectorAll(s)].some((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
    const panel = document.querySelector('.page-scroll .ds-panel');
    return {
      rail: vis('.ds-rail'), hud: vis('header.hud'),
      bg: getComputedStyle(document.documentElement).getPropertyValue('--ds-bg').trim(),
      text: panel ? getComputedStyle(panel).color : '',
      height: document.documentElement.scrollHeight,
    };
  });
  expect(look.rail, 'rail printed').toBe(false);
  expect(look.hud, 'top bar printed').toBe(false);
  // dark text on the light page tokens
  const [r, g, b] = look.text.match(/\d+/g)!.map(Number);
  expect(r + g + b, `panel text ${look.text}`).toBeLessThan(300);

  const pdf = await page.pdf({ format: 'A4', landscape: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  expect(pages, 'pages in the PDF').toBeGreaterThan(1);
});
