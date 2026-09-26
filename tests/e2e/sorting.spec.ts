import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/sorting/');
  await waitForChapter(page, '__sorting');
});

/** Play the loaded program through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const S = window.__sorting;
    if (!S.player.playing) S.togglePlay();
    for (let guard = 0; guard < 900 && !(S.player.atEnd() && !S.player.playing); guard++) S.advance(3);
    return S.player.prog.steps.length;
  });
}

/** The values at the front of the first loom, slot by slot, after the step on screen. */
const front = (page: Page) =>
  page.evaluate(() => {
    const S = window.__sorting,
      st = S.player.prog.steps[S.player.idx];
    return st.looms[0].arr.map(id => S.threads.list[id].v);
  });
const cloths = (page: Page) =>
  page.evaluate(() => window.__sorting.player.prog.rec.looms.map(l => [l.key, l.run.comps] as const));
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('six sorts weave the same threads, then stand their cloths up', async ({ page }) => {
  expect(await page.evaluate(() => window.__sorting.player.prog.rec.mode)).toBe('race');
  await expect(page.locator('#bRace')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#head')).toHaveText('Six sorts weave the same 16 threads.');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  await expect(page.locator('#head')).toHaveText('Stand the cloths up: their height is their work.');
  await expect(page.locator('#body')).toContainText('2.7× as many comparisons as merge sort');
  expect(await cloths(page)).toEqual([
    ['bubble', 120],
    ['insertion', 93],
    ['selection', 120],
    ['merge', 44],
    ['quick', 53],
    ['heap', 80],
  ]);
  const done = await page.evaluate(() => {
    const S = window.__sorting;
    return S.player.prog.steps[S.player.idx].looms.every(l => l.done);
  });
  expect(done).toBe(true);
  await expect(page.locator('#workChart svg')).toHaveAttribute('aria-label', /Merge 44/);
});

test('one sort, step by step, with its code and its count', async ({ page }) => {
  await page.locator('#sortSeg button[data-s="insertion"]').click();
  await expect(page.locator('#sortSeg button[data-s="insertion"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bRace')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#head')).toHaveText('Insertion sort: slide each key into place.');
  await expect(page.locator('#codeTitle')).toHaveText('insertionSort(a)');
  await page.evaluate(() => {
    const S = window.__sorting;
    S.seek(0);
    S.advance(1);
  });
  await expect(page.locator('#opname')).toHaveText('Insertion sort · Random 16');
  await expect(page.locator('#codeLines li.on')).toHaveCount(1);
  await expect(page.locator('#chips')).toContainText('1 comparison');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  await expect(page.locator('#head')).toContainText('Sorted: 93 comparisons');
  expect(await front(page)).toEqual(upTo(16));
  await expect(page.locator('#workChart svg')).toHaveAttribute('aria-label', /Insertion 93/);
});

test('twins: quick sort ties knots, merge sort keeps them in order', async ({ page }) => {
  await page.locator('#inputSeg button[data-k="twins"]').click();
  await expect(page.locator('#inputSeg button[data-k="twins"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sortSeg button[data-s="quick"]').click();
  await playThrough(page);
  await expect(page.locator('#body')).toContainText('quick sort is not stable');
  expect(await page.evaluate(() => window.__sorting.player.prog.rec.looms[0].run.knots)).toBeGreaterThan(0);

  await page.locator('#sortSeg button[data-s="merge"]').click();
  await playThrough(page);
  await expect(page.locator('#body')).toContainText('merge sort is stable');
  expect(await page.evaluate(() => window.__sorting.player.prog.rec.looms[0].run.knots)).toBe(0);
  expect(await front(page)).toEqual(upTo(16).map(i => (i + 1) >> 1));
});

test('on nearly sorted threads insertion sort weaves the shortest cloth', async ({ page }) => {
  await page.locator('#inputSeg button[data-k="nearly"]').click();
  expect(await page.evaluate(() => window.__sorting.player.prog.rec.mode)).toBe('race');
  const c = Object.fromEntries(await cloths(page));
  expect(Math.min(...Object.values(c))).toBe(c.insertion);
  expect(c.quick).toBeGreaterThan(c.merge);
  // the first loom to stop is insertion's
  const first = await page.evaluate(() => {
    const S = window.__sorting;
    return S.player.prog.steps.find(s => s.looms.some(l => l.done))?.head ?? '';
  });
  expect(first).toMatch(/^Insertion sort is done/);
});

test('the loom turns into a bar chart, and into a flat weave', async ({ page }) => {
  const fov = () =>
    page.evaluate(() => {
      const S = window.__sorting;
      S.settle();
      return S.camera.fov;
    });
  await page.locator('#viewSeg button[data-v="bars"]').click();
  await expect(page.locator('#viewSeg button[data-v="bars"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await fov()).toBeLessThan(8);
  await page.locator('#viewSeg button[data-v="weave"]').click();
  expect(await fov()).toBeLessThan(12);
  await page.locator('#viewSeg button[data-v="loom"]').click();
  expect(await fov()).toBeGreaterThan(25);
});

test('clicking a disc follows its thread', async ({ page }) => {
  await page.locator('#sortSeg button[data-s="selection"]').click();
  await page.evaluate(() => {
    const S = window.__sorting;
    S.seek(20);
    S.advance(2);
    S.settle();
  });
  const p = await page.evaluate(() => window.__sorting.discScreen(0));
  expect(p).not.toBeNull();
  await page.mouse.click(p?.x ?? 0, p?.y ?? 0);
  await expect(page.locator('#inspector')).toBeVisible();
  expect(await page.evaluate(() => window.__sorting.ui.selected)).toBe(0);
  await expect(page.locator('#insGrid')).toContainText('Started in');
  await expect(page.locator('#insGrid')).toContainText('slot 0');
  await page.locator('#insClose').click();
  await expect(page.locator('#inspector')).toBeHidden();
});

test('size, count, shuffle and reset', async ({ page }) => {
  await page.locator('#sizeSeg button[data-n="8"]').click();
  expect(await page.evaluate(() => window.__sorting.threads.n)).toBe(8);
  await expect(page.locator('#head')).toHaveText('Six sorts weave the same 8 threads.');
  await page.locator('#measureSeg button[data-m="writes"]').click();
  await expect(page.locator('#workChart svg')).toHaveAttribute('aria-label', /^writes on 8 threads/);
  const seed = await page.evaluate(() => window.__sorting.threads.seed);
  await page.locator('#bShuffle').click();
  expect(await page.evaluate(() => window.__sorting.threads.seed)).not.toBe(seed);
  await page.locator('#bReset').click();
  expect(await page.evaluate(() => [window.__sorting.threads.n, window.__sorting.threads.seed])).toEqual([16, 6]);
  await expect(page.locator('#head')).toHaveText('Six sorts weave the same 16 threads.');
});
