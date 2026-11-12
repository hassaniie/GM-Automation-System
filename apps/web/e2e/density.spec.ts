/* Device sizes (design system step C): controls are 36 px with a mouse, at least 44 px on touch screens and
   56 px with "Large touch targets"; the line display keeps its layout on a 4K TV with text twice the size. */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { settle, stabilise } from './stable';

async function story(browser: Browser, touch: boolean, large = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await stabilise(page);
  if (large) await page.addInitScript(() => localStorage.setItem('mg-touch', 'large'));
  await page.goto('/iframe.html?id=components-core--buttons&viewMode=story');
  await page.locator('.ds-btn').first().waitFor();
  if (large) await page.evaluate(() => { document.documentElement.dataset.touch = 'large'; });
  return page;
}
/** Heights of the medium buttons, and whether the page reports a coarse pointer. */
const measure = (page: Page) => page.evaluate(() => ({
  coarse: matchMedia('(pointer: coarse)').matches,
  heights: [...document.querySelectorAll('.ds-btn--md')].map((b) => Math.round(b.getBoundingClientRect().height)),
}));

test('mouse: medium controls are 36 px', async ({ browser }) => {
  const m = await measure(await story(browser, false));
  expect(m.coarse).toBe(false);
  expect(new Set(m.heights)).toEqual(new Set([36]));
});

test('touch screen: controls are at least 44 px', async ({ browser }) => {
  const m = await measure(await story(browser, true));
  expect(m.coarse).toBe(true);
  expect(Math.min(...m.heights)).toBeGreaterThanOrEqual(44);
});

test('large touch targets: controls are at least 56 px', async ({ browser }) => {
  const m = await measure(await story(browser, true, true));
  expect(Math.min(...m.heights)).toBeGreaterThanOrEqual(56);
});

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
async function lineDisplay(browser: Browser, width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  await stabilise(page);
  await page.goto(FILE + '#/display/final');
  await page.locator('.lcd').waitFor();
  await settle(page);
  return page.evaluate(() => {
    const lcd = document.querySelector('.lcd') as HTMLElement;
    const cells = [...lcd.querySelectorAll('.lcd-cell')].map((c) => c.getBoundingClientRect());
    const text: Record<string, number> = {};
    for (const e of lcd.querySelectorAll('*')) {
      if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) text[`${e.tagName}.${e.className}`] = parseFloat(getComputedStyle(e).fontSize);
    }
    return {
      fits: lcd.scrollHeight <= innerHeight + 1 && lcd.scrollWidth <= innerWidth + 1,
      cells: cells.length, rows: new Set(cells.map((r) => Math.round(r.top / innerHeight * 100))).size, text,
    };
  });
}

test('line display: same layout at 1080p and 4K, text twice the size', async ({ browser }) => {
  const hd = await lineDisplay(browser, 1920, 1080), uhd = await lineDisplay(browser, 3840, 2160);
  expect(hd.fits && uhd.fits).toBe(true);
  expect([uhd.cells, uhd.rows]).toEqual([hd.cells, hd.rows]);
  const notScaled = Object.keys(hd.text).filter((k) => Math.abs(uhd.text[k] / hd.text[k] - 2) > 0.1);
  expect(notScaled, 'text that does not double on a 4K TV').toEqual([]);
});

test('touch screen: small floor controls take a tap 21 px around their centre', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(FILE);
  await page.getByText('Hamza Siddiqui').click();
  await page.locator('.si-go').click();
  await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
  await page.evaluate(() => { location.hash = '#/floor'; });
  await page.locator('.strip .views button').first().waitFor();
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const sel of ['.strip .views button', '.lane-h', '.ubtn', '.alarm-pill']) {
      for (const el of [...document.querySelectorAll(sel)].slice(0, 2)) {
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const [x, y] of [[cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy]]) {
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(el === hit || el.contains(hit))) { out.push(`${sel} misses a tap at ${Math.round(x - cx)},${Math.round(y - cy)}`); break; }
        }
      }
    }
    return out;
  });
  expect(small).toEqual([]);
  await ctx.close();
});
