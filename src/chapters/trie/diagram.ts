// What every Prefix Sunburst step records: for each sunburst on the plinth, the
// words it holds and what is lit on it at that moment (the path followed so far,
// nodes just made or being taken away, the wedge of words under a prefix, the
// branches a spell check kept or cut), plus the narration and the line of code.
// Plain data: no coordinates, no DOM, no Three.js.

import type { CodeKey } from './code';
import type { Dict } from './trie';
import type { Size } from './words';

/** One sunburst per dictionary size. */
export type FanKey = `f${Size}`;
export const fanKey = (s: Size): FanKey => `f${s}`;

export type StepKind =
  | 'zip' // one more ring of letters is shared
  | 'walk' // follow one letter a ring further out
  | 'miss' // the slot for the next letter is empty: the path runs out
  | 'found' // the word ends on a word mark
  | 'prefix' // the path is there, but no word ends on it
  | 'grow' // insert: a new node for the next letter
  | 'mark' // insert: the last node gets its word mark
  | 'unmark' // delete: the word mark comes off
  | 'prune' // delete: a node that leads to no word is taken away
  | 'keep' // delete: pruning stops at a node that is still needed
  | 'spell' // spell check: one ring of the search for near words
  | 'suggest' // spell check: the words one edit away
  | 'none'; // nothing to do

export type OpKey = 'zip' | 'type' | 'search' | 'insert' | 'remove' | 'spell' | 'three';

/** A spell check part-way through: every node visited, with its closest edit distance so far, and the branches cut. */
export interface SpellState {
  word: string;
  /** Rings searched so far. */
  ring: number;
  seen: ReadonlyMap<string, number>;
  cut: readonly string[];
}

export interface FanState {
  key: FanKey;
  dict: Dict;
  /** Rings shared so far while the words zip together; null once they are one trie. */
  zip: number | null;
  /** A word whose nodes stand without its word mark (see shapeOf). */
  draft: string | null;
  /** The letters followed from the root so far: the lit path. */
  path: string;
  /** The node the light is on. */
  at: string | null;
  /** The path ran out: node `at` has no slot for `ch`. */
  miss: { at: string; ch: string } | null;
  /** Nodes this operation made (drawn yellow). */
  fresh: readonly string[];
  /** A node being taken away now (drawn red). */
  doomed: string | null;
  /** The node whose word mark is changing. */
  marked: string | null;
  /** Every word under this node is shaded: the answer to autocomplete. */
  wedge: string | null;
  /** The fan opens around this node, so its words have room. */
  focus: string | null;
  /** Words lit and read out at the rim. */
  lit: readonly string[];
  spell: SpellState | null;
}

/** What the suggestions card lists. */
export interface Listing {
  kind: 'complete' | 'suggest' | 'found' | 'none';
  /** The letters typed, bold in each word. */
  prefix: string;
  words: readonly string[];
  /** Edit distance for each suggestion. */
  d?: readonly number[];
  note: string;
}

export interface Callout {
  fan: FanKey;
  /** Node id the callout hangs over. */
  at: string;
  text: string;
  tone?: 'cobalt' | 'red' | 'ink';
}

export interface Chip {
  text: string;
  tone?: 'cobalt' | 'hot' | 'done';
}

export interface Step {
  kind: StepKind;
  /** The operation this step belongs to, e.g. "Search CART". */
  op: string;
  head: string;
  body: string;
  code: CodeKey;
  line: number;
  fans: FanState[];
  callout: Callout | null;
  chips: Chip[];
  list: Listing | null;
}

export interface Recording {
  title: string;
  op: OpKey;
  /** The word or prefix it was run on. */
  word: string;
  start: FanState[];
  steps: Step[];
  intro: { head: string; body: string; list: Listing | null };
}

/** A sunburst at rest: nothing lit. */
export const calm = (key: FanKey, dict: Dict): FanState => ({
  key,
  dict,
  zip: null,
  draft: null,
  path: '',
  at: null,
  miss: null,
  fresh: [],
  doomed: null,
  marked: null,
  wedge: null,
  focus: null,
  lit: [],
  spell: null,
});
