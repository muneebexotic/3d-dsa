// Sizes and places for Heap Pyramid, in world units. The plinth top is y = 0, x runs
// to the right and z toward the viewer. The tree stands at the back (z = 0) with
// its top row highest; the array lies along the plinth in front of it, and the out
// tray in front of that.

import { rowsFor } from './heap';

export const R = 0.42; // disc radius in the tree
export const CHIP = 0.72; // a disc in the array is this much smaller
export const KNOB = 0.06;
export const PH = 0.5; // plinth height

/* the tree */
export const LEAF = 1.22; // pitch of the bottom row
export const LV = 1.5; // row pitch
export const BASE = 2.35; // centre height of the bottom row
export const TREE_Z = 0;
export const LIFT = 1.4; // the top rises this far when it is taken

/* the array, and the out tray in front of it */
export const CW = 0.92; // cell pitch
export const CELL_W = 0.84;
export const CELL_D = 0.8;
export const CELL_H = 0.16;
export const CHIP_Y = CELL_H + R * CHIP + 0.04; // centre of a disc standing in a cell
export const ARR_Z = 2.5;
export const OUT_Z = 3.95;
/** Arc height per unit of span, when the array is seen on its own. */
export const ARC_K = 0.34;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Rows the tree is drawn with: at least one, so an empty heap still has a top. */
export const treeRows = (n: number): number => Math.max(1, rowsFor(n));
/** Cells in D full rows. */
export const cap = (D: number): number => 2 ** D - 1;
export const treeWidth = (D: number): number => 2 ** (D - 1) * LEAF;

/** Slot i in a tree drawn D rows deep. The row below the last (for the next free slot) sits under it. */
export function treeAt(i: number, D: number): P3 {
  const r = 31 - Math.clz32(i + 1),
    j = i - (2 ** r - 1),
    W = treeWidth(D);
  return { x: ((j + 0.5) * W) / 2 ** r - W / 2, y: BASE + (D - 1 - r) * LV, z: TREE_Z };
}

/** Cells the array has room for: D full rows, and never fewer than three rows' worth. */
export const room = (D: number): number => Math.max(cap(D), 7);

/** The x of cell i: the array is centred on its room. */
export const cellX = (i: number, D: number): number => (i - (room(D) - 1) / 2) * CW;

export const cellAt = (i: number, D: number): P3 => ({ x: cellX(i, D), y: CHIP_Y, z: ARR_Z });

/** Place j on the out tray, lined up under the array's cells. */
export const outAt = (j: number, D: number): P3 => ({ x: cellX(j, D), y: CHIP_Y, z: OUT_Z });

/** How high the arc between two cells rises, seen as the array alone. */
export const arcRise = (span: number): number => 0.3 + ARC_K * Math.abs(span);

/* camera */
export const PHI = 1.12;
