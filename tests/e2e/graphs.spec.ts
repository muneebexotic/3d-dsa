import type { Page } from '@playwright/test';
import { expect, test, waitForChapter } from './support/fixtures';

const PRESETS = ['textbook', 'contrast', 'grid', 'sparse', 'dense', 'islands', 'large'] as const;
const MODES = [
  { button: 'BFS', label: 'Step' },
  { button: 'DFS', label: 'Step' },
  { button: 'Dijkstra', label: 'Step' },
  { button: 'Race', label: 'Tick' },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/graphs/');
  await waitForChapter(page, '__graph');
});

/** Play the loaded program through every step, drawing as it goes, faster than real time. */
async function playThrough(page: Page): Promise<number> {
  return page.evaluate(() => {
    const G = window.__graph;
    if (!G.player.playing) G.togglePlay();
    for (let guard = 0; guard < 400 && !(G.player.atEnd() && !G.player.playing); guard++) G.advance(2);
    return G.player.prog.steps.length;
  });
}

/** A clear spot on the plinth: the grid point furthest from every knot. */
async function clearSpot(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const nodes = [...window.__graph.graph.nodes.values()];
    let best = { x: 0, z: 0, d: -1 };
    for (let x = -4; x <= 4; x += 0.5)
      for (let z = -2; z <= 2; z += 0.5) {
        const d = Math.min(...nodes.map(n => Math.hypot(n.x - x, n.z - z)));
        if (d > best.d) best = { x, z, d };
      }
    return best;
  });
}

async function clickFloor(page: Page, x: number, z: number): Promise<void> {
  const p = await page.evaluate(([x, z]) => window.__graph.floorScreen(x, z), [x, z] as const);
  if (!p) throw new Error('that spot is off screen');
  await page.mouse.click(p.x, p.y);
}

async function clickKnot(page: Page, label: string): Promise<void> {
  const p = await page.evaluate(l => {
    const n = [...window.__graph.graph.nodes.values()].find(n => n.label === l);
    return n ? window.__graph.nodeScreen(0, n.id) : null;
  }, label);
  if (!p) throw new Error(`knot ${label} is not on screen`);
  await page.mouse.click(p.x, p.y);
}

for (const preset of PRESETS) {
  test(`${preset}: every algorithm plays to the end`, async ({ page }) => {
    test.slow();
    await page.locator('#selPreset').selectOption(preset);
    for (const mode of MODES) {
      await test.step(mode.button, async () => {
        const button = page.locator('#algoSeg').getByRole('button', { name: mode.button, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        const n = await playThrough(page);
        expect(n).toBeGreaterThan(1);
        await expect(page.locator('#stepno')).toHaveText(`${mode.label} ${n} / ${n}`);
        await expect(page.locator('#head')).not.toBeEmpty();
        await expect(page.locator('#bPlay')).toHaveAttribute('aria-label', 'Replay');
      });
    }
  });
}

test.describe('editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('#selPreset').selectOption('textbook');
    await page.locator('#algoSeg').getByRole('button', { name: 'Dijkstra', exact: true }).click();
    await page.evaluate(() => {
      if (window.__graph.player.playing) window.__graph.togglePlay();
      window.__graph.advance(2);
      window.__graph.settle();
    });
  });

  const count = (page: Page) =>
    page.evaluate(() => ({ nodes: window.__graph.graph.size, edges: window.__graph.graph.edges.size }));

  test('adds a knot where the plinth is clicked', async ({ page }) => {
    const before = await count(page);
    await page.locator('#toolRow').getByRole('button', { name: '+ Node' }).click();
    const spot = await clearSpot(page);
    await clickFloor(page, spot.x, spot.z);
    await expect.poll(() => count(page)).toEqual({ ...before, nodes: before.nodes + 1 });
    await expect(page.locator('#hint')).toContainText('Knot added');
  });

  test('ties a string between two knots and sets its weight', async ({ page }) => {
    const before = await count(page);
    await page.locator('#toolRow').getByRole('button', { name: '+ Edge' }).click();
    await clickKnot(page, 'A');
    await clickKnot(page, 'H');
    await expect.poll(() => count(page)).toEqual({ ...before, edges: before.edges + 1 });
    await expect(page.locator('#wpop')).toBeVisible();
    await page.locator('#wval').fill('42');
    await page.locator('#wval').press('Enter');
    const w = await page.evaluate(() => [...window.__graph.graph.edges.values()].at(-1)?.w);
    expect(w).toBe(42);
  });

  test('rejects a weight out of range', async ({ page }) => {
    await page.locator('#toolRow').getByRole('button', { name: '+ Edge' }).click();
    await clickKnot(page, 'A');
    await clickKnot(page, 'H');
    await page.locator('#wval').fill('100');
    await page.locator('#wval').press('Enter');
    await expect(page.locator('#werr')).not.toBeEmpty();
    await expect(page.locator('#wval')).toHaveAttribute('aria-invalid', 'true');
  });

  test('deletes a knot and its strings', async ({ page }) => {
    const before = await count(page);
    await page.locator('#toolRow').getByRole('button', { name: 'Delete' }).click();
    await clickKnot(page, 'E');
    await expect.poll(() => count(page)).toEqual({ nodes: before.nodes - 1, edges: before.edges - 3 });
  });

  test('switches to a directed graph', async ({ page }) => {
    await page.locator('#optDirected').check();
    expect(await page.evaluate(() => window.__graph.graph.directed)).toBe(true);
    await expect(page.locator('#selPreset')).toHaveValue('custom');
  });
});
