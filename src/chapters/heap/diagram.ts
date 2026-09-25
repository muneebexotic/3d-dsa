// What every Heap Pyramid step records: a diagram of the heap at that moment (which
// key sits in which slot, which keys have come out, which wires are being checked),
// plus the narration, the line of code being run and the cost so far. Plain data:
// no coordinates, no DOM, no Three.js.

import type { CodeKey } from './code';
import type { NetState } from './dijkstra';
import type { Order } from './heap';

/** How a key's disc is painted. */
export type Tone =
  | 'rest' // ink: a key in the heap
  | 'new' // yellow: a key on its way in
  | 'cur' // cobalt: the key being sifted
  | 'look' // ink with a cobalt ring: the key it is compared with
  | 'top' // cobalt with a halo: the key being taken off the top
  | 'out'; // paper: a key that has come out

/** Seen as a tree standing over its array, or as the array alone with its arcs. */
export type View = 'tree' | 'array';

export type Place =
  /** Slot i of the array, which is also node i of the tree. */
  | { at: 'slot'; i: number }
  /** Place j on the out tray, where keys go when they come off the top. */
  | { at: 'out'; j: number };

export interface DItem {
  id: string;
  key: number;
  /** Dijkstra: the knot the ticket is for. */
  tag?: string;
  place: Place;
  tone: Tone;
}

export interface Diagram {
  order: Order;
  view: View;
  /** Draw the wires from each slot to its children. Off only before the opening. */
  wires: boolean;
  /** Keys in the heap: slots 0 to n − 1 are full. */
  n: number;
  items: DItem[];
  /** Keys on the out tray. */
  outN: number;
  /** Slots glowing as a group: the leaves, at the start of a heapify. */
  lit: number[];
  /** Child slots whose wire up to the parent is being checked. */
  hot: number[];
}

export type StepKind =
  | 'arcs' // the opening: every cell is tied to its two children
  | 'fold' // the array folds into a tree, or unfolds back into a row
  | 'append' // a new key goes in the next free slot
  | 'up' // sift up: compare with the parent
  | 'down' // sift down: compare with the children
  | 'swap' // two keys change places
  | 'stay' // the key has found its place
  | 'take' // the top comes off and goes to the out tray
  | 'last' // the last key moves up to the top
  | 'lower' // a ticket gets a better key in place
  | 'keep' // Dijkstra: a route that changes nothing
  | 'scatter' // a new heap arrives, keys in any order
  | 'leaves' // heapify: half the keys are leaves, already heaps
  | 'push' // a whole push in one step, for batches
  | 'pop' // a whole pop in one step, for batches
  | 'relower' // a whole lower in one step
  | 'full' // no room for another key
  | 'empty' // nothing to take
  | 'done';

/** What the operation has cost so far. */
export interface Cost {
  compares: number;
  swaps: number;
}
export const zeroCost = (): Cost => ({ compares: 0, swaps: 0 });

/** Rows of the cost table an operation lights up. */
export type OpKey = 'peek' | 'push' | 'pop' | 'build' | 'lower';

export interface Step {
  kind: StepKind;
  /** The operation this step belongs to, e.g. "Push 5". */
  op: string;
  cx: OpKey;
  diag: Diagram;
  head: string;
  body: string;
  code: CodeKey;
  line: number;
  cost: Cost;
  /** The disc the step is about: the camera leans toward it. */
  focus?: string | null;
  /** The slot the moving key is in, and the slots it is compared with: arcs join them in the array. */
  from?: number | null;
  look?: number[] | null;
  callout?: { text: string; tone?: 'cobalt' | 'red' | 'ink' } | null;
  /** Batches: the key that moves, and the slots it passes through in order. */
  mover?: string | null;
  path?: number[] | null;
  /** The key that comes off the top in a batched pop. */
  top?: string | null;
  /** A lowered ticket: what it said before. */
  was?: number | null;
  /** Dijkstra: where the run stands. */
  net?: NetState | null;
  /** How many entries of the work ledger exist once this step has played. */
  ledger: number;
}

/** A recorded operation: what the player plays. */
export interface Recording {
  title: string;
  steps: Step[];
  /** The heap before the first step. */
  start: Diagram;
  /** Ledger entries before the first step. */
  ledger: number;
  intro?: { head: string; body: string };
}

/** Deep enough copies that a later step never changes an earlier snapshot. */
export function cloneDiagram(d: Diagram): Diagram {
  return {
    ...d,
    items: d.items.map(i => ({ ...i, place: { ...i.place } })),
    lit: [...d.lit],
    hot: [...d.hot],
  };
}

/** The item in slot i, if any. */
export function inSlot(d: Diagram, i: number): DItem | undefined {
  return d.items.find(it => it.place.at === 'slot' && it.place.i === i);
}
