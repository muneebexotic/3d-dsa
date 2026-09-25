// The navigation every chapter shares. Desktop: a pill row at the top of the dock.
// Phone: a menu button among the tools, opening a list of every chapter.

import { byId } from '../core/dom';
import { CHAPTERS, LIVE_CHAPTERS, SITE_NAME, chapterPath } from './chapters';

export interface NavOptions {
  /** Slug of the chapter this page shows. */
  current: string;
  dock?: HTMLElement;
  tools?: HTMLElement;
}

const GRID_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';

export function mountNav({ current, dock = byId('dock'), tools = byId('tools') }: NavOptions): { close(): void } {
  const here = (slug: string) => (slug === current ? ' aria-current="page"' : '');
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Chapters');
  nav.innerHTML =
    `<a class="home" href="/">${SITE_NAME}</a>` +
    LIVE_CHAPTERS.map(c => `<a href="${chapterPath(c.slug)}"${here(c.slug)}>No. ${c.no} · ${c.short}</a>`).join('');
  dock.prepend(nav);

  const btn = document.createElement('button');
  btn.className = 'icon';
  btn.id = 'bNav';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Chapters');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'navMenu');
  btn.innerHTML = GRID_ICON;
  tools.prepend(btn);

  const menu = document.createElement('div');
  menu.id = 'navMenu';
  menu.className = 'card';
  menu.hidden = true;
  menu.innerHTML =
    `<a href="/"><b>${SITE_NAME}</b><span>All chapters</span></a>` +
    CHAPTERS.map(c =>
      c.live
        ? `<a href="${chapterPath(c.slug)}"${here(c.slug)}><b>No. ${c.no} · ${c.title}</b><span>${c.topic}</span></a>`
        : `<a class="soon" aria-disabled="true"><b>No. ${c.no} · ${c.title}</b><span>In the studio</span></a>`,
    ).join('');
  document.body.appendChild(menu);

  const set = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    set(menu.hidden !== false);
  });
  addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(e.target as Node)) set(false);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) set(false);
  });
  return { close: () => set(false) };
}
