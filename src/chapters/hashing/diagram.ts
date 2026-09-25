// What every Hash Clock step records: a diagram of the table at that moment (the
// rings of buckets, where each key sits, the chain pointers, the tombstones, where
// the hand points), plus the narration, the line of code being run and the cost so
// far. Plain data: no coordinates, no DOM, no Three.js.

import type { CodeKey } from './code';
import type { HashFn } from './hash';
import type { Strategy } from './table';

/** How a key's disc is painted. */
export type Tone =
  | 'rest' // ink: a key in the table
  | 'new' // yellow: a key on its way in
  | 'cur' // cobalt: the key being compared
  | 'hit' // cobalt with a halo: found
  | 'gone' // red: being removed
  | 'query'; // paper: the key being looked for

/** A clock face of m buckets. `old` rings are being emptied into the live one. */
export interface DRing {
  id: string;
  m: number;
  role: 'live' | 'old';
}

export type Place =
  /** On top of the hub, being hashed. */
  | { at: 'hub' }
  /**
   * In a bucket. Chaining stacks keys into a tower, level 0 at the bottom; probing
   * keeps one key per bucket at level 0. `hover` floats a key above its spot while it
   * looks; `lifted` holds the old arrangement up in the air during a rehash.
   */
  | { at: 'bucket'; ring: string; index: number; level: number; hover?: boolean; lifted?: boolean };

export interface DItem {
  id: string;
  key: number;
  place: Place;
  tone: Tone;
}

/** A probing slot whose key was deleted: searches must keep walking past it. */
export interface DTomb {
  id: string;
  ring: string;
  index: number;
}

/** A chain pointer: from a bucket (bucketRef) or a key's disc, to a key's disc. Null pointers are not drawn. */
export interface DLink {
  id: string;
  from: string;
  to: string;
  /** Being written in this step. */
  hot?: boolean;
  /** Already followed in this operation. */
  trail?: boolean;
  /** Belongs to the lifted, old arrangement. */
  lifted?: boolean;
}

export interface Diagram {
  strategy: Strategy;
  hash: HashFn;
  rings: DRing[];
  items: DItem[];
  tombs: DTomb[];
  links: DLink[];
  /** The hour the hand points at, on the live ring. */
  hand: number;
  /** A spoke lit from the hub to this bucket. */
  lit: string | null;
  /** Keys in the table, and buckets in the live ring, for the load gauge. */
  n: number;
  m: number;
}

export const bucketRef = (ring: string, index: number): string => `b:${ring}:${index}`;
export const ringId = (m: number): string => `r${m}`;
export const keyId = (k: number): string => `k${k}`;
/** The disc for a key that is looked for, or that turns out to be in the table already. */
export const QUERY = 'q';

/** Parse a bucket reference back into its ring and index. */
export function parseBucket(ref: string): { ring: string; index: number } | null {
  const m = /^b:([^:]+):(\d+)$/.exec(ref);
  return m ? { ring: m[1], index: Number(m[2]) } : null;
}

export type StepKind =
  | 'hash' // the key lands on the hub and the hand winds round to its bucket
  | 'jump' // the key flies out along the spoke: one jump, whatever the bucket
  | 'compare' // chaining: follow a pointer and compare the key there
  | 'hop' // probing: the slot is taken, so try the next one
  | 'link' // chaining: the new key is linked on at the end of the chain
  | 'place' // probing: the new key drops into a free slot
  | 'found'
  | 'missing'
  | 'unlink' // chaining delete: the pointer before the key skips over it
  | 'free' // the unlinked key drops out
  | 'tomb' // probing delete: the key leaves a tombstone behind
  | 'full' // the load factor passes three quarters
  | 'grow' // a clock twice the size appears
  | 'lift' // a new hash function: every key lifts out of the table
  | 'rehash' // one key goes back through the hub into the new table
  | 'fountain' // the rest of the keys, all at once
  | 'retire' // the old table is freed
  | 'put' // a whole insert in one step, for batches
  | 'refuse' // no room
  | 'done';

/** What the operation has cost so far. */
export interface Cost {
  /** Keys hashed. */
  hashes: number;
  /** Keys compared with the one we want (chaining). */
  compares: number;
  /** Slots looked at (probing). */
  probes: number;
  /** Keys moved by a rehash. */
  moves: number;
}

export const zeroCost = (): Cost => ({ hashes: 0, compares: 0, probes: 0, moves: 0 });

/** Rows of the cost table an operation lights up. */
export type OpKey = 'search' | 'insert' | 'delete' | 'resize';

export interface Step {
  kind: StepKind;
  /** The operation this step belongs to, e.g. "Insert 57". */
  op: string;
  cx: OpKey;
  diag: Diagram;
  head: string;
  body: string;
  code: CodeKey;
  line: number;
  cost: Cost;
  /** The disc or bucket the step is about: the camera leans toward it and the callout follows it. */
  focus?: string | null;
  callout?: { text: string; tone?: 'cobalt' | 'red' | 'ink' } | null;
  /** The hand winds this many hours during the step (from hour 0). */
  wind?: number | null;
  /** Chaining: the pointer followed in a compare. */
  link?: string | null;
  /** Probing: the slots a key passes over on its way to its own, in a batch insert. */
  path?: number[] | null;
  /** Keys moving together in a fountain, in the order they leave. */
  wave?: string[] | null;
  /** How many entries of the work ledger exist once this step has played. */
  ledger: number;
}

/** A recorded operation: what the player plays. */
export interface Recording {
  title: string;
  steps: Step[];
  /** The table before the first step. */
  start: Diagram;
  /** Ledger entries before the first step. */
  ledger: number;
  intro?: { head: string; body: string };
}

/** Deep enough copies that a later step never changes an earlier snapshot. */
export function cloneDiagram(d: Diagram): Diagram {
  return {
    ...d,
    rings: d.rings.map(r => ({ ...r })),
    items: d.items.map(i => ({ ...i, place: { ...i.place } })),
    tombs: d.tombs.map(t => ({ ...t })),
    links: d.links.map(l => ({ ...l })),
  };
}
