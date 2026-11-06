/* Layout guardrail (design system release 1): at every supported width, in both themes, the top bar
   never overflows or overlaps and keeps Calls, Alarms and the user menu on screen, and the station strip
   never scrolls. Runs against the single-file demo build (dist-demo/index.html). */
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
const WIDTHS = [1024, 1280, 1440, 1920, 2560];
const PAGES = ['floor', 'dash', 'reports', 'admin/takt'];

async function signIn(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(FILE);
  await page.getByText('Hamza Siddiqui').click();
  await page.locator('.si-go').click();
  await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
}

/** Problems with the top bar and strip on the current page, as readable strings. */
function problems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [], W = innerWidth;
    const hud = document.querySelector('header.hud');
    if (!hud) return ['no top bar'];
    if (hud.scrollWidth > hud.clientWidth + 1) out.push(`top bar content is ${hud.scrollWidth - hud.clientWidth}px wider than the bar`);
    const kids = [...hud.children].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => ({ name: e.className.toString().split(' ').slice(0, 2).join('.'), r: e.getBoundingClientRect() }));
    for (const k of kids) if (k.r.right > W + 1 || k.r.left < -1) out.push(`${k.name} is outside the window (${Math.round(k.r.left)}–${Math.round(k.r.right)} of ${W})`);
    for (let i = 1; i < kids.length; i++) if (kids[i].r.left < kids[i - 1].r.right - 1) out.push(`${kids[i - 1].name} and ${kids[i].name} overlap by ${Math.round(kids[i - 1].r.right - kids[i].r.left)}px`);
    for (const [sel, name] of [['.calls-pill', 'Calls'], ['.alarm-pill', 'Alarms'], ['.ubtn', 'user menu']] as const) {
      const e = hud.querySelector(sel); const r = e?.getBoundingClientRect();
      if (!e || !r || r.width === 0 || r.right > W + 1) out.push(`${name} is not fully visible`);
    }
    for (const sel of ['.strip', '.lanes', '.lane', '.cells']) for (const e of document.querySelectorAll(sel)) {
      if (e.scrollHeight > e.clientHeight + 1) out.push(`${sel} scrolls vertically (${e.scrollHeight} > ${e.clientHeight})`);
      if (e.scrollWidth > e.clientWidth + 1) out.push(`${sel} scrolls horizontally (${e.scrollWidth} > ${e.clientWidth})`);
    }
    return [...new Set(out)];
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`top bar and strip fit at every width (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, theme);
    const found: string[] = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: Math.round(w * 0.5625) });
      for (const p of PAGES) {
        await page.evaluate((h) => { location.hash = '#/' + h; }, p);
        await page.waitForTimeout(400);
        for (const x of await problems(page)) found.push(`${w}px ${p}: ${x}`);
      }
    }
    expect(found).toEqual([]);
  });
}
