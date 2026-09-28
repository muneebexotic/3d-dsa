// The viewer's colour theme: light, the gallery by day, or dark, the same gallery
// after hours, where every colour passes through night(). A saved choice wins,
// otherwise the system's. public/theme.js sets the theme before the page paints;
// this module keeps everything else in step as it changes: the 3D scenes, the
// drawings in the panels, the browser's own chrome, and other tabs. Safe to import
// outside a browser, where it stays light.

// tint() and watchTheme() keep what they are given for the life of the page, so
// use them for things made once (a stage, a plinth), not for every piece a scene
// makes and frees; share a tinted colour between those instead.

import { SRGBColorSpace, type Color } from 'three';
import { night, nightHex, rgb, type RGB } from './color';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
/** The page colour by day (--plaster), for the browser's chrome. */
const PAGE = 0xece6da;
const root = typeof document === 'undefined' ? null : document.documentElement;
const system = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const watchers: ((dark: boolean) => void)[] = [];

function savedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null; // storage blocked: follow the system
  }
}
const systemTheme = (): Theme => (system?.matches ? 'dark' : 'light');

let dark = (savedTheme() ?? systemTheme()) === 'dark';

export const isDark = (): boolean => dark;

/** Calls fn with the current theme now, and again whenever it changes. */
export function watchTheme(fn: (dark: boolean) => void): void {
  watchers.push(fn);
  fn(dark);
}

/**
 * Chooses a theme. Choosing the one the system already shows forgets the choice,
 * so the page follows the system again from then on.
 */
export function setTheme(t: Theme): void {
  try {
    if (t === systemTheme()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  apply(t === 'dark');
}

export const toggleTheme = (): void => setTheme(dark ? 'light' : 'dark');

function apply(next: boolean): void {
  if (root) root.dataset.theme = next ? 'dark' : 'light';
  const page = `#${(next ? nightHex(PAGE) : PAGE).toString(16).padStart(6, '0')}`;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', page);
  if (next === dark) return;
  dark = next;
  repaintDrawings();
  for (const fn of watchers) fn(dark);
}

/** Wires a dark mode switch: aria-pressed says whether the page is dark, and pressing it swaps the theme. */
export function bindThemeSwitch(el: HTMLElement): void {
  watchTheme(d => el.setAttribute('aria-pressed', String(d)));
  el.addEventListener('click', toggleTheme);
}

/* ---------- colours for the scenes ---------- */

/** An sRGB triple as the current theme shows it. */
export const themed = (c: RGB): RGB => (dark ? night(c) : c);

/** Keeps a Three.js colour at this 0xRRGGBB daylight colour, as the current theme shows it. */
export function tint(color: Color, hex: number): Color {
  watchTheme(d => color.setHex(d ? nightHex(hex) : hex));
  return color;
}

/** A material whose colour stays at this 0xRRGGBB daylight colour, as the current theme shows it. */
export function tinted<M extends { color: Color }>(material: M, hex: number): M {
  tint(material.color, hex);
  return material;
}

const _srgb = { r: 0, g: 0, b: 0 };
const _c: [number, number, number] = [0, 0, 0];

/** Sets a Three.js colour from linear RGB (the working colour space), as the current theme shows it. */
export function setLinear(color: Color, r: number, g: number, b: number): Color {
  color.setRGB(r, g, b);
  if (!dark) return color;
  color.getRGB(_srgb, SRGBColorSpace);
  _c[0] = _srgb.r;
  _c[1] = _srgb.g;
  _c[2] = _srgb.b;
  const n = night(_c);
  return color.setRGB(n[0], n[1], n[2], SRGBColorSpace);
}

/* ---------- drawings in the page ---------- */
// Panels, legends and the landing page draw inline SVG with daylight colours in
// fill and stroke. While the page is dark, every drawing that appears is repainted
// before the browser shows it, and each attribute's daylight value is kept so the
// drawing can be put back.

const PAINTED = ['fill', 'stroke', 'stop-color'] as const;
type Painted = (typeof PAINTED)[number];
const SELECTOR = PAINTED.map(a => `[${a}]`).join(',');
const daylight = new WeakMap<Element, Partial<Record<Painted, string>>>();
const cssNight = new Map<string, string>();

const hex2 = (x: number) =>
  Math.round(x * 255)
    .toString(16)
    .padStart(2, '0');

/** A CSS colour by night: #rgb, #rrggbb, rgb() and rgba(). Anything else (none, currentColor, url()) is kept. */
export function nightCSS(v: string): string {
  let out = cssNight.get(v);
  if (out !== undefined) return out;
  out = v;
  const s = v.trim().toLowerCase();
  let c: RGB | null = null,
    alpha = '';
  if (/^#[0-9a-f]{6}$/.test(s)) c = rgb(parseInt(s.slice(1), 16));
  else if (/^#[0-9a-f]{3}$/.test(s)) c = rgb(parseInt(s[1] + s[1] + s[2] + s[2] + s[3] + s[3], 16));
  else if (s === 'white') c = [1, 1, 1];
  else if (s === 'black') c = [0, 0, 0];
  else {
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(s);
    if (m) {
      c = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
      alpha = m[4] ?? '';
    }
  }
  if (c) {
    const n = night(c);
    out = alpha
      ? `rgba(${Math.round(n[0] * 255)},${Math.round(n[1] * 255)},${Math.round(n[2] * 255)},${alpha})`
      : `#${hex2(n[0])}${hex2(n[1])}${hex2(n[2])}`;
  }
  cssNight.set(v, out);
  return out;
}

function repaint(el: Element): void {
  let day = daylight.get(el);
  for (const a of PAINTED) {
    const now = el.getAttribute(a);
    if (now === null) continue;
    if (dark) {
      if (!day) daylight.set(el, (day = {}));
      const was = day[a];
      // a value that is not the one we painted was set by the drawing itself: it is the new daylight value
      if (was === undefined || now !== nightCSS(was)) day[a] = now;
      const n = nightCSS(day[a] as string);
      if (n !== now) el.setAttribute(a, n);
    } else if (day?.[a] !== undefined) {
      if (now === nightCSS(day[a] as string)) el.setAttribute(a, day[a] as string);
      delete day[a];
    }
  }
}

function repaintTree(node: Node): void {
  if (!(node instanceof Element)) return;
  if (node.matches(SELECTOR)) repaint(node);
  for (const el of node.querySelectorAll(SELECTOR)) repaint(el);
}

const observer =
  typeof MutationObserver === 'function'
    ? new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes') repaint(r.target as Element);
          else for (const n of r.addedNodes) repaintTree(n);
        }
      })
    : null;

/** Repaints every drawing for the current theme; while dark, keeps repainting drawings as they appear. */
function repaintDrawings(): void {
  if (!root || !observer) return;
  observer.disconnect();
  repaintTree(root);
  observer.takeRecords();
  if (dark) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [...PAINTED] });
}

if (root) {
  apply(dark);
  repaintDrawings();
  // another tab chose a theme, or the system changed while nothing is chosen
  addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) apply((savedTheme() ?? systemTheme()) === 'dark');
  });
  system?.addEventListener('change', () => {
    if (!savedTheme()) apply(systemTheme() === 'dark');
  });
}
