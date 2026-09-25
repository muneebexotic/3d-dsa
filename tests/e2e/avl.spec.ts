import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/avl/');
  await waitForChapter(page, '__avl');
});

/** Jump to the end of whatever the player has loaded. */
async function finish(page: Page): Promise<number> {
  return page.evaluate(() => {
    const n = window.__avl.player.prog.steps.length;
    window.__avl.seek(n - 1);
    return n;
  });
}

test('inserts a typed value and rebalances', async ({ page }) => {
  const before = await page.evaluate(() => window.__avl.engine.count);
  await page.locator('#val').fill('27');
  await page.locator('#bInsert').click();
  await expect(page.locator('#opname')).toHaveText('Insert 27');
  const n = await finish(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  expect(await page.evaluate(() => window.__avl.engine.count)).toBe(before + 1);
  await expect(page.locator('#mstats')).toContainText(`${before + 1} values`);
});

test('explains a value it cannot take', async ({ page }) => {
  await page.locator('#val').fill('1000');
  await page.locator('#bInsert').click();
  await expect(page.locator('#err')).not.toBeEmpty();
});

test('searches and deletes', async ({ page }) => {
  await page.locator('#val').fill('27');
  await page.locator('#bInsert').click();
  await finish(page);
  await page.locator('#bSearch').click();
  await expect(page.locator('#opname')).toHaveText('Search 27');
  await page.locator('#bDelete').click();
  await expect(page.locator('#opname')).toHaveText('Delete 27');
  await finish(page);
  expect(await page.evaluate(() => window.__avl.engine.has(27))).toBe(false);
});

test('the demo ticks off all four rotation cases', async ({ page }) => {
  await page.locator('#bDemo').click();
  await expect(page.locator('#opname')).toContainText('Demo');
  await finish(page);
  await expect(page.locator('#chips')).toContainText('4 of 4 rotation cases');
  await expect(page.locator('#chips .chip.done')).toHaveCount(4);
});

test('steps forward and back from the transport', async ({ page }) => {
  await page.locator('#bDemo').click();
  await page.locator('#bPlay').click(); // pause
  await expect(page.locator('#bPlay')).toHaveAttribute('aria-label', 'Play');
  // the step index once the motion on screen has come to rest
  const rest = () => page.evaluate(() => (window.__avl.player.tr ? null : window.__avl.player.idx));
  await expect.poll(rest).not.toBeNull();
  const start = (await rest()) as number;
  await page.locator('#bFwd').click();
  await expect.poll(rest).toBe(start + 1);
  await page.locator('#bBack').click();
  await expect.poll(rest).toBe(start);
});
