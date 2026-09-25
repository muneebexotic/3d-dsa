// The gallery's colours as linear-free sRGB triples, for instanced meshes and
// label shaders. The CSS versions of the same colours live in styles/tokens.css.

export type RGB = readonly [number, number, number];

/** 0xRRGGBB to an sRGB triple in [0, 1]. */
export const rgb = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** Blend two colours; returns one of the inputs unchanged at the ends. */
export const mix3 = (a: RGB, b: RGB, t: number): RGB =>
  a === b || t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The design tokens every chapter paints with. */
export const TONE = {
  paper: rgb(0xf8f5ee),
  ink: rgb(0x1b1a17),
  graphite: rgb(0x57524a),
  faint: rgb(0x8c857a),
  yellow: rgb(0xe8a817),
  yellowDeep: rgb(0xc48a0a),
  red: rgb(0xd1361e),
  cobalt: rgb(0x2346a8),
  cobaltDeep: rgb(0x172f78),
  /** Numerals on ink discs. */
  light: rgb(0xefe8da),
  white: [1, 1, 1] as RGB,
} as const;
