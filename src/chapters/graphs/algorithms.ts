// Graph Net: the graph model and BFS, DFS and Dijkstra. Everything here is plain
// data and runs instantly. Each algorithm records a list of steps; the page
// animates them. No DOM and no Three.js, so it is tested on its own.

import { plural } from '../../core/math';

export const MAX_NODES = 60;
export const MAX_EDGES = 200;
export const MAX_W = 99;

export type NodeId = number;
export type EdgeId = number;
export type AlgoKey = 'bfs' | 'dfs' | 'dijkstra';
export type DsKind = 'queue' | 'stack' | 'pq';

export const ALGOS: Readonly<Record<AlgoKey, { name: string; long: string; ds: DsKind }>> = {
  bfs: { name: 'BFS', long: 'Breadth-first search', ds: 'queue' },
  dfs: { name: 'DFS', long: 'Depth-first search', ds: 'stack' },
  dijkstra: { name: 'Dijkstra', long: 'Dijkstra’s shortest paths', ds: 'pq' },
};

export interface GraphNode {
  id: NodeId;
  label: string;
  x: number;
  z: number;
}
export interface GraphEdge {
  id: EdgeId;
  a: NodeId;
  b: NodeId;
  w: number;
}
export interface Neighbor {
  to: NodeId;
  w: number;
  edge: EdgeId;
}
/** An edit either succeeds with the new id or explains what went wrong. */
export type EditResult = { id: number; error?: undefined } | { error: string; id?: undefined };

/** 0 → A … 25 → Z, 26 → AA */
export function labelFor(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}
const labelIndex = (s: string): number => [...s].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

export class Graph {
  nodes = new Map<NodeId, GraphNode>();
  edges = new Map<EdgeId, GraphEdge>();
  directed = false;
  nextId = 1;

