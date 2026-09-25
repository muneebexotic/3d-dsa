import { describe, expect, it } from 'vitest';
import { GLYPH, GM, glyphLayout, glyphSVG, glyphWidth, numeralHeight } from '@/core/glyphs';

describe('glyphs', () => {
  it('has a glyph for every digit and capital letter', () => {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(GLYPH[ch], ch).toBeTruthy();
  });

  it('centres a string on zero', () => {
    for (const s of ['7', '42', '999', 'AB', '∞']) {
      const h = 10,
        [first] = glyphLayout(s, h);
      const inkLeft = first.x + (GM[first.ch]?.[0] ?? 0) * first.k;
      expect(inkLeft, s).toBeCloseTo(-glyphWidth(s, h) / 2, 9);
    }
  });

  it('scales with height, and grows with each character', () => {
    expect(glyphWidth('42', 20)).toBeCloseTo(2 * glyphWidth('42', 10));
    expect(glyphWidth('421', 10)).toBeGreaterThan(glyphWidth('42', 10));
  });

  it('skips characters it cannot draw', () => {
    expect(glyphLayout('4?2', 10).map(p => p.ch)).toEqual(['4', '2']);
  });

  it('draws one SVG path per character', () => {
    expect(glyphSVG('123', 0, 0, 10, '#000').match(/<path /g)).toHaveLength(3);
  });

  it('shrinks longer numbers to fit the disc', () => {
    expect(numeralHeight(7)).toBeGreaterThan(numeralHeight(42));
    expect(numeralHeight(42)).toBeGreaterThan(numeralHeight(420));
  });
});
