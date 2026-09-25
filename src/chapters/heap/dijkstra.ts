// Graph Net's Textbook graph and its Dijkstra run, as the list of things the run
// asks of its priority queue: push a ticket, pop the cheapest, lower a ticket, or
// leave the queue alone. ops.ts plays that list on the heap. The graph is copied
// from Graph Net's presets; a unit test checks the two stay in step.

export interface Knot {
  label: string;
  x: number;
  z: number;
}

/** The eight knots, where Graph Net draws them. */
export const KNOTS: readonly Knot[] = [
  { label: 'A', x: -5.3, z: 0.2 },
  { label: 'B', x: -1.9, z: -2.0 },
  { label: 'C', x: -3.6, z: 2.2 },
  { label: 'D', x: -0.2, z: 0.4 },
  { label: 'E', x: 0.8, z: 2.8 },
  { label: 'F', x: 2.2, z: -2.0 },
  { label: 'G', x: 3.4, z: 1.5 },
  { label: 'H', x: 5.4, z: -0.1 },
];

/** Strings, with what each costs. The graph is undirected. */
export const STRINGS: readonly (readonly [string, string, number])[] = [
  ['A', 'B', 4],
  ['A', 'C', 2],
  ['C', 'B', 1],
  ['B', 'D', 5],
  ['C', 'D', 8],
  ['C', 'E', 10],
  ['D', 'E', 2],
  ['D', 'F', 6],
  ['E', 'G', 3],
  ['F', 'G', 1],
  ['F', 'H', 4],
  ['G', 'H', 7],
  ['D', 'G', 9],
];

export const START = 'A';
export const TARGET = 'H';

/** Neighbors of a knot in alphabetical order, as Graph Net visits them. */
export function neighbors(x: string): { y: string; w: number }[] {
  const out: { y: string; w: number }[] = [];
  for (const [a, b, w] of STRINGS) {
    if (a === x) out.push({ y: b, w });
    else if (b === x) out.push({ y: a, w });
  }
  return out.sort((p, q) => (p.y < q.y ? -1 : 1));
}

export type QueueEvent =
  /** A knot's first ticket. */
  | { kind: 'push'; knot: string; d: number; from: string | null; w: number }
  /** The cheapest ticket comes off: the knot is settled. */
  | { kind: 'pop'; knot: string; d: number }
  /** A cheaper route: the knot's ticket drops from `old` to `d`. */
  | { kind: 'lower'; knot: string; d: number; old: number; from: string; w: number }
  /** A route that is no better: the queue is left alone. */
  | { kind: 'keep'; knot: string; nd: number; cur: number; from: string; w: number };

/** Where the run stands after an event, for the little map beside the heap. */
export interface NetState {
  dist: Record<string, number>;
  settled: string[];
  queued: string[];
  /** The knot being worked on. */
  cur: string | null;
  /** The string being relaxed. */
  edge: readonly [string, string] | null;
}

/**
 * Dijkstra from A until H is settled, exactly as Graph Net runs it: the cheapest
 * ticket first (ties by label), neighbors in alphabetical order, and a ticket
 * lowered in place when a cheaper route turns up.
 */
export function queueEvents(): { ev: QueueEvent; net: NetState }[] {
  const dist: Record<string, number> = {};
  for (const k of KNOTS) dist[k.label] = Infinity;
  const settled: string[] = [];
  const queued = new Map<string, number>();
  const out: { ev: QueueEvent; net: NetState }[] = [];
  const snap = (cur: string | null, edge: readonly [string, string] | null): NetState => ({
    dist: { ...dist },
    settled: [...settled],
    queued: [...queued.keys()],
    cur,
    edge,
  });
  dist[START] = 0;
  queued.set(START, 0);
  out.push({ ev: { kind: 'push', knot: START, d: 0, from: null, w: 0 }, net: snap(null, null) });
  while (queued.size) {
    const x = [...queued].sort((p, q) => p[1] - q[1] || (p[0] < q[0] ? -1 : 1))[0][0];
    queued.delete(x);
    settled.push(x);
    out.push({ ev: { kind: 'pop', knot: x, d: dist[x] }, net: snap(x, null) });
    if (x === TARGET) break;
    for (const { y, w } of neighbors(x)) {
      if (settled.includes(y)) continue;
      const nd = dist[x] + w;
      if (nd < dist[y]) {
        const old = dist[y];
        dist[y] = nd;
        const had = queued.has(y);
        queued.set(y, nd);
        out.push({
          ev: had ? { kind: 'lower', knot: y, d: nd, old, from: x, w } : { kind: 'push', knot: y, d: nd, from: x, w },
          net: snap(x, [x, y]),
        });
      } else {
        out.push({ ev: { kind: 'keep', knot: y, nd, cur: dist[y], from: x, w }, net: snap(x, [x, y]) });
      }
    }
  }
  return out;
}
