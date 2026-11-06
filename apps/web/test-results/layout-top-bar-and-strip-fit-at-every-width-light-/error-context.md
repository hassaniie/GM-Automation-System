# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: layout.spec.ts >> top bar and strip fit at every width (light)
- Location: e2e/layout.spec.ts:43:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 19

- Array []
+ Array [
+   "1024px floor: .lanes scrolls vertically (84 > 82)",
+   "1024px floor: .lanes scrolls horizontally (890 > 787)",
+   "1024px floor: .lane scrolls horizontally (321 > 232)",
+   "1024px floor: .lane scrolls vertically (83 > 81)",
+   "1024px floor: .lane scrolls horizontally (415 > 255)",
+   "1024px floor: .lane scrolls horizontally (374 > 270)",
+   "1280px floor: .lanes scrolls vertically (84 > 82)",
+   "1280px floor: .lanes scrolls horizontally (1054 > 1043)",
+   "1280px floor: .lane scrolls horizontally (321 > 310)",
+   "1280px floor: .lane scrolls vertically (83 > 81)",
+   "1280px floor: .lane scrolls horizontally (427 > 341)",
+   "1280px floor: .lane scrolls horizontally (374 > 362)",
+   "1440px floor: .lanes scrolls vertically (84 > 82)",
+   "1440px floor: .lane scrolls vertically (83 > 81)",
+   "1440px floor: .lane scrolls horizontally (427 > 395)",
+   "1920px floor: .lanes scrolls vertically (84 > 82)",
+   "1920px floor: .lane scrolls vertically (83 > 81)",
+ ]
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img "MG" [ref=e8]
          - generic [ref=e9]:
            - generic [ref=e10]: GA Operations
            - generic [ref=e11]: MG JW Automobile
        - generic [ref=e12]:
          - generic [ref=e13]: 09:40:22
          - generic [ref=e14]: Shift A
        - generic "All data is simulated in this browser. No PLC, scanner or sensor is connected." [ref=e15]: SIMULATION
        - generic "Shift A 06:00–14:30 · 45% of productive time elapsed" [ref=e18]
      - navigation "Screens" [ref=e20]:
        - button "Dashboard" [ref=e21] [cursor=pointer]
        - button "Floor" [ref=e28] [cursor=pointer]
        - button "Line displays" [ref=e34] [cursor=pointer]
        - button "Reports" [ref=e38] [cursor=pointer]
        - button "Settings" [ref=e42] [cursor=pointer]
        - button "How it works" [ref=e47] [cursor=pointer]
      - navigation "Actions" [ref=e51]:
        - generic [ref=e52]:
          - button "Find a vehicle by VIN" [ref=e53] [cursor=pointer]
          - button "Line-in scan" [ref=e57] [cursor=pointer]
          - button "X-ray build view" [ref=e64] [cursor=pointer]
          - button "Theme auto. Switch theme" [ref=e72] [cursor=pointer]
          - button "Mute alarm sound" [ref=e76] [cursor=pointer]
        - generic [ref=e81]:
          - button "0 supervisor and 0 maintenance calls open" [ref=e82] [cursor=pointer]:
            - text: CALLS
            - generic [ref=e85]: "0"
          - button "0 critical alarms, 0 unacknowledged" [ref=e86] [cursor=pointer]:
            - text: ALARMS
            - generic [ref=e90]: "0"
        - button "HS" [ref=e92] [cursor=pointer]
        - button [ref=e93] [cursor=pointer]:
          - img "Bolt & Volt" [ref=e94]
    - generic [ref=e96]:
      - complementary "Settings sections" [ref=e97]:
        - generic [ref=e98]: Settings
        - button "Takt time" [ref=e99] [cursor=pointer]
        - button "Targets & plan" [ref=e103] [cursor=pointer]
        - button "Shifts & breaks" [ref=e106] [cursor=pointer]
        - button "Buzzers" [ref=e110] [cursor=pointer]
        - button "Position correction" [ref=e116] [cursor=pointer]
        - button "Users" [ref=e120] [cursor=pointer]
        - button "Audit log" [ref=e126] [cursor=pointer]
        - paragraph [ref=e129]: Changes apply at once, are saved on this device and are written to the audit log with your name.
      - generic [ref=e131]:
        - generic [ref=e133]:
          - generic [ref=e134]: Takt time · URD req 10
          - heading "Takt time per line" [level=2] [ref=e135]
          - paragraph [ref=e136]: The time a vehicle is allowed at each station. Cycle time above takt turns the station red, sounds its buzzer and counts as downtime.
        - generic [ref=e137]:
          - generic [ref=e138]:
            - generic [ref=e139]: Station 1 · Trim Line · preview
            - generic [ref=e140]:
              - spinbutton "Trim Line takt minutes" [ref=e141]: "10"
              - generic [ref=e142]: ":"
              - spinbutton "Trim Line takt seconds" [ref=e143]: "00"
              - generic [ref=e144]: "min : s"
            - generic [ref=e145]: Now 10:00 · close to limit at 09:30
            - generic [ref=e146]:
              - button "−1:00" [ref=e147] [cursor=pointer]
              - button "−0:30" [ref=e148] [cursor=pointer]
              - button "+0:30" [ref=e149] [cursor=pointer]
              - button "+1:00" [ref=e150] [cursor=pointer]
          - generic [ref=e151]:
            - generic [ref=e152]: Station 2 · Chassis Line
            - generic [ref=e153]:
              - spinbutton "Chassis Line takt minutes" [ref=e154]: "10"
              - generic [ref=e155]: ":"
              - spinbutton "Chassis Line takt seconds" [ref=e156]: "00"
              - generic [ref=e157]: "min : s"
            - generic [ref=e158]: Now 10:00 · close to limit at 09:30
            - generic [ref=e159]:
              - button "−1:00" [ref=e160] [cursor=pointer]
              - button "−0:30" [ref=e161] [cursor=pointer]
              - button "+0:30" [ref=e162] [cursor=pointer]
              - button "+1:00" [ref=e163] [cursor=pointer]
          - generic [ref=e164]:
            - generic [ref=e165]: Station 3 · Final Line
            - generic [ref=e166]:
              - spinbutton "Final Line takt minutes" [ref=e167]: "10"
              - generic [ref=e168]: ":"
              - spinbutton "Final Line takt seconds" [ref=e169]: "00"
              - generic [ref=e170]: "min : s"
            - generic [ref=e171]: Now 10:00 · close to limit at 09:30
            - generic [ref=e172]:
              - button "−1:00" [ref=e173] [cursor=pointer]
              - button "−0:30" [ref=e174] [cursor=pointer]
              - button "+0:30" [ref=e175] [cursor=pointer]
              - button "+1:00" [ref=e176] [cursor=pointer]
        - generic [ref=e177]:
          - generic [ref=e178]:
            - generic [ref=e179]: Close to limit at (% of takt)
            - spinbutton "Close to limit at (% of takt)" [ref=e180]: "95"
          - generic [ref=e181]:
            - generic [ref=e182]: Reason for the change (kept in the audit log)
            - textbox "Reason for the change (kept in the audit log)" [ref=e183]:
              - /placeholder: e.g. New line balance after adding CL3
          - button "Save takt" [ref=e184] [cursor=pointer]
        - paragraph [ref=e187]:
          - text: To change takt from a future date, schedule it under
          - button "Targets & plan" [ref=e188] [cursor=pointer]
          - text: .
        - generic [ref=e189]: Recent takt changes
        - paragraph [ref=e190]: No changes recorded yet.
