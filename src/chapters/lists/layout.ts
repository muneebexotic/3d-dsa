// Sizes and places for Pointer Chain, in world units. The plinth top is y = 0,
// x runs to the right and z toward the viewer.

import { MEM_SLOTS, SLOT_BYTES } from './memory';

export const R = 0.42; // disc radius
export const DISC_Y = 1.02; // centre of a list node's disc
export const KNOB = 0.07; // the ball on a disc where pointers are tied
export const PH = 0.5; // plinth height

/* chain: list nodes on pegs, left to right */
export const SX = 2.1; // slot pitch
export const LOOSE_Z = 2.1; // a new node waits in front of the chain

/* memory floor: 8 columns by 4 rows of 8-byte slots, address 0 at the back left */
export const MEM_COLS = 8;
export const MEM_ROWS = MEM_SLOTS / MEM_COLS;
export const MX = 2.35;
export const MZ = 2.25;
/** Where a node at this address sits in memory view. */
export function memPos(addr: number): { x: number; z: number } {
  const k = addr / SLOT_BYTES;
  return { x: ((k % MEM_COLS) - (MEM_COLS - 1) / 2) * MX, z: (Math.floor(k / MEM_COLS) - (MEM_ROWS - 1) / 2) * MZ };
}
export const MEM_W = MEM_COLS * MX;
export const MEM_D = MEM_ROWS * MZ;

/* stack: a column of discs, newest on top */
export const STACK_X = -2.2;
export const STACK_Y0 = 0.62; // centre of the bottom disc
export const LV = 0.96; // level pitch
export const HOVER = 1.15; // a node being pushed hovers this far above its level

/* cells: arrays and ring buffers */
export const CW = 1.18; // cell pitch
export const CELL_D = 1.1; // cell depth
export const CELL_H = 0.26; // tray height
export const CELL_Y = CELL_H + R + 0.04; // centre of a disc standing in a cell
export const ROW_Z = -2.7; // a second block sits behind the first
export const RING_R = 2.55;
export const RING_X = -2.6;

/* the tray of values taken off a stack or queue */
export const TRAY_PITCH = 0.98;
export const TRAY_SLOTS = 7;
export const TRAY_Y = 0.52;
export const TRAY_S = 0.82; // discs in the tray are a little smaller

/* the bridge's little graph */
export const NET_X = -8.4; // beside a stack; a ring needs more room
export const NET_X_RING = -10.9;
export const NET_SCALE = 0.86;
export const KNOT_S = 0.78;
export const KNOT_Y = 0.78;
/** Knot positions around the bridge graph's centre. */
export const NET_LAYOUT: readonly (readonly [number, number])[] = [
  [-2.9, 0.1],
  [-1.2, -1.45],
  [-1.2, 1.55],
  [0.7, -2.15],
  [0.7, -0.35],
  [0.85, 1.75],
  [2.65, 0.65],
];
export const NET_W = 7.6;
export const NET_D = 6.2;

/* camera */
export const PHI_LINE = 1.13;
export const PHI_MEM = 0.8;
export const PHI_STACK = 1.18;
export const PHI_RING = 0.92;
export const PHI_NET = 0.98;
