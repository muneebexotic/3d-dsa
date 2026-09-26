// Sizes and places for Prefix Sunburst, in world units. The plinth top is y = 0, x
// runs to the right and z toward the viewer. A sunburst stands upright in the plane
// z = 0: its centre (the root) sits just above the plinth, and ring k, the k-th
// letter of every word, is a half circle of radius ringR(k) around it. Words run A
// to Z from left to right, so an angle of π is the start of the alphabet.

export const PH = 0.5; // plinth height

/* the sunburst */
/** Height of the centre above the plinth. */
export const HUB_Y = 0.42;
export const HUB_R = 0.52;
/** Ring k sits at R0 + k · DR from the centre. */
export const R0 = 1.45;
export const DR = 0.95;
export const ringR = (k: number): number => (k <= 0 ? 0 : R0 + k * DR);
/** Every sunburst has this many rings: no word in any dictionary is longer (MAX_LEN in words.ts). */
export const RINGS = 7;
/** The words fan out between these angles, clear of the plinth on both sides. */
export const TH0 = 0.15;
export const TH1 = Math.PI - TH0;
export const SPAN = TH1 - TH0;

/* discs */
export const DISC_MAX = 0.42;
export const DISC_MIN = 0.012;
/** A disc this small or smaller carries no letter: it is too small to read. */
export const LETTER_MIN = 0.07;
/** Below this, a node is only a point where its wires meet. */
export const DOT_MAX = 0.028;

/* read-out: suggestions stand in a ring of their own beyond the last letter */
export const RIM = ringR(RINGS) + 0.95;
/** At most this many words are read out at the rim; the card lists them all. */
export const RIM_MAX = 10;
export const PILL_H = 0.2;

/** Half the width a sunburst needs, read-out included. */
export const HALF_W = RIM + 0.75;
/** Three sunbursts stand one above another on a rack, this far apart: the smallest dictionary on top. */
export const LEVEL = RIM + 1.5;
export const fanY = (k: number, n: number): number => (n - 1 - k) * LEVEL;

/* the plinth: front and back edges */
export const PLINTH_Z0 = -1.5;
export const PLINTH_Z1 = 1.35;

/* memory: every node's 26 slots, in a row behind it */
export const SLOT_ROWS = 26;
/** Depth of one slot for a disc of radius r. */
export const cellOf = (r: number): number => Math.min(0.16, Math.max(0.01, r * 0.5));
/** The row of slots starts this far behind the disc. */
export const STRIP_GAP = 0.08;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A point at angle th, distance rr from the centre of a sunburst standing at x = cx. */
export const polarX = (cx: number, th: number, rr: number): number => cx + rr * Math.cos(th);
export const polarY = (th: number, rr: number): number => HUB_Y + rr * Math.sin(th);

/* camera: the ways to look */
export type View = 'letters' | 'memory';
export type Angle = View | 'three';
/**
 * Letters: from the front, a little to the left and above, so the sunburst reads
 * like a page. Memory: from the right, so the rows of slots behind every node
 * show. Three: square on, for three sunbursts side by side.
 */
export const VIEWS: Readonly<Record<Angle, { theta: number; phi: number; fov: number }>> = {
  letters: { theta: -0.14, phi: 1.34, fov: 30 },
  memory: { theta: 0.82, phi: 1.1, fov: 30 },
  three: { theta: -0.1, phi: 1.44, fov: 30 },
};
