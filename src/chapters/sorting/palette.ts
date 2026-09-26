// How Sorting Loom is dyed, in sRGB for the scene and hex for the panels. Threads
// are indigo, paler for small keys and deeper for big ones, so a sorted row is a
// smooth ramp; comparisons are gold weft; twins that cross tie a red knot.

import { TONE, mix3, rgb, type RGB } from '../../core/color';

export const COL = {
  ...TONE,
  cell: rgb(0xf4efe6),
  spare: rgb(0xe3dccf),
  plinth: rgb(0xf7f3eb),
  /** The weft laid by a comparison: bright while it is new, deep once woven in. */
  weft: rgb(0xe8a817),
  weftDeep: rgb(0xb07b08),
  knot: rgb(0xd1361e),
  heddle: rgb(0x57524a),
  /** The bed the cloth lies on. */
  linen: rgb(0xebe2cf),
} as const;

/** The indigo ramp, pale to deep, as lightness falls evenly. */
const RAMP_HEX = ['#8FA3DB', '#5F7BCC', '#2E4DAF', '#172360'] as const;
const RAMP: readonly RGB[] = RAMP_HEX.map(h => rgb(parseInt(h.slice(1), 16)));

/** A thread's dye: t = 0 for the smallest key, 1 for the biggest. */
export function dye(t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1),
    i = Math.min(RAMP.length - 2, Math.floor(x));
  return mix3(RAMP[i], RAMP[i + 1], x - i);
}

/** Where value v sits on the ramp, when the biggest value is top. */
export const shade = (v: number, top: number): number => (top <= 1 ? 0.5 : (v - 1) / (top - 1));

const hex2 = (x: number) =>
  Math.round(x * 255)
    .toString(16)
    .padStart(2, '0');
export const hexOf = (c: RGB): string => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`.toUpperCase();

/** Numerals on a disc: ink on the pale end, white on the deep end. */
export const glyphOn = (t: number): RGB => (t < 0.42 ? COL.ink : COL.white);
