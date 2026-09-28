// The theme module outside a browser, where it stays light, and the way it reads
// the colours drawings are written in.

import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { TONE, nightHex } from '@/core/color';
import { isDark, nightCSS, setLinear, themed } from '@/core/theme';

const hex = (h: number) => `#${h.toString(16).padStart(6, '0')}`;

describe('theme', () => {
  it('is light without a browser, and paints colours as they are', () => {
    expect(isDark()).toBe(false);
    expect(themed(TONE.cobalt)).toBe(TONE.cobalt);
    const a = setLinear(new Color(), 0.1, 0.2, 0.3);
    expect([a.r, a.g, a.b]).toEqual([0.1, 0.2, 0.3]);
  });

  it('repaints every way a drawing writes a colour', () => {
    expect(nightCSS('#1B1A17')).toBe(hex(nightHex(0x1b1a17)));
    expect(nightCSS('#1b1a17')).toBe(hex(nightHex(0x1b1a17)));
    expect(nightCSS('#fff')).toBe(hex(nightHex(0xffffff)));
    expect(nightCSS('white')).toBe(hex(nightHex(0xffffff)));
    const n = nightHex(0x1b1a17);
    expect(nightCSS('rgba(27,26,23,.25)')).toBe(`rgba(${n >> 16},${(n >> 8) & 255},${n & 255},.25)`);
    expect(nightCSS('rgb(27, 26, 23)')).toBe(hex(n));
  });

  it('leaves what is not a colour alone', () => {
    for (const v of ['none', 'currentColor', 'url(#fade)', 'transparent', 'var(--ink)']) expect(nightCSS(v)).toBe(v);
  });
});
