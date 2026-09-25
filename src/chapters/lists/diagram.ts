// What every Pointer Chain step records: a diagram of the structure at that moment
// (which discs exist, where each sits logically, and what every pointer points at),
// plus the narration, the line of code being run, and the cost so far.
// Plain data: no coordinates, no DOM, no Three.js.

import type { CodeKey } from './code';
import type { OpKey } from './complexity';

export type Structure = 'array' | 'singly' | 'doubly' | 'stack' | 'queue';

/** How a disc is painted. */
export type Tone =
  | 'rest' // ink: an ordinary value
  | 'cur' // cobalt: the node in hand
  | 'hit' // cobalt with a halo: found
  | 'new' // yellow: just allocated, not linked in yet
  | 'gone' // red: being removed
  | 'out'; // paper: taken off a stack or queue

/** Where a disc sits, logically. The pose layer turns this into coordinates. */
export type Place =
  /** A list node: its slot along the chain; loose nodes wait in front of it. */
  | { at: 'chain'; slot: number; loose?: boolean }
  /** A stack node: its level from the bottom; a node being pushed hovers above. */
  | { at: 'stack'; level: number; hover?: boolean }
  /** A value in an array or ring buffer cell. */
  | { at: 'cell'; block: string; index: number }
  /** Taken off a stack or queue, in the order it came out. */
  | { at: 'out'; index: number };

export interface DItem {
  id: string;
  label: string;
  place: Place;
  tone: Tone;
  /** Memory address (list and stack nodes). */
  addr: number | null;
}

export type WireRole = 'next' | 'prev';

/** A pointer stored inside a node. */
export interface DWire {
  id: string;
  from: string;
  role: WireRole;
  /** An item id, or null. */
  to: string | null;
  /** Being written in this step. */
  hot?: boolean;
  /** Already followed in this operation: the walk so far. */
  trail?: boolean;
}

/**
 * A named pointer: a field of the structure (HEAD, TAIL, TOP, FRONT, BACK) or a
 * variable in the running code (CUR, PREV, NEXT, NODE, I, L, R).
 */
export interface DFlag {
  id: string;
  label: string;
  kind: 'field' | 'var';
  /** An item id, a cell ref from cellRef(), or null. */
  to: string | null;
  /** Where to draw it when it points at null. */
  nullAt?: 'left' | 'right' | 'base';
}

/** A contiguous block of cells: an array's storage or a ring buffer. */
export interface DBlock {
  id: string;
  kind: 'array' | 'ring';
  cap: number;
  /** Address of cell 0. */
  base: number;
  /** 0: the block in use; 1: a bigger block being filled behind it. */
  row: 0 | 1;
  /** Number of cells in use (arrays) or queued items (rings), for the label. */
  len: number;
}

export type KnotState = 'unseen' | 'wait' | 'active' | 'done';

/** The small graph beside a stack or queue in the bridge to No. 2. */
export interface DNet {
  knots: { id: string; label: string; st: KnotState }[];
  /** Knot ids joined by a string, and whether it is being looked along now. */
  edges: { a: string; b: string; hot?: boolean }[];
}

export interface Diagram {
  structure: Structure;
  items: DItem[];
  wires: DWire[];
  flags: DFlag[];
  blocks: DBlock[];
  /** The bridge's graph, when a stack or queue is driving a search. */
  net: DNet | null;
  /** What the tray of taken items is called, if shown. */
  tray: string | null;
}

export const cellRef = (block: string, index: number): string => `c:${block}:${index}`;
export const knotRef = (label: string): string => `g:${label}`;

export type StepKind =
  // lists
  | 'start' // put a hand on a node (or on null) to begin
  | 'hop' // follow a pointer: cur = cur.next
  | 'found'
  | 'missing'
  | 'alloc' // a new node appears somewhere in memory
  | 'link' // a pointer inside a node is written
  | 'move' // a named pointer (head, tail, top, front, back) is written
  | 'save' // reverse: remember the rest of the list
  | 'swing' // reverse: cur.next = prev, the wire turns around
  | 'swap' // doubly reverse: next and prev trade places; array reverse: two values trade cells
  | 'advance' // reverse: the hands step forward
  | 'free' // a node nobody points to drops out of memory
  | 'tidy' // the drawing closes gaps; memory does not change
  | 'turn' // the reversed chain turns around so it reads left to right
  | 'empty' // nothing to do on an empty structure
  // arrays
  | 'jump' // a[i]: one sum, one jump
  | 'scan' // compare a[i] and move on
  | 'shift' // a[j] = a[j - 1]
  | 'write' // a[i] = v
  | 'lift' // a value leaves its cell
  | 'grow' // a bigger block appears
  | 'copy' // one value copied into the bigger block
  | 'retire' // the old block is freed
  // stacks and queues
  | 'read' // look at the value on top or at the front
  | 'out' // the value leaves for the tray
  | 'overflow'
  | 'underflow'
  // the bridge to No. 2
  | 'put'
  | 'take'
  | 'skip'
  | 'done';

/** What the operation has cost so far. */
export interface Cost {
  /** Pointers followed. */
  hops: number;
  /** Pointers written (inside nodes, or head/tail/top). */
  writes: number;
  /** Values moved from one cell to another. */
  shifts: number;
  /** Values compared with the one we want. */
  compares: number;
  /** Direct jumps to an address (array indexing). */
  jumps: number;
}

export const zeroCost = (): Cost => ({ hops: 0, writes: 0, shifts: 0, compares: 0, jumps: 0 });

export interface Step {
  kind: StepKind;
  /** The operation this step belongs to, e.g. "Insert 7 at index 2". */
  op: string;
  /** Row of the complexity table this operation lights up. */
  cx: OpKey;
  diag: Diagram;
  head: string;
  body: string;
  /** The code listing, and the line of it this step runs (-1: none). */
  code: CodeKey;
  line: number;
  cost: Cost;
  /** The disc, cell or knot the step is about: the camera leans toward it and the callout follows it. */
  focus?: string | null;
  /** A short label beside the focus. */
  callout?: { text: string; tone?: 'cobalt' | 'red' | 'ink' } | null;
  /** The pointer being written or followed. */
  wire?: string | null;
  /** A pointer followed from one node to the next. */
  hop?: { from: string; to: string } | null;
  /** An array index computed and jumped to. */
  jump?: { from: string; to: string } | null;
  /** A disc that flies in from a knot of the bridge's graph. */
  fly?: { from: string; item: string } | null;
}

/** A recorded operation: what the player plays. */
export interface Recording {
  title: string;
  steps: Step[];
  /** The structure before the first step. */
  start: Diagram;
  intro?: { head: string; body: string };
}

/** Shallow copies, so a later step never changes an earlier snapshot. */
export function cloneDiagram(d: Diagram): Diagram {
  return {
    structure: d.structure,
    items: d.items.map(i => ({ ...i, place: { ...i.place } })),
    wires: d.wires.map(w => ({ ...w })),
    flags: d.flags.map(f => ({ ...f })),
    blocks: d.blocks.map(b => ({ ...b })),
    net: d.net ? { knots: d.net.knots.map(k => ({ ...k })), edges: d.net.edges.map(e => ({ ...e })) } : null,
    tray: d.tray,
  };
}
