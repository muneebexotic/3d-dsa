import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/heap/');
  await waitForChapter(page, '__heap');
});

/** Play the loaded program through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const H = window.__heap;
    if (!H.player.playing) H.togglePlay();
    for (let guard = 0; guard < 600 && !(H.player.atEnd() && !H.player.playing); guard++) H.advance(2);
    return H.player.prog.steps.length;
  });
}

const kinds = (page: Page) => page.evaluate(() => window.__heap.player.prog.steps.map(s => s.kind));
const heap = (page: Page) =>
  page.evaluate(() => {
    const { H, view } = window.__heap.world;
    return { order: H.order, keys: H.keys(), out: H.out.map(it => `${it.tag ?? ''}${it.key}`), ok: H.isHeap(), view };
  });

test('the array folds into the pyramid, then a push climbs it', async ({ page }) => {
  expect(await kinds(page)).toEqual(['arcs', 'fold']);
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('Fold the row into rows of 1, 2, 4 and 8.');
  expect((await heap(page)).view).toBe('tree');

  await page.locator('#key').fill('5');
  await page.locator('#bPush').click();
  await expect(page.locator('#opname')).toHaveText('Push 5');
  await expect(page.locator('#head')).toHaveText('Put 5 in the next free slot: 10.');
  await expect(page.locator('#codeLines li.on')).toHaveText('a.append(k)');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  expect(await kinds(page)).toEqual(['append', 'up', 'swap', 'up', 'swap', 'stay']);
  await expect(page.locator('#head')).toHaveText('5 stays in slot 1.');
  await expect(page.locator('#chips')).toContainText('2 swaps');
  expect((await heap(page)).keys.slice(0, 5)).toEqual([4, 5, 9, 23, 17]);
  await expect(page.locator('#mstats')).toHaveText('11 keys · 4 rows');
  await expect(page.locator('#workChart .wc-sum')).toContainText('Push 5: 2 swaps, at most 3');
});

test('explains keys it cannot use', async ({ page }) => {
  await page.locator('#key').fill('abc');
  await page.locator('#bPush').click();
  await expect(page.locator('#err')).toContainText('not a whole number');
  await expect(page.locator('#key')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#key').fill('150');
  await page.locator('#bPush').click();
  await expect(page.locator('#err')).toContainText('0 to 99');
  expect((await heap(page)).keys).toHaveLength(10);
});

test('a pop takes the top and the last key sinks into its place', async ({ page }) => {
  await page.locator('#bPop').click();
  await expect(page.locator('#opname')).toHaveText('Pop the min');
  await expect(page.locator('#head')).toHaveText('Take the top: 4, the smallest key.');
  await playThrough(page);
  expect(await kinds(page)).toEqual(['take', 'last', 'down', 'swap', 'down', 'swap', 'stay']);
  await expect(page.locator('#head')).toHaveText('21 reaches the bottom row.');
  const h = await heap(page);
  expect(h.out).toEqual(['4']);
  expect(h.keys[0]).toBe(9);
  expect(h.ok).toBe(true);
});

test('heapify lights the leaves and builds a heap within its bound', async ({ page }) => {
  await page.evaluate(() => window.__heap.run('heapify', [44, 12, 87, 5, 63, 29, 71, 38, 9, 56, 20, 91, 3, 47, 15]));
  await expect(page.locator('#opname')).toHaveText('Heapify 15 keys');
  await expect(page.locator('#costTitle')).toHaveText('Heapify or n pushes: most swaps per row');
  await page.evaluate(() => window.__heap.seek(1));
  await expect(page.locator('#head')).toHaveText('8 of the 15 keys are leaves.');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('A heap, after 9 swaps.');
  await expect(page.locator('#costTable svg')).toHaveAttribute('aria-label', /at most 11 in all/);
  expect((await heap(page)).ok).toBe(true);
  expect((await kinds(page)).filter(k => k === 'swap')).toHaveLength(9);
});

test('a max-heap flips the rule and heapifies the same array', async ({ page }) => {
  await page.locator('#orderSeg button[data-o="max"]').click();
  await expect(page.locator('#orderSeg button[data-o="max"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#head')).toHaveText('Flip the rule: the largest key goes on top.');
  await expect(page.locator('#bPop')).toHaveText('Pop the max');
  await playThrough(page);
  const h = await heap(page);
  expect(h.order).toBe('max');
  expect(h.keys[0]).toBe(40);
  expect(h.ok).toBe(true);
});

test('Dijkstra’s queue hands out Graph Net’s tickets in order', async ({ page }) => {
  await page.locator('#bDijkstra').click();
  await expect(page.locator('#net')).toBeVisible();
  await expect(page.locator('#head')).toHaveText('Dijkstra from A to H, on Graph Net’s Textbook graph.');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('H is settled at 18: the cheapest route.');
  expect((await heap(page)).out).toEqual(['A0', 'C2', 'B3', 'D8', 'E10', 'G13', 'F14', 'H18']);
  expect(await kinds(page)).toContain('relower');
  await expect(page.locator('#netMap svg')).toHaveAttribute('aria-label', /settled A, C, B, D, E, G, F, H/);
});

test('the array view unfolds the pyramid, and pushes play there too', async ({ page }) => {
  await page.locator('#viewSeg button[data-v="array"]').click();
  expect(await kinds(page)).toEqual(['fold']);
  await playThrough(page);
  expect((await heap(page)).view).toBe('array');
  await page.locator('#key').fill('1');
  await page.locator('#bPush').click();
  await playThrough(page);
  expect(await page.evaluate(() => window.__heap.diagram().view)).toBe('array');
  expect((await heap(page)).keys[0]).toBe(1);
});

test('clicking a key opens the inspector', async ({ page }) => {
  await page.evaluate(() => {
    const H = window.__heap;
    H.advance(12);
    H.settle();
  });
  const p = await page.evaluate(() => window.__heap.itemScreen('h1'));
  expect(p).not.toBeNull();
  await page.mouse.click(p?.x ?? 0, p?.y ?? 0);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#insState')).toContainText('17 · in slot 1');
  await expect(page.locator('#insGrid')).toContainText('(1 − 1) / 2 = 0');
  await expect(page.locator('#insGrid')).toContainText('2·1 + 1 = 3');
});

test('reset brings back the opening heap', async ({ page }) => {
  await page.locator('#bDrain').click();
  await playThrough(page);
  expect((await heap(page)).keys).toHaveLength(0);
  await expect(page.locator('#head')).toHaveText('Out in order: 4 9 12 17 18 21 23 26 31 40.');
  await page.locator('#bReset').click();
  expect((await heap(page)).keys).toEqual([4, 17, 9, 23, 18, 12, 31, 40, 26, 21]);
  await expect(page.locator('#head')).toHaveText('Ten keys, the smallest on top.');
});
