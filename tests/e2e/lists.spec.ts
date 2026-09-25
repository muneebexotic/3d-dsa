import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/lists/');
  await waitForChapter(page, '__lists');
});

/** Play the loaded program through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const L = window.__lists;
    if (!L.player.playing) L.togglePlay();
    for (let guard = 0; guard < 400 && !(L.player.atEnd() && !L.player.playing); guard++) L.advance(2);
    return L.player.prog.steps.length;
  });
}

const kinds = (page: Page) => page.evaluate(() => window.__lists.player.prog.steps.map(s => s.kind));
const values = (page: Page, s: 'singly' | 'doubly' | 'array') =>
  page.evaluate(k => window.__lists.world[k].values(), s);

async function structure(page: Page, name: string): Promise<void> {
  await page.locator(`#kindSeg button[data-k="${name}"]`).click();
  await expect(page.locator(`#kindSeg button[data-k="${name}"]`)).toHaveAttribute('aria-pressed', 'true');
}

test('inserts at an index: a walk to find the spot, then two pointer writes', async ({ page }) => {
  await page.locator('#val').fill('7');
  await page.locator('#idx').fill('2');
  await page.locator('#bMain').click();
  await expect(page.locator('#opname')).toHaveText('Insert 7 at index 2');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  expect(await values(page, 'singly')).toEqual([4, 8, 7, 15, 16, 23, 42]);
  await expect(page.locator('#chips')).toContainText('1 hop');
  await expect(page.locator('#chips')).toContainText('2 pointer writes');
  await expect(page.locator('#codeLines li.on')).toHaveCount(0);
  await expect(page.locator('#costTable tr.on')).toContainText('Insert at i');
});

test('explains values and indexes it cannot use', async ({ page }) => {
  await page.locator('#val').fill('7');
  await page.locator('#idx').fill('9');
  await page.locator('#bMain').click();
  await expect(page.locator('#err')).toContainText('0 to 6');
  await expect(page.locator('#idx')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#val').fill('abc');
  await page.locator('#bHead').click();
  await expect(page.locator('#err')).toContainText('not a whole number');
  await page.locator('#val').fill('150');
  await page.locator('#bTail').click();
  await expect(page.locator('#err')).toContainText('0 to 99');
  expect(await values(page, 'singly')).toEqual([4, 8, 15, 16, 23, 42]);
});

test('reverses by turning every pointer, then turns the picture round', async ({ page }) => {
  await page.locator('#bReverse').click();
  await expect(page.locator('#opname')).toHaveText('Reverse');
  await playThrough(page);
  const k = await kinds(page);
  expect(k.filter(x => x === 'swing')).toHaveLength(6);
  expect(k.at(-1)).toBe('turn');
  await expect(page.locator('#head')).toHaveText('Reversed.');
  expect(await values(page, 'singly')).toEqual([42, 23, 16, 15, 8, 4]);
});

test('deletes, searches and reads by index', async ({ page }) => {
  await page.locator('#idx').fill('3');
  await page.locator('#bDelete').click();
  await playThrough(page);
  expect(await values(page, 'singly')).toEqual([4, 8, 15, 23, 42]);
  await page.locator('#val').fill('99');
  await page.locator('#bSearch').click();
  await playThrough(page);
  expect((await kinds(page)).at(-1)).toBe('missing');
  await page.locator('#idx').fill('4');
  await page.locator('#bGet').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('Index 4 holds 42.');
  await expect(page.locator('#chips')).toContainText('4 hops');
});

test('an array jumps to an index and shifts to open a gap', async ({ page }) => {
  await structure(page, 'array');
  await page.locator('#idx').fill('4');
  await page.locator('#bGet').click();
  expect(await kinds(page)).toEqual(['jump']);
  await playThrough(page);
  await expect(page.locator('#chips')).toContainText('1 jump');
  await page.locator('#val').fill('9');
  await page.locator('#idx').fill('0');
  await page.locator('#bMain').click();
  await playThrough(page);
  expect((await kinds(page)).filter(x => x === 'shift')).toHaveLength(6);
  expect(await values(page, 'array')).toEqual([9, 4, 8, 15, 16, 23, 42]);
});

test('a doubly linked list deletes its tail without walking', async ({ page }) => {
  await structure(page, 'doubly');
  await page.locator('#idx').fill('5');
  await page.locator('#bDelete').click();
  await playThrough(page);
  expect(await kinds(page)).not.toContain('hop');
  expect(await values(page, 'doubly')).toEqual([4, 8, 15, 16, 23]);
});

test('a stack gives values back in the opposite order', async ({ page }) => {
  await structure(page, 'stack');
  await page.locator('#bDemo').click();
  await playThrough(page);
  expect(await page.evaluate(() => window.__lists.world.stack.out.map(e => e.val))).toEqual([5, 4, 3, 2, 1]);
  await expect(page.locator('#chips')).toContainText('last in, first out');
  await page.locator('#bTake').click();
  expect(await kinds(page)).toEqual(['underflow']);
});

test('a queue gives values back in the same order, and wraps round', async ({ page }) => {
  await structure(page, 'queue');
  await page.locator('#bDemo').click();
  await playThrough(page);
  expect(await page.evaluate(() => window.__lists.world.queue.out.map(e => e.val))).toEqual([1, 2, 3, 4, 5]);
  const heads = await page.evaluate(() => window.__lists.player.prog.steps.map(s => s.head));
  expect(heads.some(h => h.includes('wraps round'))).toBe(true);
  await page.locator('#optMemory').check();
  expect(await page.evaluate(() => window.__lists.ui.memory)).toBe(true);
});

test('the bridge drives a DFS and links to Graph Net', async ({ page }) => {
  await structure(page, 'stack');
  await page.locator('#bBridge').click();
  await expect(page.locator('#opname')).toHaveText('A stack drives DFS');
  await playThrough(page);
  await expect(page.locator('#head')).toContainText('A C F G E B D');
  await page.locator('#chips a[href="/graphs/"]').click();
  await expect(page).toHaveURL(/\/graphs\/$/);
  await waitForChapter(page, '__graph');
});

test('clicking a node opens the inspector', async ({ page }) => {
  // let the opening assembly finish and the camera come to rest, so the disc stays where it is measured
  await page.evaluate(() => {
    window.__lists.advance(4);
    window.__lists.settle();
  });
  const key = await page.evaluate(() => window.__lists.diagram().items.find(i => i.label === '15')?.id ?? '');
  const p = await page.evaluate(k => window.__lists.itemScreen(k), key);
  expect(p).not.toBeNull();
  await page.mouse.click(p?.x ?? 0, p?.y ?? 0);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#insState')).toContainText('15');
  await expect(page.locator('#insGrid')).toContainText('Next');
  await expect(page.locator('#insGrid')).toContainText('16 @ 0x');
});

test('an empty list explains itself', async ({ page }) => {
  // empty the list with the page's own delete: five times through the hook (fast on slow software WebGL), then the form
  await page.evaluate(() => {
    const idx = document.querySelector('#idx') as HTMLInputElement;
    for (let k = 0; k < 5; k++) {
      idx.value = '0';
      window.__lists.press('bDelete');
    }
  });
  await page.locator('#idx').fill('0');
  await page.locator('#bDelete').click();
  await playThrough(page);
  expect(await values(page, 'singly')).toEqual([]);
  await page.locator('#bReverse').click();
  expect(await kinds(page)).toEqual(['empty']);
  await expect(page.locator('#head')).toHaveText('The list is empty.');
  await page.locator('#bReset').click();
  expect(await values(page, 'singly')).toEqual([4, 8, 15, 16, 23, 42]);
});
