// night() is the whole of dark mode for the pieces: every scene, panel and drawing
// is painted with its daylight colours and passed through it. These tests hold it
// to its promise: lightness turns inside out, hues stay put, and every numeral that
// reads on its disc by day still reads on it at night.

import { describe, expect, it } from 'vitest';
import { FILL, NUMC } from '@/chapters/avl/poses';
import { STATE } from '@/chapters/graphs/palette';
import { PAINT as HASH_PAINT } from '@/chapters/hashing/palette';
import { PAINT as HEAP_PAINT } from '@/chapters/heap/palette';
import { KNOT_PAINT, PAINT as LIST_PAINT } from '@/chapters/lists/palette';
import { dye, glyphOn } from '@/chapters/sorting/palette';
import { TONE, night, nightHex, oklab, rgb, type RGB } from '@/core/color';
import { mulberry } from '@/core/random';

/** WCAG contrast ratio between two sRGB colours. */
function contrast(a: RGB, b: RGB): number {
  const lum = (c: RGB) => {
    const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const L = (c: RGB) => oklab(c)[0];
const hue = (c: RGB) => {
  const [, a, b] = oklab(c);
  return (Math.atan2(b, a) * 180) / Math.PI;
};

describe('night()', () => {
  it('turns ink to bone and paper to charcoal', () => {
    expect(L(night(TONE.ink))).toBeGreaterThan(0.85);
    expect(L(night(TONE.paper))).toBeLessThan(0.3);
    expect(L(night(TONE.white))).toBeLessThan(L(night(TONE.paper)));
  });

  it('reverses the order of lightness for any two colours', () => {
    const rnd = mulberry(7),
      cs: RGB[] = Array.from({ length: 400 }, () => [rnd(), rnd(), rnd()]);
    for (const a of cs)
      for (const b of cs) if (L(a) < L(b) - 0.02) expect(L(night(a)), `${a} vs ${b}`).toBeGreaterThan(L(night(b)));
  });

  it('keeps the hue of every accent', () => {
    for (const c of [TONE.yellow, TONE.yellowDeep, TONE.red, TONE.cobalt, TONE.cobaltDeep, dye(0), dye(1)]) {
      const d = Math.abs(hue(night(c)) - hue(c));
      expect(Math.min(d, 360 - d), String(c)).toBeLessThan(6);
    }
  });

  it('keeps every numeral legible on its disc', () => {
    const pairs: [string, RGB, RGB][] = [];
    const paints = { graphs: STATE, hashing: HASH_PAINT, heap: HEAP_PAINT, lists: LIST_PAINT, knots: KNOT_PAINT };
    for (const [ch, table] of Object.entries(paints))
      for (const [k, p] of Object.entries(table)) pairs.push([`${ch} ${k}`, p.fill, p.glyph]);
    for (const k of Object.keys(FILL) as (keyof typeof FILL)[])
      pairs.push([`avl ${k}`, rgb(FILL[k].getHex()), rgb(NUMC[k].getHex())]);
    for (const [name, fill, glyph] of pairs) {
      expect(contrast(fill, glyph), `${name} by day`).toBeGreaterThan(4.5);
      expect(contrast(night(fill), night(glyph)), `${name} at night`).toBeGreaterThan(3.5);
    }
    // the loom's indigo ramp, whose numerals switch from ink to white part way along
    for (let t = 0; t <= 1; t += 0.01) {
      expect(contrast(dye(t), glyphOn(t)), `loom ${t} by day`).toBeGreaterThan(3.5);
      expect(contrast(night(dye(t)), night(glyphOn(t, true))), `loom ${t} at night`).toBeGreaterThan(3.5);
    }
  });

  it('gives the same answer for the same colour, however it is held', () => {
    const c: RGB = [0.3, 0.6, 0.9];
    expect(night([0.3, 0.6, 0.9])).toEqual(night(c));
    expect(night(c)).toBe(night(c));
    const [r, g, b] = night(rgb(0xe8a817));
    expect(nightHex(0xe8a817)).toBe((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255));
  });

  it('reads a colour afresh from an array that is reused with new contents', () => {
    const scratch: [number, number, number] = [...TONE.red];
    const red = night(scratch);
    scratch[0] = TONE.yellow[0];
    scratch[1] = TONE.yellow[1];
    scratch[2] = TONE.yellow[2];
    expect(night(scratch)).toEqual(night(TONE.yellow));
    expect(night(scratch)).not.toEqual(red);
  });

  it('stays inside sRGB', () => {
    const rnd = mulberry(11);
    for (let i = 0; i < 2000; i++) for (const v of night([rnd(), rnd(), rnd()])) expect(v >= 0 && v <= 1).toBe(true);
  });
});
