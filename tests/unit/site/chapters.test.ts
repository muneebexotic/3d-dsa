// Guards the chapter catalogue, so adding a chapter cannot half-work: every live
// chapter needs its page, its entry module, and a place in the numbering.

import { describe, expect, it } from 'vitest';
import { CHAPTERS, LIVE_CHAPTERS, chapterPath } from '@/site/chapters';

const pages = import.meta.glob<string>('/*/index.html', { query: '?raw', import: 'default', eager: true });
const entries = Object.keys(import.meta.glob('/src/chapters/*/main.ts'));

describe('chapter catalogue', () => {
  it('numbers chapters 1, 2, 3 … with unique, URL-safe slugs', () => {
    expect(CHAPTERS.map(c => c.no)).toEqual(CHAPTERS.map((_, i) => i + 1));
    expect(new Set(CHAPTERS.map(c => c.slug)).size).toBe(CHAPTERS.length);
    for (const c of CHAPTERS) expect(c.slug).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('lists live chapters first, in learning order', () => {
    const firstSoon = CHAPTERS.findIndex(c => !c.live);
    // once the collection is complete there are none in the studio at all
    const studio = firstSoon < 0 ? [] : CHAPTERS.slice(firstSoon);
    expect(studio.every(c => !c.live)).toBe(true);
  });

  it.each(LIVE_CHAPTERS.map(c => [c.slug, c] as const))('%s has a page that loads its entry module', (slug, c) => {
    const html = pages[`/${slug}/index.html`];
    expect(html, `missing ${slug}/index.html`).toBeTruthy();
    expect(html).toContain(`src="/src/chapters/${slug}/main.ts"`);
    expect(html).toContain(`%VITE_SITE_URL%${chapterPath(slug)}`);
    expect(html).toContain(`<title>${c.title}`);
    expect(entries).toContain(`/src/chapters/${slug}/main.ts`);
  });

  it('has no pages for chapters that are not live', () => {
    for (const c of CHAPTERS.filter(c => !c.live)) expect(pages[`/${c.slug}/index.html`]).toBeUndefined();
  });
});
