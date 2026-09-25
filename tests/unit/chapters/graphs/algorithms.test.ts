import { describe, expect, it } from 'vitest';
import {
  Graph,
  MAX_EDGES,
  MAX_NODES,
  RUN,
  checkWeight,
  labelFor,
  ticksOf,
  type AlgoKey,
  type NodeId,
  type Step,
} from '@/chapters/graphs/algorithms';
import { mulberry } from '@/core/random';
import { bellmanFord, hops, pick, randomGraph, routeWeight } from '../../helpers/graphs';

const ALGOS: readonly AlgoKey[] = ['bfs', 'dfs', 'dijkstra'];
const TRIALS = 400;
const last = (steps: Step[]): Step => steps[steps.length - 1];

/** Random graphs of every shape: directed and not, sparse and dense, with zero weights. */
function* cases(seed: number) {
  const rnd = mulberry(seed);
  for (let i = 0; i < TRIALS; i++) {
    const { g, ids } = randomGraph(rnd, { directed: rnd() < 0.4, density: 0.4 + rnd() * 2 });
    yield { g, ids, rnd };
  }
}

describe('Graph editing', () => {
  it('labels knots A to Z, then AA', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(labelFor)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  it('reuses the first free label', () => {
    const g = new Graph();
    const a = g.addNode(0, 0).id as NodeId;
    g.addNode(1, 0);
    g.removeNode(a);
    expect(g.freeLabel()).toBe('A');
  });

  it('rejects loops, duplicates, bad weights and overflow', () => {
    const g = new Graph();
    const a = g.addNode(0, 0).id as NodeId,
      b = g.addNode(1, 0).id as NodeId;
    expect(g.addEdge(a, a).error).toBeTruthy();
    expect(g.addEdge(a, b, 3).id).toBeDefined();
    expect(g.addEdge(b, a).error).toMatch(/already joined/);
    expect(g.addEdge(a, 999).error).toBeTruthy();
    expect(checkWeight('')).toBeTruthy();
    expect(checkWeight(-1)).toBeTruthy();
    expect(checkWeight(100)).toBeTruthy();
    expect(checkWeight(1.5)).toBeTruthy();
    expect(checkWeight(0)).toBeNull();
    expect(checkWeight('99')).toBeNull();

    const full = new Graph();
    for (let i = 0; i < MAX_NODES; i++) full.addNode(i, 0);
    expect(full.addNode(0, 0).error).toBeTruthy();
    const ids = [...full.nodes.keys()];
    for (let i = 0; i < ids.length && full.edges.size < MAX_EDGES; i++)
      for (let j = i + 1; j < ids.length && full.edges.size < MAX_EDGES; j++) full.addEdge(ids[i], ids[j]);
    expect(full.addEdge(ids[0], ids[ids.length - 1]).error).toBeTruthy();
  });

  it('removing a knot removes its strings', () => {
    const g = new Graph();
    const a = g.addNode(0, 0).id as NodeId,
      b = g.addNode(1, 0).id as NodeId,
      c = g.addNode(2, 0).id as NodeId;
    g.addEdge(a, b);
    g.addEdge(b, c);
    g.removeNode(b);
    expect(g.edges.size).toBe(0);
  });

  it('switching to undirected merges opposite strings, keeping the cheaper', () => {
    const g = new Graph();
    g.directed = true;
    const a = g.addNode(0, 0).id as NodeId,
      b = g.addNode(1, 0).id as NodeId;
    g.addEdge(a, b, 7);
    g.addEdge(b, a, 3);
    expect(g.setDirected(false)).toBe(1);
    expect([...g.edges.values()].map(e => e.w)).toEqual([3]);
  });
});

describe('Dijkstra', () => {
  it('settles every reachable knot at its cheapest distance', () => {
    for (const { g, ids, rnd } of cases(1)) {
      const s = pick(rnd, ids);
      const ref = bellmanFord(g, s),
        end = last(RUN.dijkstra(g, s));
      for (const id of ids) expect(end.tag[id]).toBe(Number.isFinite(ref.get(id)) ? ref.get(id) : '∞');
    }
  });

  it('finds a cheapest route to a target, or says it cannot', () => {
    for (const { g, ids, rnd } of cases(2)) {
      const s = pick(rnd, ids),
        t = pick(rnd, ids);
      const want = bellmanFord(g, s).get(t) ?? Infinity,
        end = last(RUN.dijkstra(g, s, t));
      if (Number.isFinite(want)) {
        expect(end.path[0]).toBe(s);
        expect(end.path[end.path.length - 1]).toBe(t);
        expect(routeWeight(g, end.path)).toBe(want);
      } else {
        expect(end.kind).toBe('unreachable');
      }
    }
  });
});

describe('BFS', () => {
  it('places every reachable knot in its layer, and no others', () => {
    for (const { g, ids, rnd } of cases(3)) {
      const s = pick(rnd, ids);
      const ref = hops(g, s),
        end = last(RUN.bfs(g, s));
      for (const id of ids) expect(end.tag[id]).toBe(ref.get(id));
    }
  });

  it('finds a route with the fewest strings', () => {
    for (const { g, ids, rnd } of cases(4)) {
      const s = pick(rnd, ids),
        t = pick(rnd, ids);
      const want = hops(g, s).get(t);
      const found = RUN.bfs(g, s, t).find(st => st.kind === 'found');
      if (want == null) expect(found).toBeUndefined();
      else {
        expect(found?.path.length).toBe(want + 1);
        expect(routeWeight(g, found?.path ?? [])).not.toBeNull();
      }
    }
  });
});

describe('DFS', () => {
  it('visits exactly the reachable knots, each once, along real strings', () => {
    for (const { g, ids, rnd } of cases(5)) {
      const s = pick(rnd, ids);
      const reach = hops(g, s),
        end = last(RUN.dfs(g, s));
      const visited = ids.filter(id => end.tag[id] != null);
      expect(new Set(visited)).toEqual(new Set(reach.keys()));
      expect(new Set(visited.map(id => end.tag[id])).size).toBe(visited.length);
      for (const id of visited) {
        if (id === s) continue;
        const p = end.parent[id];
        expect(g.findEdge(p, id)).not.toBeNull();
        expect(Number(end.tag[p])).toBeLessThan(Number(end.tag[id]));
      }
    }
  });

  it('leaves no cross strings in an undirected graph (every string joins an ancestor and a descendant)', () => {
    for (const { g, ids, rnd } of cases(6)) {
      if (g.directed) continue;
      const s = pick(rnd, ids),
        end = last(RUN.dfs(g, s));
      const ancestors = (id: NodeId) => {
        const out = new Set<NodeId>();
        for (let c: NodeId | undefined = id; c != null; c = c === s ? undefined : end.parent[c]) out.add(c);
        return out;
      };
      for (const e of g.edges.values()) {
        if (end.tag[e.a] == null) continue;
        expect(ancestors(e.a).has(e.b) || ancestors(e.b).has(e.a)).toBe(true);
      }
    }
  });
});

describe('every algorithm', () => {
  it('records a full snapshot at every step, and ticks that cover them all', () => {
    for (const { g, ids, rnd } of cases(7)) {
      const s = pick(rnd, ids),
        t = rnd() < 0.5 ? pick(rnd, ids) : null;
      for (const algo of ALGOS) {
        const steps = RUN[algo](g, s, t);
        expect(steps[0].kind).toBe('start');
        for (const st of steps) expect(Object.keys(st.st).length).toBe(g.size);
        const ticks = ticksOf(steps, algo);
        expect(ticks[ticks.length - 1]).toBe(steps.length - 1);
        for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
      }
    }
  });

  it('handles a single knot, and a start that is its own target', () => {
    const g = new Graph();
    const a = g.addNode(0, 0).id as NodeId;
    for (const algo of ALGOS) {
      expect(RUN[algo](g, a).length).toBeGreaterThan(0);
      expect(RUN[algo](g, a, a).length).toBeGreaterThan(0);
    }
  });
});
