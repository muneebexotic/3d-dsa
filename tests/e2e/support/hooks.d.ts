// The parts of the test hooks (src/core/test-hooks.ts) the end-to-end specs use.
// Only builds made with `npm run build:e2e` expose them.

interface HookPlayer {
  playing: boolean;
  idx: number;
  /** The motion on screen, or null at rest. */
  tr: unknown;
  speed: number;
  prog: { steps: { kind: string }[]; mode?: string };
  atEnd(): boolean;
}

interface Screen {
  x: number;
  y: number;
}

interface GraphHooks {
  player: HookPlayer;
  graph: {
    size: number;
    directed: boolean;
    nodes: Map<number, { id: number; label: string; x: number; z: number }>;
    edges: Map<number, { id: number; a: number; b: number; w: number }>;
  };
  seek(i: number): void;
  togglePlay(): void;
  advance(seconds: number): void;
  settle(): void;
  nodeScreen(j: number, id: number): Screen | null;
  floorScreen(x: number, z: number): Screen | null;
}

interface AvlHooks {
  player: HookPlayer;
  engine: { count: number; has(v: number): boolean };
  seek(i: number): void;
}

interface ListItem {
  id: string;
  label: string;
  place: { at: string; index?: number; slot?: number; level?: number };
}

interface ListPlayer extends Omit<HookPlayer, 'prog'> {
  prog: { steps: { kind: string; head: string }[]; title: string };
}

interface ListHooks {
  player: ListPlayer;
  ui: { structure: string; memory: boolean; selected: string | null };
  world: {
    singly: { values(): number[] };
    doubly: { values(): number[] };
    array: { values(): number[]; cap: number };
    stack: { values(): number[]; out: { val: number }[] };
    queue: { values(): number[]; out: { val: number }[]; front: number; back: number };
  };
  diagram(): { items: ListItem[]; flags: { id: string; to: string | null }[] };
  itemScreen(key: string): Screen | null;
  /** Run one of the page's operations by the id of its button. */
  press(id: string): void;
  seek(i: number): void;
  settle(): void;
  advance(seconds: number): void;
  togglePlay(): void;
}

interface HashTableHook {
  m: number;
  n: number;
  hash: string;
  slots: (number | null)[];
  chains: number[][];
  ledger: { kind: string; work: number }[];
  keys(): number[];
  has(k: number): boolean;
}

interface HashHooks {
  player: ListPlayer;
  ui: { strategy: string; grow: boolean; selected: string | null };
  world: { chain: HashTableHook; probe: HashTableHook };
  diagram(): { items: { id: string; key: number }[] };
  itemScreen(key: string): Screen | null;
  /** Run one of the page's operations by the id of its button. */
  press(id: string): void;
  seek(i: number): void;
  settle(): void;
  advance(seconds: number): void;
  togglePlay(): void;
}

interface HeapItemHook {
  id: string;
  key: number;
  tag?: string;
}

interface HeapHooks {
  player: ListPlayer;
  ui: { selected: string | null };
  world: {
    view: 'tree' | 'array';
    H: {
      order: 'min' | 'max';
      a: HeapItemHook[];
      out: HeapItemHook[];
      ledger: { kind: string; swaps: number; bound: number }[];
      keys(): number[];
      isHeap(): boolean;
    };
  };
  diagram(): { n: number; view: string; items: { id: string; key: number; place: { at: string } }[] };
  itemScreen(key: string): Screen | null;
  /** Run one of the page's operations by the id of its button. */
  press(id: string): void;
  /** Push a given key, or heapify given keys. */
  run(name: 'push' | 'heapify', arg: number | number[]): void;
  seek(i: number): void;
  settle(): void;
  advance(seconds: number): void;
  togglePlay(): void;
}

interface SortStepHook {
  kind: string;
  head: string;
  looms: { rows: number; arr: number[]; done: boolean }[];
}

interface SortingHooks {
  player: {
    playing: boolean;
    idx: number;
    tr: unknown;
    prog: {
      steps: SortStepHook[];
      rec: { mode: 'solo' | 'race'; looms: { key: string; run: { comps: number; writes: number; knots: number } }[] };
    };
    atEnd(): boolean;
  };
  ui: { mode: string; sort: string; kind: string; n: number; seed: number; view: string; selected: number | null };
  threads: { n: number; kind: string; seed: number; list: { id: number; v: number; label: string }[] };
  camera: { fov: number };
  /** Weave one sort, or all six, on the current threads. */
  weave(key: string): void;
  /** Use these values as the threads. */
  useValues(values: number[]): void;
  discScreen(t: number): Screen | null;
  seek(i: number): void;
  settle(): void;
  advance(seconds: number): void;
  togglePlay(): void;
}

interface TrieFanHook {
  key: string;
  at: string | null;
  path: string;
  lit: string[];
  dict: { words: string[] };
}

interface TrieStepHook {
  kind: string;
  head: string;
  fans: TrieFanHook[];
}

interface TrieHooks {
  player: {
    playing: boolean;
    idx: number;
    tr: unknown;
    prog: { steps: TrieStepHook[]; rec: { op: string; word: string; title: string } };
    atEnd(): boolean;
  };
  ui: { size: number; view: string; word: string; op: string; selected: { fan: string; id: string } | null };
  camera: { fov: number; position: { x: number; y: number; z: number } };
  view: { mem: number };
  /** Type into the word box, as a person would. */
  type(text: string): void;
  /** Run one of the operations on a word. */
  run(op: 'search' | 'insert' | 'remove' | 'spell' | 'three', word: string): void;
  setSize(n: number): void;
  setView(v: 'letters' | 'memory'): void;
  currentPose(): { fans: { key: string; wedge: unknown; labels: { text: string }[]; cy: number }[] };
  nodeScreen(fan: string, id: string): Screen | null;
  counts(): { rods: number; discs: number; balls: number; labels: number; boxes: number };
  seek(i: number): void;
  settle(): void;
  advance(seconds: number): void;
  togglePlay(): void;
}

interface Window {
  __trie: TrieHooks;
  __sorting: SortingHooks;
  __graph: GraphHooks;
  __avl: AvlHooks;
  __lists: ListHooks;
  __hashing: HashHooks;
  __heap: HeapHooks;
}
