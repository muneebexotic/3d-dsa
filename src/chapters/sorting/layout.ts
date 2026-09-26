// Sizes and places for Sorting Loom, in world units. The plinth top is y = 0, x runs
// to the right and z toward the viewer. Each loom's front, where the threads stand
// in their slots, is the line z = 0; the cloth it weaves reaches back from there,
// one row per comparison. A thread stands as high as its value.

import { pairs } from './sorts';

export const PH = 0.5; // plinth height

/* the front of a loom: a row of cells, a heddle standing in each */
export const CELL_H = 0.1;
export const CELL_D = 0.5;
/** Slot numbers sit this far in front of the cells. */
export const IDX_Z = 0.52;
/** A key lifted out of the row comes this far forward, and this far up. */
export const LIFT_Z = 0.62;
export const LIFT_Y = 0.16;
/** Behind the front, threads come down from their heddles over this distance to lie on the cloth. */
export const SHED = 2.2;
/** The woven cloth lies this high, and a bigger key's thread lies up to OVER higher, over a smaller one. */
export const FLAT = 0.06;
export const OVER = 0.03;
/** Heights of the smallest and the biggest key. */
export const H_LO = 0.4;
export const H_HI = 2.3;

/* looms */
export const SOLO_W = 6.2;
export const RACE_W = 3.2;
export const RACE_GAP = 0.8;
/** How long a cloth is that compares every pair once: longer for six side by side, where width is what limits the view. */
export const CLOTH_L = 11;
export const RACE_L = 16;
/** The front edge of the plinth: the loom's name plate hangs on its face. */
export const PLATE_Z = 1.7;

/** Slot pitch for n threads. */
export const pitch = (n: number, race: boolean): number =>
  race ? Math.min(0.34, RACE_W / n) : Math.min(0.62, SOLO_W / n);

/** Row pitch: the same for every sort on n keys, so cloth lengths compare. */
export const rowPitch = (n: number, race = false): number => (race ? RACE_L : CLOTH_L) / (pairs(n) + 1);

/** How high a thread of value v stands, when the biggest value is top. */
export const heightOf = (v: number, top: number): number =>
  top <= 1 ? (H_LO + H_HI) / 2 : H_LO + ((v - 1) / (top - 1)) * (H_HI - H_LO);

/** The x of slot s (continuous) in a loom of n slots centred on cx. */
export const slotX = (s: number, n: number, px: number, cx: number): number => cx + (s - (n - 1) / 2) * px;

/** Where loom k of six stands. */
export const raceX = (k: number): number => (k - 2.5) * (RACE_W + RACE_GAP);

/** Thread and disc sizes for a slot pitch. */
export const threadR = (px: number): number => Math.min(0.026, Math.max(0.013, px * 0.062));
export const discR = (px: number): number => Math.min(0.2, Math.max(0.07, px * 0.36));

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/* camera: the three ways to look at a loom */
export type View = 'loom' | 'bars' | 'weave';
type Angle = View | 'race';
/**
 * Loom: the sculpture, in perspective. Bars: straight from the front through a long
 * lens, so each thread hides behind its heddle and the loom is a bar chart. Weave:
 * straight down through a long lens, so the cloth is a flat record of the sort.
 */
export const VIEWS: Readonly<Record<Angle, { theta: number; phi: number; fov: number }>> = {
  loom: { theta: -0.3, phi: 0.84, fov: 30 },
  /** Six looms are wide: face them squarely. */
  race: { theta: -0.1, phi: 0.92, fov: 30 },
  bars: { theta: 0, phi: 1.54, fov: 6 },
  weave: { theta: 0, phi: 0.02, fov: 10 },
};
