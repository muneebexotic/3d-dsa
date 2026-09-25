// The ready-made graphs in the Graph menu. Random presets take a seed so a
// shuffle is repeatable.

import { mulberry } from '../../core/random';
import { Graph, type AlgoKey } from './algorithms';

export interface Preset {
  name: string;
  /** The algorithm this graph is meant to show off, or a race. */
  algo: AlgoKey | 'race';
  race?: readonly [AlgoKey, AlgoKey];
  random?: boolean;
  start: string;
  target?: string;
  make(seed?: number): Graph;
}

type NodeSpec = readonly [label: string, x: number, z: number];
type EdgeSpec = readonly [a: string, b: string, w: number];

function build(nodes: readonly NodeSpec[], edges: readonly EdgeSpec[], { directed = false } = {}): Graph {
  const g = new Graph();
  g.directed = directed;
  const ids: Record<string, number> = {};
  for (const [label, x, z] of nodes) {
    const res = g.addNode(x, z, label);
    if (res.id != null) ids[label] = res.id;
  }
  for (const [a, b, w] of edges) g.addEdge(ids[a], ids[b], w);
  return g;
}
function scatter(rnd: () => number, n: number, W: number, H: number, minGap: number): [number, number][] {
  const pts: [number, number][] = [];
  let guard = 0;
  while (pts.length < n && guard++ < 20000) {
    const p: [number, number] = [(rnd() - 0.5) * W, (rnd() - 0.5) * H];
    if (pts.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) >= minGap)) pts.push(p);
  }
  return pts;
}
function nodeIds(g: Graph, pts: [number, number][]): number[] {
  const ids: number[] = [];
  for (const p of pts) {
    const res = g.addNode(p[0], p[1]);
    if (res.id != null) ids.push(res.id);
  }
  return ids;
}
const distance = (g: Graph, a: number, b: number) => {
  const A = g.nodes.get(a),
    B = g.nodes.get(b);
  return A && B ? Math.hypot(A.x - B.x, A.z - B.z) : Infinity;
};
function connectNearest(g: Graph, ids: number[], rnd: () => number, k: number, wMax: number): void {
  for (const a of ids) {
    const near = ids.filter(b => b !== a).sort((p, q) => distance(g, a, p) - distance(g, a, q));
    for (const b of near.slice(0, k)) if (!g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * wMax));
  }
}
/** Join everything with a nearest-neighbor tree so the net is connected. */
function spanning(g: Graph, ids: number[], rnd: () => number, wMax: number): void {
  const inTree = [ids[0]],
    rest = ids.slice(1);
  while (rest.length) {
    let best: { a: number; b: number; d: number } | null = null;
    for (const a of inTree)
      for (const b of rest) {
        const d = distance(g, a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
    if (!best) break;
    g.addEdge(best.a, best.b, 1 + Math.floor(rnd() * wMax));
    inTree.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
}
function lattice(rnd: () => number, C: number, Rw: number, gap: number, jitter: number): { g: Graph; ids: number[] } {
  const g = new Graph(),
    ids: number[] = [];
  const shake = () => (jitter ? (rnd() - 0.5) * jitter : 0); // no draw when there is no jitter, so seeds stay stable
  for (let r = 0; r < Rw; r++)
    for (let c = 0; c < C; c++) {
      const x = (c - (C - 1) / 2) * gap + shake();
      const z = (r - (Rw - 1) / 2) * gap + shake();
      const res = g.addNode(x, z);
      if (res.id != null) ids.push(res.id);
    }
  for (let r = 0; r < Rw; r++)
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (c < C - 1) g.addEdge(ids[i], ids[i + 1], 1 + Math.floor(rnd() * 9));
      if (r < Rw - 1) g.addEdge(ids[i], ids[i + C], 1 + Math.floor(rnd() * 9));
    }
  return { g, ids };
}

export type PresetKey = 'textbook' | 'contrast' | 'grid' | 'sparse' | 'dense' | 'islands' | 'large';

export const PRESETS: Readonly<Record<PresetKey, Preset>> = {
  textbook: {
    name: 'Textbook',
    algo: 'dijkstra',
    start: 'A',
    target: 'H',
    make: () =>
      build(
        [
          ['A', -5.3, 0.2],
          ['B', -1.9, -2.0],
          ['C', -3.6, 2.2],
          ['D', -0.2, 0.4],
          ['E', 0.8, 2.8],
          ['F', 2.2, -2.0],
          ['G', 3.4, 1.5],
          ['H', 5.4, -0.1],
        ],
        [
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
        ],
      ),
  },
  contrast: {
    name: 'Wide vs deep',
    algo: 'race',
    race: ['bfs', 'dfs'],
    start: 'A',
    target: 'K',
    make: () =>
      build(
        [
          ['A', -0.6, 0.2],
          ['B', 1.3, -2.2],
          ['C', 3.2, -3.1],
          ['D', 5.0, -2.1],
          ['E', 5.8, 0.0],
          ['F', 5.0, 2.0],
          ['G', 3.2, 2.9],
          ['H', -2.4, 2.1],
          ['I', -2.9, 0.1],
          ['J', -2.4, -1.9],
          ['K', -4.4, 3.1],
          ['L', -5.1, 1.1],
          ['M', -5.0, -0.9],
          ['N', -4.4, -2.9],
        ],
        [
          ['A', 'B', 1],
          ['B', 'C', 1],
          ['C', 'D', 1],
          ['D', 'E', 1],
          ['E', 'F', 1],
          ['F', 'G', 1],
          ['A', 'H', 1],
          ['A', 'I', 1],
          ['A', 'J', 1],
          ['H', 'K', 1],
          ['I', 'L', 1],
          ['I', 'M', 1],
          ['J', 'N', 1],
        ],
      ),
  },
  grid: {
    name: 'Grid',
    algo: 'bfs',
    start: 'A',
    target: 'X',
    make: (seed = 3) => lattice(mulberry(seed), 6, 4, 2.1, 0).g,
  },
  sparse: {
    name: 'Random sparse',
    algo: 'dijkstra',
    random: true,
    start: 'A',
    make(seed = 11) {
      const rnd = mulberry(seed),
        g = new Graph();
      const ids = nodeIds(g, scatter(rnd, 16, 13, 8, 1.7));
      spanning(g, ids, rnd, 12);
      for (let k = 0; k < 5; k++) {
        const a = ids[Math.floor(rnd() * ids.length)],
          b = ids[Math.floor(rnd() * ids.length)];
        if (a !== b && !g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * 12));
      }
      return g;
    },
  },
  dense: {
    name: 'Random dense',
    algo: 'dijkstra',
    random: true,
    start: 'A',
    make(seed = 5) {
      const rnd = mulberry(seed),
        g = new Graph();
      const ids = nodeIds(g, scatter(rnd, 22, 14, 9, 1.6));
      spanning(g, ids, rnd, 20);
      connectNearest(g, ids, rnd, 4, 20);
      return g;
    },
  },
  islands: {
    name: 'Islands',
    algo: 'dijkstra',
    start: 'A',
    target: 'K',
    make: () =>
      build(
        [
          ['A', -5.2, -0.6],
          ['B', -3.6, 1.6],
          ['C', -3.3, -1.9],
          ['D', -1.7, 0.2],
          ['E', -1.2, 2.4],
          ['F', -0.9, -2.3],
          ['G', 2.2, 1.6],
          ['H', 3.8, 2.4],
          ['I', 4.2, 0.2],
          ['J', 2.6, -1.3],
          ['K', 5.6, -1.6],
          ['L', 0.6, -0.4],
        ],
        [
          ['A', 'B', 3],
          ['A', 'C', 2],
          ['B', 'D', 4],
          ['C', 'D', 1],
          ['B', 'E', 2],
          ['D', 'E', 5],
          ['C', 'F', 6],
          ['D', 'F', 3],
          ['G', 'H', 2],
          ['G', 'J', 4],
          ['H', 'I', 3],
          ['I', 'J', 1],
          ['I', 'K', 2],
          ['J', 'K', 5],
        ],
      ),
  },
  large: {
    name: 'Large (60 knots)',
    algo: 'bfs',
    random: true,
    start: 'A',
    target: 'BH',
    make(seed = 21) {
      const rnd = mulberry(seed),
        C = 10,
        Rw = 6;
      const { g, ids } = lattice(rnd, C, Rw, 1.75, 0.6);
      let guard = 0;
      while (g.edges.size < 150 && guard++ < 1000) {
        const r = Math.floor(rnd() * (Rw - 1)),
          c = Math.floor(rnd() * (C - 1)),
          i = r * C + c;
        const [a, b] = rnd() < 0.5 ? [ids[i], ids[i + C + 1]] : [ids[i + 1], ids[i + C]];
        if (!g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * 9));
      }
      return g;
    },
  },
};
