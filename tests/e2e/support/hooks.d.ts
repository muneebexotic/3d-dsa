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

interface Window {
  __graph: GraphHooks;
  __avl: AvlHooks;
  __lists: ListHooks;
}
