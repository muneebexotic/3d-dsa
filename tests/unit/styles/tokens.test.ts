// Keeps the stylesheets' dark mode in step with the pieces: each colour token's
// dark value must be night() of its daylight value, so the panels match what the
// 3D scenes and drawings show; and no rule may use a colour except through a token,
// or it would stay the same colour after dark.

import { describe, expect, it } from 'vitest';
import { night, nightHex } from '@/core/color';

const sheets = import.meta.glob<string>('/src/**/*.css', { query: '?raw', import: 'default', eager: true });
const pages = import.meta.glob<string>(['/index.html', '/404.html', '/*/index.html', '!/dist*/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Colours lit for the dark room by hand rather than turned over by night(): shadows fall black at night. */
const HAND_LIT = new Set(['--shade-rgb', '--glow', '--dusk']);

const DAY = /(?:^|\n):root\s*\{([^}]*)\}/;
const NIGHT = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/;

function tokens(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}
/** A colour written out, not one made from another token (those follow their token after dark by themselves). */
const isColour = (v: string) =>
  !v.includes('var(') && (/^#[0-9a-f]{3,6}$/i.test(v) || /^\d+,\s*\d+,\s*\d+$/.test(v) || /^rgba?\(/.test(v));
const hexOf = (h: number) => `#${h.toString(16).padStart(6, '0')}`;
function expand(v: string): number {
  const h = v.slice(1);
  return parseInt(h.length === 3 ? [...h].map(c => c + c).join('') : h, 16);
}

describe('design tokens after dark', () => {
  const themed = Object.entries(sheets).filter(([, css]) => NIGHT.test(css));

  it('are defined in the shared tokens and on the landing page', () => {
    expect(themed.map(([f]) => f).sort()).toEqual(['/src/home/home.css', '/src/styles/tokens.css']);
  });

  it.each(themed)('%s: every daylight colour has its night() twin', (_, css) => {
    const day = tokens(DAY.exec(css)?.[1] ?? ''),
      dark = tokens(NIGHT.exec(css)?.[1] ?? '');
    for (const [name, v] of day) {
      if (!isColour(v)) continue;
      const d = dark.get(name);
      expect(d, `${name} has no dark value`).toBeTruthy();
      if (HAND_LIT.has(name) || !d) continue;
      if (v.startsWith('#')) expect(d.toLowerCase(), name).toBe(hexOf(nightHex(expand(v))));
      else if (/^\d/.test(v)) {
        const [r, g, b] = v.split(',').map(Number),
          n = night([r / 255, g / 255, b / 255]).map(c => Math.round(c * 255));
        expect(d, name).toBe(n.join(', '));
      }
    }
    for (const name of dark.keys()) expect(day.has(name), `${name} is dark-only`).toBe(true);
  });

  it.each(Object.entries(sheets))('%s: colours only through tokens', (_, css) => {
    const rules = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(DAY, '')
      .replace(NIGHT, '');
    expect(rules.match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi) ?? []).toEqual([]);
  });

  it.each(Object.entries(pages))('%s sets the theme before it paints', (_, html) => {
    const script = html.indexOf('<script src="/theme.js"></script>'),
      sheet = html.indexOf('rel="stylesheet"');
    expect(script).toBeGreaterThan(0);
    expect(script).toBeLessThan(sheet);
    // the browser's own chrome matches the page in either theme
    expect(html).toContain('content="#ECE6DA" media="(prefers-color-scheme: light)"');
    expect(html).toContain(`content="${hexOf(nightHex(0xece6da)).toUpperCase()}" media="(prefers-color-scheme: dark)"`);
  });
});
