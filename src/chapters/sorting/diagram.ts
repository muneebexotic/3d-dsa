// What the player plays: a recording of steps, each saying where every loom stands
// afterwards (how many rows it has woven, the order of the threads at the front,
// what the sort knows) and what to say about it. One loom for a single sort, six
// side by side when they all weave the same threads.

import type { Ev, Marks, Run, SortKey } from './sorts';
import type { Threads } from './threads';

export type Mode = 'solo' | 'race';

/**
 * pick: a comparison, one new row of cloth; move: keys change places with no
 * comparison; done: the sort is finished; weave: all six looms weave on together;
 * stand: the finished cloths stand up side by side.
 */
export type StepKind = 'pick' | 'move' | 'done' | 'weave' | 'stand';

/** One loom after a step. */
export interface LoomState {
  /** Comparisons woven: rows of cloth. */
  rows: number;
  /** The threads at the front of the loom, slot by slot. */
  arr: number[];
  /** What the sort knows (a single sort only). */
  marks: Marks | null;
  /** Threads lit at the front: the two just compared. */
  glow: readonly number[];
  done: boolean;
}

export interface Step {
  kind: StepKind;
  /** The operation, for the placard's eyebrow. */
  op: string;
  head: string;
  body: string;
  /** The listing shown, and its lit line (-1 for none). */
  code: SortKey | null;
  line: number;
  /** The comparison just made, shown by the pair: '7 > 3'. */
  callout: string | null;
  looms: LoomState[];
  /** 1 once the cloths stand up. */
  stand: number;
  /** A single sort's event. */
  ev: Ev | null;
}

export interface LoomSpec {
  key: SortKey;
  run: Run;
}

export interface Recording {
  title: string;
  mode: Mode;
  threads: Threads;
  looms: LoomSpec[];
  start: LoomState[];
  steps: Step[];
  intro: { head: string; body: string };
}

/** A name for a set of threads, so looms weaving the same ones can be matched up. */
export const threadsSig = (th: Threads): string => `${th.kind}:${th.n}:${th.seed}:${th.list.map(t => t.v).join('.')}`;