```

# Test source

```ts
  1  | /* Layout guardrail (design system release 1): at every supported width, in both themes, the top bar
  2  |    never overflows or overlaps and keeps Calls, Alarms and the user menu on screen, and the station strip
  3  |    never scrolls. Runs against the single-file demo build (dist-demo/index.html). */
  4  | import { expect, test, type Page } from '@playwright/test';
  5  | import { pathToFileURL } from 'node:url';
  6  | import { resolve } from 'node:path';
  7  | 
  8  | const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
  9  | const WIDTHS = [1024, 1280, 1440, 1920, 2560];
  10 | const PAGES = ['floor', 'dash', 'reports', 'admin/takt'];
  11 | 
  12 | async function signIn(page: Page, theme: 'light' | 'dark') {
  13 |   await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  14 |   await page.goto(FILE);
  15 |   await page.getByText('Hamza Siddiqui').click();
  16 |   await page.locator('.si-go').click();
  17 |   await page.waitForFunction(() => (window as unknown as { __mg?: { RT: { S: unknown } } }).__mg?.RT.S);
  18 | }
  19 | 
  20 | /** Problems with the top bar and strip on the current page, as readable strings. */
  21 | function problems(page: Page) {
  22 |   return page.evaluate(() => {
  23 |     const out: string[] = [], W = innerWidth;
  24 |     const hud = document.querySelector('header.hud');
  25 |     if (!hud) return ['no top bar'];
  26 |     if (hud.scrollWidth > hud.clientWidth + 1) out.push(`top bar content is ${hud.scrollWidth - hud.clientWidth}px wider than the bar`);
  27 |     const kids = [...hud.children].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => ({ name: e.className.toString().split(' ').slice(0, 2).join('.'), r: e.getBoundingClientRect() }));
  28 |     for (const k of kids) if (k.r.right > W + 1 || k.r.left < -1) out.push(`${k.name} is outside the window (${Math.round(k.r.left)}–${Math.round(k.r.right)} of ${W})`);
  29 |     for (let i = 1; i < kids.length; i++) if (kids[i].r.left < kids[i - 1].r.right - 1) out.push(`${kids[i - 1].name} and ${kids[i].name} overlap by ${Math.round(kids[i - 1].r.right - kids[i].r.left)}px`);
  30 |     for (const [sel, name] of [['.calls-pill', 'Calls'], ['.alarm-pill', 'Alarms'], ['.ubtn', 'user menu']] as const) {
  31 |       const e = hud.querySelector(sel); const r = e?.getBoundingClientRect();
  32 |       if (!e || !r || r.width === 0 || r.right > W + 1) out.push(`${name} is not fully visible`);
  33 |     }
  34 |     for (const sel of ['.strip', '.lanes', '.lane', '.cells']) for (const e of document.querySelectorAll(sel)) {
  35 |       if (e.scrollHeight > e.clientHeight + 1) out.push(`${sel} scrolls vertically (${e.scrollHeight} > ${e.clientHeight})`);
  36 |       if (e.scrollWidth > e.clientWidth + 1) out.push(`${sel} scrolls horizontally (${e.scrollWidth} > ${e.clientWidth})`);
  37 |     }
  38 |     return [...new Set(out)];
  39 |   });
  40 | }
  41 | 
  42 | for (const theme of ['light', 'dark'] as const) {
  43 |   test(`top bar and strip fit at every width (${theme})`, async ({ page }) => {
  44 |     await page.setViewportSize({ width: 1440, height: 900 });
  45 |     await signIn(page, theme);
  46 |     const found: string[] = [];
  47 |     for (const w of WIDTHS) {
  48 |       await page.setViewportSize({ width: w, height: Math.round(w * 0.5625) });
  49 |       for (const p of PAGES) {
  50 |         await page.evaluate((h) => { location.hash = '#/' + h; }, p);
  51 |         await page.waitForTimeout(400);
  52 |         for (const x of await problems(page)) found.push(`${w}px ${p}: ${x}`);
  53 |       }
  54 |     }
> 55 |     expect(found).toEqual([]);
     |                   ^ Error: expect(received).toEqual(expected) // deep equality
  56 |   });
  57 | }
  58 | 
```