// The phone layout: a bottom sheet, a chapter menu instead of the pill row, and a
// single speed button instead of the speed row.

import { expect, test, waitForChapter } from './support/fixtures';

for (const [path, hook] of [
  ['/avl/', '__avl'],
  ['/graphs/', '__graph'],
  ['/lists/', '__lists'],
  ['/hashing/', '__hashing'],
] as const) {
  test(`${path}: the chapter menu replaces the pill row`, async ({ page }) => {
    await page.goto(path);
    await waitForChapter(page, hook);
    await expect(page.locator('#dock .site-nav')).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Chapters' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await menuButton.tap();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#navMenu a:not(.soon)')).toHaveCount(5);
    await expect(page.locator('#navMenu a.soon')).toHaveCount(3);
  });

  test(`${path}: the speed button cycles speeds`, async ({ page }) => {
    await page.goto(path);
    await waitForChapter(page, hook);
    await expect(page.locator('#speed')).toBeHidden();
    const cycle = page.locator('#speedCycle');
    await expect(cycle).toHaveAttribute('aria-label', 'Speed 1×');
    await cycle.tap();
    await expect(cycle).not.toHaveAttribute('aria-label', 'Speed 1×');
  });
}

test('the chapter menu navigates', async ({ page }) => {
  await page.goto('/avl/');
  await waitForChapter(page, '__avl');
  await page.getByRole('button', { name: 'Chapters' }).tap();
  await page
    .locator('#navMenu')
    .getByRole('link', { name: /Graph Net/ })
    .tap();
  await expect(page).toHaveURL(/\/graphs\/$/);
  await waitForChapter(page, '__graph');
});

test('inserting a value works from the bottom sheet', async ({ page }) => {
  await page.goto('/avl/');
  await waitForChapter(page, '__avl');
  const before = await page.evaluate(() => window.__avl.engine.count);
  await page.locator('#val').fill('27');
  await page.locator('#bInsert').tap();
  await expect(page.locator('#opname')).toHaveText('Insert 27');
  expect(await page.evaluate(() => window.__avl.engine.count)).toBe(before + 1);
});

test('the landing page fits the phone without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a key can be inserted into the hash clock from the bottom sheet', async ({ page }) => {
  await page.goto('/hashing/');
  await waitForChapter(page, '__hashing');
  await page.locator('#key').fill('5');
  await page.locator('#bInsert').tap();
  await expect(page.locator('#opname')).toHaveText('Insert 5');
  expect(await page.evaluate(() => window.__hashing.world.chain.has(5))).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
