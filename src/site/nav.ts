// The navigation every chapter shares. Desktop: a pill at the top of the dock with
// the site name and this chapter; the chapter opens a list of every chapter.
// Phone: a menu button among the tools opens the same list. The dark mode switch
// ends the pill, or the list on a phone.

import { byId } from '../core/dom';
import { bindThemeSwitch } from '../core/theme';
import { CHAPTERS, SITE_NAME, chapterPath } from './chapters';

export interface NavOptions {
  /** Slug of the chapter this page shows. */
  current: string;
  dock?: HTMLElement;
  tools?: HTMLElement;
}

const CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5"/></svg>';
/** A moon while the page is dark, a sun while it is light. The landing page's header has the same two icons. */
const THEME_ICONS =
  '<svg class="th-dark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.6 A8 8 0 1 1 9.4 4.5 A6.4 6.4 0 0 0 19.5 14.6 Z"/></svg>' +
  '<svg class="th-light" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 2.8 V5 M12 19 V21.2 M2.8 12 H5 M19 12 H21.2 M5.5 5.5 L7.1 7.1 M16.9 16.9 L18.5 18.5 M5.5 18.5 L7.1 16.9 M16.9 7.1 L18.5 5.5"/></svg>';
const GRID_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';

export function mountNav({ current, dock = byId('dock'), tools = byId('tools') }: NavOptions): { close(): void } {
  const here = (slug: string) => (slug === current ? ' aria-current="page"' : '');
  const me = CHAPTERS.find(c => c.slug === current);
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Chapters');
  nav.innerHTML = `<a class="home" href="/">${SITE_NAME}</a>`;
  const hereBtn = document.createElement('button');
  hereBtn.type = 'button';
  hereBtn.className = 'here';
  hereBtn.setAttribute('aria-haspopup', 'true');
  hereBtn.setAttribute('aria-expanded', 'false');
  hereBtn.setAttribute('aria-controls', 'navMenu');
  hereBtn.innerHTML = `${me ? `No. ${me.no} · ${me.short}` : 'Chapters'}${CHEVRON}`;
  nav.appendChild(hereBtn);
  const themeBtn = document.createElement('button');
  themeBtn.className = 'theme-switch';
  themeBtn.id = 'bTheme';
  themeBtn.type = 'button';
  themeBtn.setAttribute('aria-label', 'Dark mode');
  themeBtn.innerHTML = THEME_ICONS;
  bindThemeSwitch(themeBtn);
  nav.appendChild(themeBtn);
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
  menu.setAttribute('aria-label', 'Chapters');
  menu.innerHTML =
    `<a href="/"><b>${SITE_NAME}</b><span>All chapters</span></a>` +
    CHAPTERS.map(c =>
      c.live
        ? `<a href="${chapterPath(c.slug)}"${here(c.slug)}><b>No. ${c.no} · ${c.title}</b><span>${c.topic}</span></a>`
        : `<a class="soon" aria-disabled="true"><b>No. ${c.no} · ${c.title}</b><span>In the studio</span></a>`,
    ).join('') +
    `<button type="button" id="navTheme" class="theme-switch" aria-label="Dark mode"><b>Dark mode</b>${THEME_ICONS}</button>`;
  document.body.appendChild(menu);
  bindThemeSwitch(byId('navTheme'));

  const set = (open: boolean) => {
    menu.hidden = !open;
    for (const b of [btn, hereBtn]) b.setAttribute('aria-expanded', String(open));
  };
  for (const b of [btn, hereBtn])
    b.addEventListener('click', e => {
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
