// Every page loads cleanly under the production security headers, on desktop and phone.

import { expect, test, waitForChapter } from './support/fixtures';

const CHAPTERS = [
  { path: '/avl/', title: 'AVL Mobile', hook: '__avl' },
  { path: '/graphs/', title: 'Graph Net', hook: '__graph' },
  { path: '/lists/', title: 'Pointer Chain', hook: '__lists' },
] as const;

test('the landing page lists the catalogue', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page).toHaveTitle('3D Data Structures');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data structures, built to be watched.');
  await expect(page.locator('#cards > li')).toHaveCount(7);
  await expect(page.locator('#cards > li.live a')).toHaveCount(3);
  await expect(page.locator('#artMobile circle').first()).toBeAttached();
  await expect(page.locator('#artNet circle').first()).toBeAttached();
  await expect(page.locator('#artChain circle').first()).toBeAttached();
});

test('a catalogue card opens its chapter', async ({ page }) => {
  await page.goto('/');
  await page.locator('#cards a[href="/graphs/"]').click();
  await expect(page).toHaveURL(/\/graphs\/$/);
  await waitForChapter(page, '__graph');
});

for (const c of CHAPTERS) {
  test(`${c.title} loads and draws`, async ({ page }) => {
    await page.goto(c.path);
    await expect(page).toHaveTitle(new RegExp(`^${c.title}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(c.title);
    await waitForChapter(page, c.hook);
    const canvas = page.locator('#stage');
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(300);
    expect(box?.height).toBeGreaterThan(300);
    await expect(page.locator('#transport #bPlay')).toBeVisible();
    await expect(page.locator('#head')).not.toBeEmpty();
  });
}

test('the 404 page points back to the catalogue', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('fallen off');
  await page.getByRole('link', { name: 'Back to the catalogue' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('search engines get a sitemap', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const p of ['/', '/avl/', '/graphs/', '/lists/']) expect(sitemap).toContain(`${p}</loc>`);
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
});
