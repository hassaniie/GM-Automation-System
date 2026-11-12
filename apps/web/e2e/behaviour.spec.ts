/* Behaviour fixes from the audit (B6–B11), run against the single-file demo build. */
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FILE = pathToFileURL(resolve(process.cwd(), 'dist-demo/index.html')).href;
type MG = { __mg: { RT: { ui: Record<string, unknown>; S: unknown }; setUI: (u: object) => void } };

async function signIn(page: Page, who = 'Hamza Siddiqui') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(FILE);
  await page.getByText(who).click();
  await page.locator('.si-go').click();
  await page.waitForFunction(() => (window as unknown as Partial<MG>).__mg?.RT.S);
  await page.evaluate(() => { location.hash = '#/floor'; });
  await page.locator('header.hud').waitFor();
}
const ui = (page: Page) => page.evaluate(() => (window as unknown as MG).__mg.RT.ui);

test('B8: Alarms opens the alarms tab when the Calls panel is showing', async ({ page }) => {
  await signIn(page);
  await page.locator('.calls-pill').click();
  expect((await ui(page)).drawer).toBe('calls');
  await page.locator('.alarm-pill').click();
  expect((await ui(page)).drawer).toBe('active');
  await page.locator('.alarm-pill').click();
  expect((await ui(page)).drawer).toBe(null);
});

test('B9: the user menu closes on Escape and on a click outside', async ({ page }) => {
  await signIn(page);
  await page.locator('.ubtn').click();
  await expect(page.locator('.umenu-pop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.umenu-pop')).toHaveCount(0);
  await page.locator('.ubtn').click();
  await page.mouse.click(700, 500);
  await expect(page.locator('.umenu-pop')).toHaveCount(0);
});

test('B6: a view-only account sees no simulator controls', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('.simcon')).toHaveCount(1);
  await page.locator('.ubtn').click();
  await page.locator('.um-item', { hasText: /View only|Head Office/ }).first().click();
  await page.evaluate(() => { location.hash = '#/floor'; (window as unknown as MG).__mg.setUI({ selection: { kind: 'pos', id: 'FL3' } }); });
  await page.locator('.inspector').waitFor();
  await expect(page.locator('.simcon')).toHaveCount(0);
  await expect(page.locator('.inspector', { hasText: 'Simulation only' })).toHaveCount(0);
});

test('B7: shortcuts do nothing on the lock screen', async ({ page }) => {
  await signIn(page);
  await page.locator('.ubtn').click();
  await page.locator('.um-item', { hasText: 'Lock screen' }).click();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('/');
  expect((await ui(page)).dialog).toBe(null);
});

test('B10: loading a scenario does not show a Completed card', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => (window as unknown as MG).__mg.setUI({ simOpen: true }));
  await page.locator('.simcon-body button', { hasText: /^2/ }).first().click();
  await page.waitForTimeout(800);
  await expect(page.locator('.lineoff')).toHaveCount(0);
});

test('B11: number fields keep what is typed and clamp on leaving', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { location.hash = '#/admin/takt'; });
  const min = page.getByLabel(/takt minutes/).first(), sec = page.getByLabel(/takt seconds/).first();
  await min.fill('');
  await min.pressSequentially('7');
  await expect(min).toHaveValue('7');
  await sec.fill('75');
  await sec.blur();
  await expect(sec).toHaveValue(/59/);
  await expect(page.locator('.ds-field__note')).toContainText('Adjusted to 59');
});

test('S2: Reports → Excel downloads a real workbook with every table', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { location.hash = '#/reports'; });
  const btn = page.getByRole('button', { name: 'Excel' });
  await btn.waitFor();
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await dl.path());
  expect(wb.worksheets.length).toBeGreaterThan(2);
  expect(wb.worksheets[0].rowCount).toBeGreaterThan(1);
});

test('B12: takt needs a reason, and leaving with unsaved edits asks first', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { location.hash = '#/admin/takt'; });
  const min = page.getByLabel(/takt minutes/).first();
  await min.fill('12'); await min.blur();
  await page.getByRole('button', { name: 'Save takt' }).click();
  await expect(page.getByText('Give a reason')).toBeVisible();
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
  await page.getByRole('tab', { name: /Shifts/ }).click();
  expect(asked).toMatch(/unsaved changes in Takt time/);
  await expect(page).toHaveURL(/admin\/takt/);
});

test('B13: the audit log keeps real time and shop time apart, and the CSV is spreadsheet-safe', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { location.hash = '#/admin/audit'; });
  await expect(page.getByRole('columnheader', { name: 'Real time' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Shop time' })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const text = (await import('node:fs')).readFileSync(await dl.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain('Real time');
});

test('B14: Add user submits on Enter, shows one error, and masks the password', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => { location.hash = '#/admin/users'; });
  await page.getByRole('button', { name: 'Add user' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Full name').fill('Test Person');
  await dlg.getByLabel('Employee ID').fill('MG-9999');
  await dlg.getByLabel(/Work email/).fill('not-an-email');
  await expect(dlg.getByLabel(/Temporary password/)).toHaveAttribute('type', 'password');
  await dlg.getByLabel(/Temporary password/).fill('password');
  await dlg.getByLabel(/Temporary password/).press('Enter');
  await expect(page.getByText(/Enter a work email/)).toHaveCount(1);
  await dlg.getByLabel(/Work email/).fill('test@mgmotors.com.pk');
  await dlg.getByLabel(/Temporary password/).press('Enter');
  await expect(page.getByText('Use letters and at least one digit.')).toHaveCount(1);
});
