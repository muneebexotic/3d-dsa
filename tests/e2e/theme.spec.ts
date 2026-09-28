// Dark mode: the page follows the system until the viewer chooses, the choice is
// kept from page to page, and a chapter changes over while it runs, the 3D room
// and the drawings in its panels alike.

import { expect, test, waitForChapter } from './support/fixtures';

/** How light an 'rrggbb' colour is, 0 (black) to 1 (white); the day room is about 0.85. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('the landing page follows the system until the switch overrides it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html'),
    toggle = page.locator('#bTheme');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // the drawings are painted by day and repainted for the dark
  await expect(page.locator('#artMobile [stroke="#1B1A17"]')).toHaveCount(0);

  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('#artMobile [stroke="#1B1A17"]').count()).toBeGreaterThan(0);

  // a choice outlasts a reload, even against the system
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');

  // choosing what the system shows forgets the choice
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
});

test('a chapter goes dark while it runs, and the next page opens dark', async ({ page }) => {
  await page.goto('/graphs/');
  await waitForChapter(page, '__graph');
  const room = () => page.evaluate(() => window.__graph.roomColour());
  expect(await room()).toBe('e2dacb');
  await expect(page.locator('#legend [fill="#F8F5EE"]')).not.toHaveCount(0);

  await page.locator('#bTheme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(luminance(await room())).toBeLessThan(0.3);
  await expect(page.locator('#legend [fill="#F8F5EE"]')).toHaveCount(0);

  await page.goto('/hashing/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await waitForChapter(page, '__hashing');
  await expect(page.locator('#bTheme')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/graphs/');
  await waitForChapter(page, '__graph');
  expect(luminance(await room())).toBeLessThan(0.3);
  await page.locator('#bTheme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await room()).toBe('e2dacb');
  await expect(page.locator('#legend [fill="#F8F5EE"]')).not.toHaveCount(0);
});
