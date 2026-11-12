/* Layout guardrail (design system release 1): at every supported width (phone 390 px to 2560 px), in both themes, the top bar
   never overflows or overlaps and keeps Calls, Alarms, the user menu and the Bolt & Volt logo on screen, and the station strip
   never scrolls. Runs against the single-file demo build (dist-demo/index.html). */
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
const WIDTHS = [390, 768, 1024, 1280, 1440, 1920, 2560];
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
    for (const [sel, name] of [['.alarm-pill', 'Alerts'], ['.ubtn', 'user menu'], ['.bv-mark', 'Bolt & Volt logo']] as const) {
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
        await page.waitForSelector('header.hud', { timeout: 15_000 });
        await page.waitForTimeout(400);
        for (const x of await problems(page)) found.push(`${w}px ${p}: ${x}`);
      }
    }
    expect(found).toEqual([]);
  });
}

/** Elements inside a side panel that are wider than the panel (the panel would clip or scroll sideways). */
const sideways = (page: Page, sel: string) => page.evaluate((sel) => {
  const panel = document.querySelector(sel); if (!panel) return [`${sel} not open`];
  const R = panel.getBoundingClientRect();
  return [...panel.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > R.right + 1 || r.left < R.left - 1); })
    .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${e.className.toString().split(' ')[0]} (${(e as HTMLElement).innerText?.slice(0, 30) || ''})`);
}, sel);

test('station panel and alarm drawer never clip their content', async ({ page }) => {
  await signIn(page, 'dark');
  const found: string[] = [];
  for (const w of [1024, 1512, 2000]) {
    await page.setViewportSize({ width: w, height: Math.round(w * 0.65) });
    await page.evaluate(() => { const m = (window as unknown as { __mg: { Act: { raiseCall: (p: string, t: string, b: string) => void }; setUI: (u: object) => void } }).__mg; location.hash = '#/floor'; m.Act.raiseCall('FL7', 'SUP', 'test'); m.setUI({ selection: { kind: 'pos', id: 'FL7' }, drawer: null }); });
    await page.locator('.inspector').waitFor();
    await page.waitForTimeout(300);
    for (const x of await sideways(page, '.inspector')) found.push(`${w}px station panel: ${x}`);
    await page.evaluate(() => (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ selection: null, drawer: 'active' }));
    await page.locator('.drawer .ds-tabs').waitFor();
    await page.waitForTimeout(300);
    for (const x of await sideways(page, '.drawer .ds-tabs')) found.push(`${w}px drawer tabs: ${x}`);
    await page.evaluate(() => (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ drawer: null }));
  }
  expect(found).toEqual([]);
});

test('the open simulation console and Key never run under the page rail', async ({ page }) => {
  await signIn(page, 'dark');
  const found: string[] = [];
  for (const [w, h] of [[1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    // the two share the bottom-left corner, so they open one at a time; each is checked open
    for (const [ui, s] of [[{ simOpen: true, legend: false }, '.simcon-body'], [{ simOpen: false, legend: true }, '.legend-pop']] as const) {
    await page.evaluate((ui) => { location.hash = '#/floor'; (window as unknown as { __mg: { setUI: (u: object) => void } }).__mg.setUI({ ...ui, selection: null, drawer: null }); }, ui);
    await page.locator(s).waitFor();
    await page.waitForTimeout(300);
    found.push(...(await page.evaluate(([w, s]) => {
      const rail = document.querySelector('.ds-rail')?.getBoundingClientRect(); if (!rail) return [`${w}px: no rail`];
      return [s === '.simcon-body' ? '.simcon' : s].flatMap((s) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        const hit = r.left < rail.right && r.right > rail.left && r.top < rail.bottom && r.bottom > rail.top;
        return hit ? [`${w}px: ${s} overlaps the rail`] : [];
      });
    }, [w, s] as const)));
    }
  }
  expect(found).toEqual([]);
});

test('the top bar fits during a long status such as an emergency stop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'dark');
  await page.evaluate(() => { location.hash = '#/floor'; (window as unknown as { __mg: { Act: { emergency: (id: string, on: boolean) => void } } }).__mg.Act.emergency('CL2', true); });
  await page.waitForTimeout(600);
  const found: string[] = [];
  for (const w of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: Math.round(w * 0.6) });
    await page.waitForTimeout(500);
    for (const x of await problems(page)) found.push(`${w}px: ${x}`);
    found.push(...(await page.evaluate((w) => {
      const isl = document.querySelector('.state-island'); if (!isl) return [];
      const R = isl.getBoundingClientRect();
      const ms = [...isl.querySelectorAll('.metric')].filter((e) => getComputedStyle(e).display !== 'none');
      const out = ms.filter((e) => { const r = e.getBoundingClientRect(); return r.width === 0 || r.right > R.right + 1; })
        .map((e) => `${w}px: ${e.textContent} is hidden or cut off by the status area`);
      if (ms.length !== (w < 1280 ? 2 : 3)) out.push(`${w}px: ${ms.length} figures in the top bar`);
      if (document.querySelector('.hud .sim-tag:not(.down)')) out.push(`${w}px: simulation tag in the top bar`);
      return out;
    }, w)));
  }
  expect(found).toEqual([]);
});

test('phones: the Guide fits the screen and the line display stacks without overlaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'dark');
  await page.evaluate(() => { location.hash = '#/how'; });
  await page.locator('.page-scroll .ds-panel').first().waitFor();
  await page.waitForTimeout(400);
  const guide = await page.evaluate(() => { const s = document.querySelector('.page-scroll')!; return s.scrollWidth - s.clientWidth; });
  expect(guide, 'Guide is wider than the phone by').toBeLessThanOrEqual(1);
  await page.evaluate(() => { location.hash = '#/display/final'; });
  await page.locator('.lcd-calls').waitFor();
  await page.waitForTimeout(400);
  const gap = await page.evaluate(() => document.querySelector('.lcd-calls')!.getBoundingClientRect().top - document.querySelector('.lcd-st')!.getBoundingClientRect().bottom);
  expect(gap, 'calls panel overlaps the station tiles by').toBeGreaterThanOrEqual(0);
});

test('dashboard: all three line cards fit above the fold at 1440×900', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'light');
  await page.evaluate(() => { location.hash = '#/dash'; });
  await page.locator('.lcard').nth(2).waitFor();
  await page.waitForTimeout(400);
  const bottom = await page.evaluate(() => document.querySelectorAll('.lcard')[2].getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(900);
});

test('line displays: every cycle time and bar stays inside its card (Trim and Final)', async ({ page }) => {
  await signIn(page, 'dark');
  const found: string[] = [];
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const line of ['trim', 'final']) {
      await page.evaluate((l) => { location.hash = `#/display/${l}`; }, line);
      await page.locator('.lcd-cell').first().waitFor();
      await page.waitForTimeout(300);
      found.push(...(await page.evaluate(([w, line]) => [...document.querySelectorAll('.lcd-cell')].flatMap((c) => {
        const R = c.getBoundingClientRect();
        return [...c.querySelectorAll('.lc-cy, .lc-bar')].filter((e) => e.scrollWidth > (e as HTMLElement).clientWidth + 1 || e.getBoundingClientRect().right > R.right + 1)
          .map((e) => `${w}px ${line}: ${e.className} spills out of its card`);
      }), [w, line] as const)));
    }
  }
  expect(found).toEqual([]);
});

