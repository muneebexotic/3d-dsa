import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/hashing/');
  await waitForChapter(page, '__hashing');
});

/** Play the loaded program through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const H = window.__hashing;
    if (!H.player.playing) H.togglePlay();
    for (let guard = 0; guard < 400 && !(H.player.atEnd() && !H.player.playing); guard++) H.advance(2);
    return H.player.prog.steps.length;
  });
}

const kinds = (page: Page) => page.evaluate(() => window.__hashing.player.prog.steps.map(s => s.kind));
const table = (page: Page, s: 'chain' | 'probe') =>
  page.evaluate(k => {
    const T = window.__hashing.world[k];
    return { m: T.m, n: T.n, hash: T.hash, keys: T.keys(), slots: T.slots, ledger: T.ledger.length };
  }, s);

async function strategy(page: Page, name: 'chain' | 'probe'): Promise<void> {
  await page.locator(`#stratSeg button[data-s="${name}"]`).click();
  await expect(page.locator(`#stratSeg button[data-s="${name}"]`)).toHaveAttribute('aria-pressed', 'true');
}

test('an insert winds round, chains, and grows the table past three quarters', async ({ page }) => {
  await expect(page.locator('#head')).toHaveText('Six keys in eight buckets: three quarters full.');
  await page.locator('#key').fill('41');
  await page.locator('#bInsert').click();
  await expect(page.locator('#opname')).toHaveText('Insert 41');
  await expect(page.locator('#head')).toHaveText('41 winds round to bucket 1.');
  await expect(page.locator('#codeLines li.on')).toHaveText('i = hash(k) % m');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  expect(await kinds(page)).toEqual([
    'hash',
    'jump',
    'compare',
    'compare',
    'link',
    'full',
    'grow',
    'rehash',
    'rehash',
    'fountain',
    'retire',
  ]);
  await expect(page.locator('#head')).toHaveText('The old table is freed.');
  await expect(page.locator('#chips')).toContainText('7 keys moved');
  expect(await table(page, 'chain')).toMatchObject({ m: 16, n: 7 });
  // the work chart shows the insert and the rehash it paid for
  await expect(page.locator('#workChart svg path')).toHaveCount(8);
  await expect(page.locator('#workChart .wc-sum')).toContainText('Rehash: 7 keys moved');
  await expect(page.locator('#mstats')).toHaveText('7 keys · 16 buckets · load 0.44');
});

test('explains keys it cannot use', async ({ page }) => {
  await page.locator('#key').fill('abc');
  await page.locator('#bInsert').click();
  await expect(page.locator('#err')).toContainText('not a whole number');
  await expect(page.locator('#key')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#key').fill('150');
  await page.locator('#bSearch').click();
  await expect(page.locator('#err')).toContainText('0 to 99');
  await page.locator('#key').fill('');
  await page.locator('#bDelete').click();
  await expect(page.locator('#err')).toContainText('Type the key to delete');
  expect((await table(page, 'chain')).n).toBe(6);
});

test('searches find a key, or walk the chain and give up', async ({ page }) => {
  await page.locator('#key').fill('33');
  await page.locator('#bSearch').click();
  await playThrough(page);
  expect((await kinds(page)).at(-1)).toBe('found');
  await expect(page.locator('#chips')).toContainText('2 comparisons');
  await page.locator('#key').fill('17');
  await page.locator('#bSearch').click();
  await playThrough(page);
  expect((await kinds(page)).at(-1)).toBe('missing');
  await expect(page.locator('#head')).toHaveText('17 is not in the table.');
});

test('linear probing walks past taken slots and leaves tombstones', async ({ page }) => {
  await strategy(page, 'probe');
  await expect(page.locator('#head')).toHaveText('The same six keys, one to a bucket.');
  await page.locator('#optGrow').uncheck();
  await page.locator('#key').fill('17');
  await page.locator('#bInsert').click();
  await playThrough(page);
  expect((await kinds(page)).filter(k => k === 'hop')).toHaveLength(4);
  await expect(page.locator('#head')).toHaveText('17 drops into slot 5.');
  expect((await table(page, 'probe')).m).toBe(8);
  await page.locator('#key').fill('33');
  await page.locator('#bDelete').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('33 leaves a tombstone in slot 2.');
  await expect(page.locator('#body')).toContainText('Why not just empty the slot?');
  expect((await table(page, 'probe')).slots[2]).toBe(-1);
});

test('unlucky keys pile up, and the scrambled hash spreads them out', async ({ page }) => {
  await page.locator('#bUnlucky').click();
  await expect(page.locator('#opname')).toHaveText('Unlucky keys');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('Same code. Only the keys changed.');
  await expect(page.locator('#hashSeg button[data-h="plain"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#hashSeg button[data-h="scrambled"]').click();
  await expect(page.locator('#hashSeg button[data-h="scrambled"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await kinds(page))[0]).toBe('lift');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('Rehashed.');
  expect((await table(page, 'chain')).hash).toBe('scrambled');
});

test('clicking a key opens the inspector', async ({ page }) => {
  // let the opening assembly finish and the camera come to rest, so the disc stays where it is measured
  await page.evaluate(() => {
    window.__hashing.advance(4);
    window.__hashing.settle();
  });
  const p = await page.evaluate(() => window.__hashing.itemScreen('k59'));
  expect(p).not.toBeNull();
  await page.mouse.click(p?.x ?? 0, p?.y ?? 0);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#insState')).toContainText('59 · in bucket 3');
  await expect(page.locator('#insGrid')).toContainText('59 mod 8 = 3');
  await expect(page.locator('#insGrid')).toContainText('1 comparison');
});

test('reset brings back the opening table', async ({ page }) => {
  await page.locator('#bRandom').click();
  await playThrough(page);
  expect((await table(page, 'chain')).n).toBeGreaterThan(6);
  await page.locator('#bReset').click();
  expect(await table(page, 'chain')).toMatchObject({ m: 8, n: 6, hash: 'plain' });
  await expect(page.locator('#head')).toHaveText('Six keys in eight buckets: three quarters full.');
});