  get size(): number {
    return this.nodes.size;
  }
  clone(): Graph {
    const g = new Graph();
    g.directed = this.directed;
    g.nextId = this.nextId;
    for (const [k, n] of this.nodes) g.nodes.set(k, { ...n });
    for (const [k, e] of this.edges) g.edges.set(k, { ...e });
    return g;
  }
  freeLabel(): string {
    const used = new Set([...this.nodes.values()].map(n => n.label));
    for (let i = 0; ; i++) if (!used.has(labelFor(i))) return labelFor(i);
  }
  addNode(x: number, z: number, label = this.freeLabel()): EditResult {
    if (this.nodes.size >= MAX_NODES) return { error: `The plinth holds ${MAX_NODES} knots. Delete some first.` };
    const id = this.nextId++;
    this.nodes.set(id, { id, label, x, z });
    return { id };
  }
  removeNode(id: NodeId): void {
    this.nodes.delete(id);
    for (const [k, e] of this.edges) if (e.a === id || e.b === id) this.edges.delete(k);
  }
  findEdge(a: NodeId, b: NodeId): GraphEdge | null {
    for (const e of this.edges.values()) {
      if (e.a === a && e.b === b) return e;
      if (!this.directed && e.a === b && e.b === a) return e;
    }
    return null;
  }
  addEdge(a: NodeId, b: NodeId, w: number | string = 1): EditResult {
    if (a === b) return { error: 'A string needs two different knots.' };
    if (!this.nodes.has(a) || !this.nodes.has(b)) return { error: 'Both ends must be knots on the plinth.' };
    if (this.findEdge(a, b))
      return {
        error: `${this.label(a)} and ${this.label(b)} are already joined${this.directed ? ' in that direction' : ''}.`,
      };
    if (this.edges.size >= MAX_EDGES) return { error: `The net holds ${MAX_EDGES} strings. Delete some first.` };
    const bad = checkWeight(w);
    if (bad) return { error: bad };
    const id = this.nextId++;
    this.edges.set(id, { id, a, b, w: Number(w) });
    return { id };
  }
  removeEdge(id: EdgeId): void {
    this.edges.delete(id);
  }
  setWeight(id: EdgeId, w: number | string): { error?: string } {
    const bad = checkWeight(w);
    if (bad) return { error: bad };
    const e = this.edges.get(id);
    if (e) e.w = Number(w);
    return {};
  }
  /** Switching to undirected merges strings that now join the same pair, keeping the cheaper one. Returns how many merged. */
  setDirected(flag: boolean): number {
    this.directed = flag;
    let merged = 0;
    if (!flag) {
      const seen = new Map<string, GraphEdge>();
      for (const [k, e] of [...this.edges]) {
        const key = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
        const prev = seen.get(key);
        if (prev) {
          prev.w = Math.min(prev.w, e.w);
          this.edges.delete(k);
          merged++;
        } else seen.set(key, e);
      }
    }
    return merged;
  }
  label(id: NodeId): string {
    return this.nodes.get(id)?.label ?? '?';
  }
  /** Neighbors in alphabetical order, so every run is repeatable. */
  neighbors(id: NodeId): Neighbor[] {
    const out: Neighbor[] = [];
    for (const e of this.edges.values()) {
      if (e.a === id) out.push({ to: e.b, w: e.w, edge: e.id });
      else if (!this.directed && e.b === id) out.push({ to: e.a, w: e.w, edge: e.id });
    }
    return out.sort((p, q) => labelIndex(this.label(p.to)) - labelIndex(this.label(q.to)));
  }
  /** Strings pointing into a knot (directed graphs only). */
  incoming(id: NodeId): { from: NodeId; w: number; edge: EdgeId }[] {
    const out: { from: NodeId; w: number; edge: EdgeId }[] = [];
    for (const e of this.edges.values()) if (e.b === id && this.directed) out.push({ from: e.a, w: e.w, edge: e.id });
    return out;
  }
  byLabel(label: string): NodeId | null {
    for (const n of this.nodes.values()) if (n.label === label) return n.id;
    return null;
  }
  sortedIds(): NodeId[] {
    return [...this.nodes.keys()].sort((a, b) => labelIndex(this.label(a)) - labelIndex(this.label(b)));
  }
  toJSON(): { directed: boolean; nodes: GraphNode[]; edges: GraphEdge[] } {
    return { directed: this.directed, nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
  }
}

/** Why a weight is not acceptable, or null if it is fine. */
export function checkWeight(w: number | string): string | null {
  const s = String(w).trim();
  if (s === '') return 'Type a weight from 0 to 99.';
  if (!/^\d+$/.test(s))
    return /^-/.test(s)
      ? 'Weights cannot be negative: Dijkstra needs every string to cost 0 or more.'
      : `“${s.slice(0, 8)}” is not a whole number. Try something like 7.`;
  if (Number(s) > MAX_W) return `Use a weight from 0 to ${MAX_W}.`;
  return null;
}

/* ---------------- step recording ---------------- */

export type VisitState = 'unseen' | 'wait' | 'active' | 'done';
export type StepKind =
  | 'start'
  | 'dequeue'
  | 'discover'
  | 'skip'
  | 'found'
  | 'done'
  | 'lift'
  | 'dive'
  | 'back'
  | 'extract'
  | 'improve'
  | 'keep'
  | 'path'
  | 'unreachable';

/** An entry in the queue, stack or priority queue. */
export interface DsItem {
  id: NodeId;
  /** BFS layer, or Dijkstra ticket. */
  key?: number;
}

/** A snapshot of the whole algorithm after one step. */
export interface Step {
  kind: StepKind;
  algo: AlgoKey;
  st: Record<NodeId, VisitState>;
  /** Distance (Dijkstra, '∞' until reached), layer (BFS) or visit number (DFS). */
  tag: Record<NodeId, number | '∞'>;
  parent: Record<NodeId, NodeId>;
  ds: DsItem[];
  /** How far the start has been lifted, in distance units. */
  tau: number;
  /** Settled knots and their distances. */
  lifted: Record<NodeId, number>;
  path: NodeId[];
  order: NodeId[];
  visited: number;
  head: string;
  body: string;
  focus?: NodeId | null;
  edge?: EdgeId | null;
  from?: NodeId;
  to?: NodeId | null;
  pathEdges?: EdgeId[];
  old?: number;
  nd?: number;
  cur?: number;
  liftKind?: 'layers';
}
type StepDetail = Omit<
  Step,
  'kind' | 'algo' | 'st' | 'tag' | 'parent' | 'ds' | 'tau' | 'lifted' | 'path' | 'order' | 'visited'
>;

interface RecorderState {
  st: Record<NodeId, VisitState>;
  tag: Record<NodeId, number | '∞'>;
  parent: Record<NodeId, NodeId>;
  order: NodeId[];
  ds: DsItem[];
  tau: number;
  lifted: Record<NodeId, number>;
  path: NodeId[];
  visited: number;
}

function recorder(g: Graph, algo: AlgoKey) {
  const L = (id: NodeId) => g.label(id);
  const steps: Step[] = [];
  const S: RecorderState = { st: {}, tag: {}, parent: {}, order: [], ds: [], tau: 0, lifted: {}, path: [], visited: 0 };
  for (const id of g.nodes.keys()) S.st[id] = 'unseen';
  const push = (kind: StepKind, o: StepDetail) =>
    steps.push({
      kind,
      algo,
      st: { ...S.st },
      tag: { ...S.tag },
      parent: { ...S.parent },
      ds: S.ds.map(d => ({ ...d })),
      tau: S.tau,
      lifted: { ...S.lifted },
      path: S.path.slice(),
      order: S.order.slice(),
      visited: S.visited,
      ...o,
    });
  return { L, steps, S, push };
}
function pathTo(S: RecorderState, t: NodeId): NodeId[] {
  const p: NodeId[] = [];
  let c: NodeId | undefined = t;
  while (c != null) {
    p.unshift(c);
    c = S.parent[c];
  }
  return p;
}
function pathEdges(g: Graph, nodes: NodeId[]): EdgeId[] {
  const out: EdgeId[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const e = g.findEdge(nodes[i - 1], nodes[i]);
    if (e) out.push(e.id);
  }
  return out;
}

export function runBFS(g: Graph, start: NodeId, target: NodeId | null = null): Step[] {
  const { L, steps, S, push } = recorder(g, 'bfs');
  const total = g.size;
  S.st[start] = 'wait';
  S.tag[start] = 0;
  S.ds = [{ id: start, key: 0 }];
  push('start', {
    focus: start,
    head: `BFS from ${L(start)}.`,
    body: `Put ${L(start)} in the queue. It is 0 strings from itself. BFS takes nodes out in the order they went in, so it visits everything 1 string away before anything 2 away.`,
  });
  const layer = (id: NodeId) => S.tag[id] as number;
  let active: NodeId | null = null;
  let found = start === target;
  if (found) S.st[start] = 'done';
  while (S.ds.length && !found) {
    const x = (S.ds.shift() as DsItem).id;
    if (active != null) S.st[active] = 'done';
    S.st[x] = 'active';
    active = x;
    S.order.push(x);
    S.visited++;
    const nb = g.neighbors(x);
    push('dequeue', {
      focus: x,
      head: `Take ${L(x)} from the front of the queue.`,
      body: nb.length
        ? `It is ${plural(layer(x), 'string')} from ${L(start)}. Now look at each of its ${plural(nb.length, 'neighbor')}.`
        : `${L(x)} has no strings leading on. Nothing to add.`,
    });
    for (const { to: y, edge } of nb) {
      if (S.st[y] === 'unseen') {
        S.st[y] = 'wait';
        S.tag[y] = layer(x) + 1;
        S.parent[y] = x;
        S.ds.push({ id: y, key: layer(y) });
        push('discover', {
          focus: x,
          edge,
          from: x,
          to: y,
          head: `${L(y)} is new.`,
          body: `Mark it seen and add it to the back of the queue. It is ${plural(layer(y), 'string')} from ${L(start)}, one more than ${L(x)}.`,
        });
        if (y === target) {
          found = true;
          break;
        }
      } else {
        push('skip', {
          focus: x,
          edge,
          from: x,
          to: y,
          head: `${L(y)} is already seen.`,
          body:
            S.st[y] === 'done' || S.st[y] === 'active'
              ? `${L(y)} has already been visited. Skip it.`
              : `${L(y)} is already waiting in the queue. Skip it.`,
        });
      }
    }
  }
  if (active != null && !found) S.st[active] = 'done';
  const reached = Object.keys(S.tag).length;
  const maxLayer = Math.max(0, ...Object.values(S.tag).map(Number));
  if (found && target != null) {
    S.path = pathTo(S, target);
    push('found', {
      focus: target,
      head: `Found ${L(target)}, ${plural(layer(target), 'string')} from ${L(start)}.`,
      body: `BFS reaches every node by the fewest strings, because it finishes each layer before starting the next. Route: ${S.path.map(L).join(' → ')}.`,
      pathEdges: pathEdges(g, S.path),
    });
  } else {
    const missed = total - reached;
    push('done', {
      head: target != null ? `${L(target)} cannot be reached from ${L(start)}.` : 'The queue is empty.',
      body: `BFS visited ${plural(reached, 'node')} in ${plural(maxLayer + 1, 'layer')}.${missed ? ` ${plural(missed, 'node')} ${missed === 1 ? 'is' : 'are'} not connected to ${L(start)}, so ${missed === 1 ? 'it stays' : 'they stay'} on the plinth.` : ''}`,
    });
  }
  // payoff: every string the same length, so lifting the start hangs the net in its layers
  for (const [id, v] of Object.entries(S.tag)) S.lifted[Number(id)] = Number(v);
  S.tau = found && target != null ? layer(target) : maxLayer;
  push('lift', {
    focus: start,
    liftKind: 'layers',
    pathEdges: found ? pathEdges(g, S.path) : [],
    head: `Lift ${L(start)} by its string.`,
    body: `With every string counted as one step, the net hangs in layers: each knot sits exactly as many strings below ${L(start)} as BFS said.${found && target != null ? ` The route to ${L(target)} pulls taut.` : ''}`,
  });
  return steps;
}

export function runDFS(g: Graph, start: NodeId, target: NodeId | null = null): Step[] {
  const { L, steps, S, push } = recorder(g, 'dfs');
  const total = g.size;
  let order = 0;
  const stack: { id: NodeId; i: number; nb: Neighbor[] }[] = [{ id: start, i: 0, nb: g.neighbors(start) }];
  S.st[start] = 'active';
  S.tag[start] = ++order;
  S.ds = [{ id: start }];
  S.visited = 1;
  S.order.push(start);
  push('start', {
    focus: start,
    head: `DFS from ${L(start)}.`,
    body: `Push ${L(start)} on the stack and mark it visited. DFS always follows the newest string it can, as deep as it goes, and only backs up at a dead end.`,
  });
  let found = start === target;
  while (stack.length && !found) {
    const f = stack[stack.length - 1];
    if (f.i < f.nb.length) {
      const { to: y, edge } = f.nb[f.i++];
      if (S.st[y] === 'unseen') {
        S.st[f.id] = 'wait';
        S.st[y] = 'active';
        S.parent[y] = f.id;
        S.tag[y] = ++order;
        S.visited++;
        S.order.push(y);
        stack.push({ id: y, i: 0, nb: g.neighbors(y) });
        S.ds.push({ id: y });
        push('dive', {
          focus: y,
          edge,
          from: f.id,
          to: y,
          head: `Dive to ${L(y)}.`,
          body: `${L(y)} is unvisited, so push it on the stack and follow the string. The thread is now ${plural(stack.length - 1, 'string')} deep.`,
        });
        if (y === target) found = true;
      } else {
        push('skip', {
          focus: f.id,
          edge,
          from: f.id,
          to: y,
          head: `${L(y)} is already visited.`,
          body:
            S.st[y] === 'done'
              ? `${L(y)} is finished. Try the next string.`
              : `${L(y)} is on the thread already. Try the next string.`,
        });
      }
    } else {
      stack.pop();
      S.ds.pop();
      S.st[f.id] = 'done';
      const back = stack.length ? stack[stack.length - 1].id : null;
      if (back != null) S.st[back] = 'active';
      const e = back != null ? g.findEdge(back, f.id) : null;
      push('back', {
        focus: back ?? f.id,
        edge: e ? e.id : null,
        from: f.id,
        to: back,
        head: back != null ? `Dead end at ${L(f.id)}. Back up to ${L(back)}.` : `${L(f.id)} is finished.`,
        body:
          back != null
            ? `Every string from ${L(f.id)} is used up. Pop it off the stack and reel the thread back to ${L(back)}.`
            : `The stack is empty: DFS has explored everything it can reach from ${L(start)}.`,
      });
    }
  }
  const reached = Object.keys(S.tag).length;
  if (found && target != null) {
    S.path = pathTo(S, target);
    push('found', {
      focus: target,
      pathEdges: pathEdges(g, S.path),
      head: `Found ${L(target)}.`,
      body: `The thread shows the route DFS happened to take: ${S.path.map(L).join(' → ')}, ${plural(S.path.length - 1, 'string')}. DFS finds a route, not necessarily the shortest one.`,
    });
  } else {
    const missed = total - reached;
    push('done', {
      head: target != null ? `${L(target)} cannot be reached from ${L(start)}.` : 'Every reachable node is visited.',
      body: `DFS visited ${plural(reached, 'node')}; the ink strings are the tree its thread traced.${missed ? ` ${plural(missed, 'node')} ${missed === 1 ? 'is' : 'are'} not connected to ${L(start)}.` : ''}`,
    });
  }
  return steps;
}

export function runDijkstra(g: Graph, start: NodeId, target: NodeId | null = null): Step[] {
  const { L, steps, S, push } = recorder(g, 'dijkstra');
  const dist: Record<NodeId, number> = {};
  const settled = new Set<NodeId>();
  for (const id of g.nodes.keys()) {
    dist[id] = Infinity;
    S.tag[id] = '∞';
  }
  dist[start] = 0;
  S.tag[start] = 0;
  const pq = new Map<NodeId, number>([[start, 0]]);
  const syncPQ = () => {
    S.ds = [...pq]
      .map(([id, key]) => ({ id, key }))
      .sort((p, q) => p.key - q.key || labelIndex(L(p.id)) - labelIndex(L(q.id)));
  };
  syncPQ();
  S.st[start] = 'wait';
  push('start', {
    focus: start,
    head: `Dijkstra from ${L(start)}${target != null ? ` to ${L(target)}` : ''}.`,
    body: `Every distance starts at ∞ except ${L(start)}, which is 0. ${L(start)}’s ticket goes in the priority queue, which always hands out the cheapest ticket first.`,
  });
  let active: NodeId | null = null;
  let reached = false;
  while (pq.size) {
    const x = S.ds[0].id;
    pq.delete(x);
    syncPQ();
    if (active != null) S.st[active] = 'done';
    settled.add(x);
    S.st[x] = 'active';
    active = x;
    S.order.push(x);
    S.visited++;
    S.tau = dist[x];
    S.lifted[x] = dist[x];
    const first = x === start;
    push('extract', {
      focus: x,
      head: first ? `Take ${L(start)}’s ticket: 0.` : `Take the cheapest ticket: ${L(x)} at ${dist[x]}.`,
      body: first
        ? `Lift ${L(start)} off the plinth. Its strings will pull the others up in order of distance.`
        : `Nothing still waiting can beat ${dist[x]}, because every other ticket is at least as big and no string costs less than 0. ${L(x)} is settled and leaves the plinth.`,
    });
    if (x === target) {
      reached = true;
      S.st[x] = 'done';
      active = null;
      S.path = pathTo(S, target);
      const w: number[] = [];
      for (let i = 1; i < S.path.length; i++) w.push((g.findEdge(S.path[i - 1], S.path[i]) as GraphEdge).w);
      push('path', {
        focus: target,
        pathEdges: pathEdges(g, S.path),
        head: `${L(target)} is settled at ${dist[target]}: the cheapest route.`,
        body: `${S.path.map(L).join(' → ')}${w.length > 1 ? `, ${w.join(' + ')} = ${dist[target]}` : ''}. Lifted by ${L(start)}, those strings hang taut; every other route to ${L(target)} is slack.`,
      });
      break;
    }
    for (const { to: y, w, edge } of g.neighbors(x)) {
      if (settled.has(y)) continue;
      const nd = dist[x] + w;
      if (nd < dist[y]) {
        const old = dist[y];
        dist[y] = nd;
        S.parent[y] = x;
        S.tag[y] = nd;
        pq.set(y, nd);
        syncPQ();
        S.st[y] = 'wait';
        push('improve', {
          focus: x,
          edge,
          from: x,
          to: y,
          old,
          nd,
          head: `Relax ${L(x)} → ${L(y)}: ${dist[x]} + ${w} = ${nd}.`,
          body:
            old === Infinity
              ? `${L(y)} had no route yet, so its first ticket is ${nd}.`
              : `That beats ${L(y)}’s ${old}, so its ticket drops to ${nd} and moves up the queue.`,
        });
      } else {
        push('keep', {
          focus: x,
          edge,
          from: x,
          to: y,
          nd,
          cur: dist[y],
          head: `Relax ${L(x)} → ${L(y)}: ${dist[x]} + ${w} = ${nd}.`,
          body: `${nd === dist[y] ? 'That only ties' : 'That is worse than'} ${L(y)}’s ${dist[y]}. Keep ${dist[y]}.`,
        });
      }
    }
  }
  if (!reached) {
    if (active != null) S.st[active] = 'done';
    const unreached = [...g.nodes.keys()].filter(id => dist[id] === Infinity);
    if (target != null) {
      push('unreachable', {
        focus: target,
        head: `${L(target)} cannot be reached from ${L(start)}.`,
        body: `The queue is empty and ${L(target)} still says ∞. No chain of strings joins them${g.directed ? ' in the direction they point' : ''}, so it stays on the plinth.`,
      });
    } else {
      push('done', {
        head: 'Every reachable knot is settled.',
        body: `The net hangs from ${L(start)} as its shortest-path tree: each taut string is the last leg of a cheapest route.${unreached.length ? ` ${plural(unreached.length, 'knot')} cannot be reached and ${unreached.length === 1 ? 'stays' : 'stay'} on the plinth.` : ''}`,
      });
    }
  }
  return steps;
}

export const RUN: Readonly<Record<AlgoKey, (g: Graph, start: NodeId, target?: NodeId | null) => Step[]>> = {
  bfs: runBFS,
  dfs: runDFS,
  dijkstra: runDijkstra,
};

/* ---------------- race ---------------- */

/** The step kinds that start a new tick: one tick per node processed, so two algorithms race fairly. */
export const TICK_KINDS: Readonly<Record<AlgoKey, ReadonlySet<StepKind>>> = {
  bfs: new Set<StepKind>(['dequeue']),
  dfs: new Set<StepKind>(['start', 'dive']),
  dijkstra: new Set<StepKind>(['extract']),
};

/** Index of the last fine step in each tick. */
export function ticksOf(steps: readonly Step[], algo: AlgoKey): number[] {
  const ends: number[] = [];
  let seenFirst = false;
  steps.forEach((s, i) => {
    if (TICK_KINDS[algo].has(s.kind)) {
      if (seenFirst) ends.push(i - 1);
      seenFirst = true;
    }
  });
  ends.push(steps.length - 1);
  return ends;
}