test('page screens show the MG badge behind the content; menus are glass', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'dark');
  for (const p of ['dash', 'reports', 'admin/takt', 'how']) {
    await page.evaluate((p) => { location.hash = `#/${p}`; }, p);
    await expect(page.locator('canvas.page-badge'), p).toHaveCount(1, { timeout: 15_000 }); // the whole suite in parallel can be slow
  }
  await page.locator('.ubtn').click();
  // menus are the shared glass: a tinted fill with the standard 24 px blur
  const glass = await page.locator('.umenu-pop').evaluate((e) => { const c = getComputedStyle(e); return [c.backdropFilter, c.backgroundColor]; });
  expect(glass[0]).toContain('blur(24px)');
  expect(glass[1]).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/floor'; });
  await expect(page.locator('canvas.page-badge')).toHaveCount(0);
});

test('the 3D floor renders at the screen\'s full pixel ratio even when the browser reports few CPU cores', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }));
  await signIn(page, 'dark');
  await page.evaluate(() => { location.hash = '#/floor'; });
  const canvas = page.locator('#scene canvas');
  await canvas.waitFor();
  const r = await canvas.evaluate((c) => (c as HTMLCanvasElement).width / c.clientWidth);
  expect(r).toBeGreaterThanOrEqual(1.5);
  await ctx.close();
});

test('dashboard: downtime by cause lines up (station left, time right, nothing spills)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'dark');
  await page.evaluate(() => { location.hash = '#/dash'; });
  await page.locator('.dash-causes li').first().waitFor();
  const bad = await page.evaluate(() => [...document.querySelectorAll('.dash-causes li')].flatMap((li) => {
    const R = li.getBoundingClientRect(), id = li.firstElementChild!.getBoundingClientRect(), t = li.lastElementChild!;
    const tr = t.getBoundingClientRect(), out: string[] = [];
    if (Math.abs(id.left - R.left) > 1) out.push(`${li.textContent}: station is not at the left edge`);
    if (tr.right > R.right + 1 || t.scrollWidth > (t as HTMLElement).clientWidth + 1) out.push(`${li.textContent}: time spills`);
    return out;
  }));
  expect(bad).toEqual([]);
});
