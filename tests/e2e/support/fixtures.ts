// Every spec fails if the page logs an error or warning: that includes uncaught
// exceptions and anything the Content-Security-Policy blocks.

import { test as base, expect, type Page } from '@playwright/test';

/** Driver chatter from software WebGL in headless browsers, not from our code. */
const NOISE = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL/;

export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', m => {
        if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(m.text()))
          problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', e => problems.push(`uncaught: ${e.message}`));
      await use(problems);
      expect(problems, 'the page logged errors or warnings').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits until a chapter's scene and test hooks are up. */
export async function waitForChapter(
  page: Page,
  hook: '__avl' | '__graph' | '__lists' | '__hashing' | '__heap' | '__sorting' | '__trie',
): Promise<void> {
  await page.waitForFunction(h => !!window[h]?.player, hook);
}
