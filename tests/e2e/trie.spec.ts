import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/trie/');
  await waitForChapter(page, '__trie');
});

/** Play the loaded recording through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const T = window.__trie;
    if (!T.player.playing && !T.player.atEnd()) T.togglePlay();
    for (let guard = 0; guard < 900 && !(T.player.atEnd() && !T.player.playing); guard++) T.advance(0.5);
    return T.player.prog.steps.length;
  });
}

const stats = (page: Page) => page.locator('#mstats');

test('twenty words zip together into a trie of thirty nodes', async ({ page }) => {
  expect(await page.evaluate(() => window.__trie.player.prog.rec.op)).toBe('zip');
  await expect(page.locator('#head')).toHaveText('20 words, written out: 63 letters.');
  const n = await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText(`Step ${n} / ${n}`);
  await expect(page.locator('#head')).toHaveText('63 letters became 30 nodes.');
  await expect(stats(page)).toHaveText('20 words · 30 nodes');
  await expect(page.locator('#codeTitle')).toHaveText('class Node');
});

test('typing lights every word the letters could become', async ({ page }) => {
  await page.locator('#word').click();
  await page.keyboard.type('ca');
  await expect(page.locator('#word')).toHaveValue('CA');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('CA: 6 words start with CA.');
  await expect(page.locator('#listBody li')).toHaveText(['CAR', 'CARD', 'CARE', 'CART', 'CARTOON', 'CAT']);
  const pose = await page.evaluate(() => {
    const F = window.__trie.currentPose().fans[0];
    return { wedge: !!F.wedge, labels: F.labels.map(l => l.text) };
  });
  expect(pose.wedge).toBe(true);
  expect(pose.labels).toEqual(['CAR', 'CARD', 'CARE', 'CART', 'CARTOON', 'CAT']);
  // one more letter plays one more step
  await page.keyboard.type('r');
  await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText('Step 3 / 3');
  await expect(page.locator('#head')).toHaveText('CAR: 5 words start with CAR.');
  // a letter that leaves the trie
  await page.keyboard.type('x');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('No word starts with CARX.');
  await expect(page.locator('#listTitle')).toHaveText('One edit away');
});

test('a letter pressed anywhere goes into the word box', async ({ page }) => {
  await page.locator('#head').click();
  await page.keyboard.press('t');
  await expect(page.locator('#word')).toHaveValue('T');
  await expect(page.locator('#word')).toBeFocused();
  await expect(page.locator('#opname')).toHaveText('Type T');
});

test('search follows one slot per letter, and a word mark tells a word from a prefix', async ({ page }) => {
  await page.evaluate(() => window.__trie.run('search', 'CART'));
  await playThrough(page);
  await expect(page.locator('#stepno')).toHaveText('Step 5 / 5');
  await expect(page.locator('#head')).toHaveText('Found CART: 4 letters, 4 steps.');
  await expect(page.locator('#codeLines li.on')).toHaveText('return node.isWord');
  await page.locator('#word').fill('CARTO');
  await page.locator('#bSearch').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('CARTO is only the start of a word.');
});

test('insert grows only the new letters; delete prunes back to the last word', async ({ page }) => {
  await page.locator('#word').fill('CARS');
  await page.locator('#bInsert').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('CARS is in: one new node.');
  await expect(stats(page)).toHaveText('21 words · 31 nodes');
  await page.locator('#word').fill('CARTOON');
  await page.locator('#bDelete').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('Stop at CART: it stays.');
  await expect(page.locator('#chips')).toContainText('−3 nodes');
  await expect(stats(page)).toHaveText('20 words · 28 nodes');
});

test('spell check finds the words one edit away', async ({ page }) => {
  await page.locator('#word').fill('DOE');
  await page.locator('#bSpell').click();
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('4 words are one edit away.');
  await expect(page.locator('#listBody li button')).toHaveText(['DO', 'DOG', 'DOT', 'TOE']);
  // a suggestion can be searched with one click
  await page.locator('#listBody button[data-w="DOG"]').click();
  await expect(page.locator('#word')).toHaveValue('DOG');
  await expect(page.locator('#opname')).toHaveText('Search DOG');
});

test('three sizes take the same four steps', async ({ page }) => {
  await page.locator('#word').fill('CART');
  await page.locator('#bThree').click();
  await expect(page.locator('#bThree')).toHaveAttribute('aria-pressed', 'true');
  await playThrough(page);
  await expect(page.locator('#head')).toHaveText('CART: 4 steps in each.');
  const fans = await page.evaluate(() => window.__trie.currentPose().fans.map(f => [f.key, f.cy > 0] as const));
  expect(fans).toEqual([
    ['f20', true],
    ['f200', true],
    ['f2000', false],
  ]);
  await expect(page.locator('#stepsChart svg')).toHaveAttribute('aria-label', /a trie always 4/);
});

test('the memory view unfolds every node into its 26 slots', async ({ page }) => {
  await playThrough(page);
  await page.locator('#viewSeg button[data-v="memory"]').click();
  await expect(page.locator('#viewSeg button[data-v="memory"]')).toHaveAttribute('aria-pressed', 'true');
  const boxes = await page.evaluate(() => {
    const T = window.__trie;
    T.settle();
    T.advance(0.2);
    return { mem: T.view.mem, boxes: T.counts().boxes };
  });
  expect(boxes.mem).toBe(1);
  // 31 nodes: 30 used slots and 776 empty ones
  expect(boxes.boxes).toBeGreaterThanOrEqual(31 * 26);
  await expect(page.locator('#memBody')).toContainText('31 nodes × 26 slots = 806 slots.');
});

test('two thousand words: the same seven rings, and autocomplete from all of them', async ({ page }) => {
  await page.locator('#sizeSeg button[data-n="2000"]').click();
  await expect(page.locator('#sizeSeg button[data-n="2000"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(stats(page)).toHaveText('2,000 words · 4,746 nodes');
  // software WebGL draws two thousand words slowly, so drive it through the hooks rather than clicks
  await page.evaluate(() => {
    const T = window.__trie;
    T.type('ST');
    T.advance(5);
  });
  await expect(page.locator('#head')).toHaveText('ST: 44 words start with ST.');
  await expect(page.locator('#listBody .ls-note')).toContainText('44 of 2,000 words start with ST');
  expect(
    await page.evaluate(() =>
      window.__trie
        .currentPose()
        .fans[0].labels.map(l => l.text)
        .at(-1),
    ),
  ).toBe('+35');
});

test('a click on a letter inspects its node', async ({ page }) => {
  await playThrough(page);
  await page.evaluate(() => window.__trie.settle());
  const p = await page.evaluate(() => window.__trie.nodeScreen('f20', 'CAR'));
  expect(p).not.toBeNull();
  await page.mouse.click(p?.x ?? 0, p?.y ?? 0);
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#insState')).toContainText('CAR');
  await expect(page.locator('#insState')).toContainText('a word · ring 3');
  await expect(page.locator('#insGrid')).toContainText('3 of 26');
  await expect(page.locator('#insNote')).toContainText('D, E, T');
  await page.locator('#insClose').click();
  await expect(page.locator('#inspector')).toBeHidden();
});

test('reset brings back the twenty words', async ({ page }) => {
  await page.locator('#word').fill('ZOO');
  await page.locator('#bInsert').click();
  await playThrough(page);
  await expect(stats(page)).toHaveText('21 words · 33 nodes');
  await page.locator('#bReset').click();
  await expect(page.locator('#word')).toHaveValue('');
  await expect(stats(page)).toHaveText('20 words · 30 nodes');
  await expect(page.locator('#head')).toHaveText('20 words, written out: 63 letters.');
});
