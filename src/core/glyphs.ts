// Wire glyphs: monoline numerals, capitals and a few symbols in a 62 x 100 box,
// stroked with round ends. Drawn procedurally on canvas and in SVG, never typeset.

export const GLYPH: Readonly<Record<string, string>> = {
  '0': 'M6 31 A25 25 0 0 1 56 31 L56 69 A25 25 0 0 1 6 69 Z',
  '1': 'M16 20 L36 6 L36 94',
  '2': 'M8 30 A23 23 0 1 1 49 44 L7 94 L56 94',
  '3': 'M9 22 A21 21 0 1 1 30 48 A23 23 0 1 1 8 79',
  '4': 'M44 94 L44 6 L6 66 L58 66',
  '5': 'M52 6 L15 6 L12 43 A28 28 0 1 1 7 80',
  '6': 'M47 7 Q12 26 6 67 A25 25 0 0 0 56 67 A25 25 0 0 0 6 67',
  '7': 'M6 6 L56 6 L22 94',
  '8': 'M11 27 A20 20 0 1 1 51 27 A20 20 0 1 1 11 27 M7 70 A24 24 0 1 1 55 70 A24 24 0 1 1 7 70',
  '9': 'M56 33 A25 25 0 1 1 6 33 A25 25 0 1 1 56 33 Q52 72 15 93',
  '-': 'M8 52 L50 52',
  '+': 'M8 52 L50 52 M29 31 L29 73',
  '∞': 'M31 50 C20 30 4 36 4 50 C4 64 20 70 31 50 C42 30 58 36 58 50 C58 64 42 70 31 50',
  A: 'M6 94 L31 6 L56 94 M15 64 L47 64',
  B: 'M10 94 L10 6 L34 6 A20 20 0 0 1 34 46 L10 46 M34 46 A24 24 0 0 1 34 94 L10 94',
  C: 'M55 24 A25 25 0 0 0 6 31 L6 69 A25 25 0 0 0 55 76',
  D: 'M10 6 L10 94 L28 94 A28 28 0 0 0 56 66 L56 34 A28 28 0 0 0 28 6 Z',
  E: 'M54 6 L10 6 L10 94 L54 94 M10 50 L46 50',
  F: 'M54 6 L10 6 L10 94 M10 50 L46 50',
  G: 'M55 24 A25 25 0 0 0 6 31 L6 69 A25 25 0 0 0 56 69 L56 52 L34 52',
  H: 'M8 6 L8 94 M54 6 L54 94 M8 50 L54 50',
  I: 'M31 6 L31 94 M16 6 L46 6 M16 94 L46 94',
  J: 'M50 6 L50 70 A22 22 0 0 1 6 72',
  K: 'M10 6 L10 94 M54 6 L10 58 M26 42 L56 94',
  L: 'M10 6 L10 94 L54 94',
  M: 'M6 94 L6 6 L35 62 L64 6 L64 94',
  N: 'M8 94 L8 6 L54 94 L54 6',
  O: 'M6 50 A28 44 0 1 1 62 50 A28 44 0 1 1 6 50',
  P: 'M10 94 L10 6 L34 6 A22 22 0 0 1 34 50 L10 50',
  Q: 'M6 50 A28 44 0 1 1 62 50 A28 44 0 1 1 6 50 M42 72 L62 96',
  R: 'M10 94 L10 6 L34 6 A22 22 0 0 1 34 50 L10 50 M30 50 L56 94',
  S: 'M52 18 A22 22 0 1 0 31 50 A22 22 0 1 1 10 80',
  T: 'M6 6 L56 6 M31 6 L31 94',
  U: 'M8 6 L8 68 A23 26 0 0 0 54 68 L54 6',
  V: 'M6 6 L31 94 L56 6',
  W: 'M4 6 L18 94 L35 30 L52 94 L66 6',
  X: 'M8 6 L54 94 M54 6 L8 94',
  Y: 'M6 6 L31 50 L56 6 M31 50 L31 94',
  Z: 'M8 6 L54 6 L8 94 L54 94',
  ' ': '',
};
/** Ink extents [min, max] in the 62-wide box, for glyphs that are not full width. */
export const GM: Readonly<Record<string, readonly [number, number]>> = {
  ' ': [0, 22],
  '1': [9, 43],
  '4': [0, 64.5],
  '-': [1, 57],
  '+': [1, 57],
  I: [10, 52],
  M: [0, 70],
  W: [0, 70],
  O: [0, 68],
  Q: [0, 68],
};
const ALIAS: Readonly<Record<string, string>> = { '−': '-' };
const TRACK = 12;

export interface PlacedGlyph {
  ch: string;
  /** Left edge of the glyph box, relative to the centre of the string. */
  x: number;
  /** Scale from glyph units to output units. */
  k: number;
}

let paths: Record<string, Path2D> | null = null;
const glyphPaths = (): Record<string, Path2D> => {
  if (!paths) {
    paths = {};
    for (const k in GLYPH) paths[k] = new Path2D(GLYPH[k]);
  }
  return paths;
};
const charsOf = (str: string | number): string[] =>
  [...String(str)].map(ch => ALIAS[ch] || ch).filter(ch => GLYPH[ch] != null);
const extent = (ch: string): readonly [number, number] => GM[ch] || [0, 62];

/** Lay out a string at glyph height h, centred on 0. */
export function glyphLayout(str: string | number, h: number): PlacedGlyph[] {
  const k = h / 100;
  const chars = charsOf(str);
  const widths = chars.map(ch => extent(ch)[1] - extent(ch)[0]);
  const total = widths.reduce((a, b) => a + b, 0) + TRACK * Math.max(0, chars.length - 1);
  let cur = -total / 2;
  return chars.map((ch, i) => {
    const x = (cur - extent(ch)[0]) * k;
    cur += widths[i] + TRACK;
    return { ch, x, k };
  });
}

/** Width of a string at glyph height h. */
export function glyphWidth(str: string | number, h: number): number {
  const chars = charsOf(str);
  const w = chars.reduce((a, ch) => a + extent(ch)[1] - extent(ch)[0], 0) + TRACK * Math.max(0, chars.length - 1);
  return (w * h) / 100;
}

/** Stroke a string onto a canvas, centred on (cx, cy). */
export function drawGlyphs(
  g: CanvasRenderingContext2D,
  str: string | number,
  cx: number,
  cy: number,
  h: number,
  sw = 13,
): void {
  const P = glyphPaths();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const { ch, x, k } of glyphLayout(str, h)) {
    g.save();
    g.translate(cx + x, cy - 50 * k);
    g.scale(k, k);
    g.lineWidth = sw;
    g.stroke(P[ch]);
    g.restore();
  }
}

/** SVG paths for a string, centred on (cx, cy). */
export function glyphSVG(str: string | number, cx: number, cy: number, h: number, color: string, sw = 13): string {
  return glyphLayout(str, h)
    .map(
      ({ ch, x, k }) =>
        `<path d="${GLYPH[ch]}" transform="translate(${(cx + x).toFixed(2)} ${(cy - 50 * k).toFixed(2)}) scale(${k.toFixed(4)})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
}

/** Glyph height for a number on a disc, as a fraction of the disc diameter. */
export const numeralHeight = (v: string | number): number =>
  ({ 1: 0.46, 2: 0.42, 3: 0.34 })[String(v).length as 1 | 2 | 3] || 0.3;
