// Reference implementations and random inputs for the graph tests. Written the
// plainest way possible, independently of the code under test.

import { Graph, type NodeId } from '@/chapters/graphs/algorithms';

export interface RandomGraphOptions {
  maxNodes?: number;
  /** Average strings per knot. */
  density?: number;
  maxWeight?: number;
  directed?: boolean;
}

export function randomGraph(
  rnd: () => number,
  { maxNodes = 14, density = 1.2, maxWeight = 12, directed = false }: RandomGraphOptions = {},
): { g: Graph; ids: NodeId[] } {
  const g = new Graph();
  g.directed = directed;
  const n = 1 + Math.floor(rnd() * maxNodes);
  const ids: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    const { id } = g.addNode(rnd() * 10, rnd() * 10);
    if (id != null) ids.push(id);
  }
  const tries = Math.floor(rnd() * n * density * 2);
  for (let k = 0; k < tries; k++) g.addEdge(pick(rnd, ids), pick(rnd, ids), Math.floor(rnd() * (maxWeight + 1)));
  return { g, ids };
}

export const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];

/** Outgoing strings of every knot, respecting direction. */
export function adjacency(g: Graph): Map<NodeId, { to: NodeId; w: number }[]> {
  const adj = new Map<NodeId, { to: NodeId; w: number }[]>([...g.nodes.keys()].map(id => [id, []]));
  for (const e of g.edges.values()) {
    adj.get(e.a)?.push({ to: e.b, w: e.w });
    if (!g.directed) adj.get(e.b)?.push({ to: e.a, w: e.w });
  }
  return adj;
}

/** Fewest strings from s to every reachable knot. */
export function hops(g: Graph, s: NodeId): Map<NodeId, number> {
  const adj = adjacency(g),
    d = new Map([[s, 0]]),
    queue = [s];
  while (queue.length) {
    const x = queue.shift() as NodeId;
    for (const { to } of adj.get(x) ?? []) {
      if (!d.has(to)) {
        d.set(to, (d.get(x) ?? 0) + 1);
        queue.push(to);
      }
    }
  }
  return d;
}

/** Cheapest distance from s to every knot (Infinity if unreachable), by Bellman-Ford. */
export function bellmanFord(g: Graph, s: NodeId): Map<NodeId, number> {
  const d = new Map([...g.nodes.keys()].map(id => [id, id === s ? 0 : Infinity]));
  const adj = adjacency(g);
  for (let round = 1; round < g.size; round++) {
    let changed = false;
    for (const [x, out] of adj) {
      const dx = d.get(x) ?? Infinity;
      for (const { to, w } of out) {
        if (dx + w < (d.get(to) ?? Infinity)) {
          d.set(to, dx + w);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return d;
}

/** The total weight of a route, or null if two consecutive knots are not joined (in that direction). */
export function routeWeight(g: Graph, route: readonly NodeId[]): number | null {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const e = g.findEdge(route[i - 1], route[i]);
    if (!e) return null;
    total += e.w;
  }
  return total;
}
