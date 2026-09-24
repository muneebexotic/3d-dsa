// Graph Net: the graph model, the presets, and BFS, DFS and Dijkstra.
// Everything here is plain data and runs instantly. Each algorithm records a list
// of steps; the page animates them. No DOM, no Three.js, so it can be tested alone.

export const MAX_NODES = 60, MAX_EDGES = 200, MAX_W = 99;
export const ALGOS = {
  bfs: { name: 'BFS', long: 'Breadth-first search', ds: 'queue' },
  dfs: { name: 'DFS', long: 'Depth-first search', ds: 'stack' },
  dijkstra: { name: 'Dijkstra', long: 'Dijkstra’s shortest paths', ds: 'pq' },
};

export function labelFor(i) { // 0 → A … 25 → Z, 26 → AA
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
const labelIndex = s => [...s].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

export class Graph {
  constructor() { this.nodes = new Map(); this.edges = new Map(); this.directed = false; this.nextId = 1; }
  get size() { return this.nodes.size; }
  clone() {
    const g = new Graph();
    g.directed = this.directed; g.nextId = this.nextId;
    for (const [k, n] of this.nodes) g.nodes.set(k, { ...n });
    for (const [k, e] of this.edges) g.edges.set(k, { ...e });
    return g;
  }
  freeLabel() {
    const used = new Set([...this.nodes.values()].map(n => n.label));
    for (let i = 0; ; i++) if (!used.has(labelFor(i))) return labelFor(i);
  }
  addNode(x, z, label = this.freeLabel()) {
    if (this.nodes.size >= MAX_NODES) return { error: `The plinth holds ${MAX_NODES} knots. Delete some first.` };
    const id = this.nextId++;
    this.nodes.set(id, { id, label, x, z });
    return { id };
  }
  removeNode(id) {
    this.nodes.delete(id);
    for (const [k, e] of this.edges) if (e.a === id || e.b === id) this.edges.delete(k);
  }
  findEdge(a, b) {
    for (const e of this.edges.values()) {
      if (e.a === a && e.b === b) return e;
      if (!this.directed && e.a === b && e.b === a) return e;
    }
    return null;
  }
  addEdge(a, b, w = 1) {
    if (a === b) return { error: 'A string needs two different knots.' };
    if (!this.nodes.has(a) || !this.nodes.has(b)) return { error: 'Both ends must be knots on the plinth.' };
    if (this.findEdge(a, b)) return { error: `${this.label(a)} and ${this.label(b)} are already joined${this.directed ? ' in that direction' : ''}.` };
    if (this.edges.size >= MAX_EDGES) return { error: `The net holds ${MAX_EDGES} strings. Delete some first.` };
    const bad = checkWeight(w); if (bad) return { error: bad };
    const id = this.nextId++;
    this.edges.set(id, { id, a, b, w: +w });
    return { id };
  }
  removeEdge(id) { this.edges.delete(id); }
  setWeight(id, w) {
    const bad = checkWeight(w); if (bad) return { error: bad };
    const e = this.edges.get(id); if (e) e.w = +w;
    return {};
  }
  // Switching to undirected merges strings that now join the same pair, keeping the cheaper one.
  setDirected(flag) {
    this.directed = flag;
    let merged = 0;
    if (!flag) {
      const seen = new Map();
      for (const [k, e] of [...this.edges]) {
        const key = e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`;
        const prev = seen.get(key);
        if (prev) { prev.w = Math.min(prev.w, e.w); this.edges.delete(k); merged++; }
        else seen.set(key, e);
      }
    }
    return merged;
  }
  label(id) { const n = this.nodes.get(id); return n ? n.label : '?'; }
  // Neighbors in alphabetical order, so every run is repeatable.
  neighbors(id) {
    const out = [];
    for (const e of this.edges.values()) {
      if (e.a === id) out.push({ to: e.b, w: e.w, edge: e.id });
      else if (!this.directed && e.b === id) out.push({ to: e.a, w: e.w, edge: e.id });
    }
    return out.sort((p, q) => labelIndex(this.label(p.to)) - labelIndex(this.label(q.to)));
  }
  incoming(id) {
    const out = [];
    for (const e of this.edges.values()) if (e.b === id && this.directed) out.push({ from: e.a, w: e.w, edge: e.id });
    return out;
  }
  byLabel(label) { for (const n of this.nodes.values()) if (n.label === label) return n.id; return null; }
  sortedIds() { return [...this.nodes.keys()].sort((a, b) => labelIndex(this.label(a)) - labelIndex(this.label(b))); }
  toJSON() { return { directed: this.directed, nodes: [...this.nodes.values()], edges: [...this.edges.values()] }; }
}
export function checkWeight(w) {
  const s = String(w).trim();
  if (s === '') return 'Type a weight from 0 to 99.';
  if (!/^\d+$/.test(s)) return /^-/.test(s) ? 'Weights cannot be negative: Dijkstra needs every string to cost 0 or more.' : `“${s.slice(0, 8)}” is not a whole number. Try something like 7.`;
  if (+s > MAX_W) return `Use a weight from 0 to ${MAX_W}.`;
  return null;
}

/* ---------------- step recording ---------------- */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function recorder(g, algo, start, target) {
  const L = id => g.label(id);
  const steps = [];
  const S = { st: {}, tag: {}, parent: {}, order: [], ds: [], tau: 0, lifted: {}, path: [], stats: { visited: 0, edges: 0 } };
  for (const id of g.nodes.keys()) S.st[id] = 'unseen';
  const push = (kind, o = {}) => steps.push({
    kind, algo,
    st: { ...S.st }, tag: { ...S.tag }, parent: { ...S.parent },
    ds: S.ds.map(d => ({ ...d })), tau: S.tau, lifted: { ...S.lifted }, path: S.path.slice(), order: S.order.slice(),
    visited: S.stats.visited, ...o,
  });
  return { L, steps, S, push };
}
function pathTo(S, t) { const p = []; let c = t; while (c != null) { p.unshift(c); c = S.parent[c]; } return p; }
function pathEdges(g, nodes) { const out = []; for (let i = 1; i < nodes.length; i++) { const e = g.findEdge(nodes[i - 1], nodes[i]); if (e) out.push(e.id); } return out; }

export function runBFS(g, start, target = null) {
  const { L, steps, S, push } = recorder(g, 'bfs', start, target);
  const total = g.size;
  S.st[start] = 'wait'; S.tag[start] = 0; S.ds = [{ id: start, key: 0 }];
  push('start', { focus: start, head: `BFS from ${L(start)}.`, body: `Put ${L(start)} in the queue. It is 0 strings from itself. BFS takes nodes out in the order they went in, so it visits everything 1 string away before anything 2 away.` });
  let active = null, found = start === target;
  if (found) S.st[start] = 'done';
  while (S.ds.length && !found) {
    const { id: x } = S.ds.shift();
    if (active != null) S.st[active] = 'done';
    S.st[x] = 'active'; active = x; S.order.push(x); S.stats.visited++;
    const nb = g.neighbors(x);
    push('dequeue', { focus: x, head: `Take ${L(x)} from the front of the queue.`,
      body: nb.length ? `It is ${plural(S.tag[x], 'string')} from ${L(start)}. Now look at each of its ${plural(nb.length, 'neighbor')}.` : `${L(x)} has no strings leading on. Nothing to add.` });
    for (const { to: y, edge } of nb) {
      if (S.st[y] === 'unseen') {
        S.st[y] = 'wait'; S.tag[y] = S.tag[x] + 1; S.parent[y] = x; S.ds.push({ id: y, key: S.tag[y] });
        push('discover', { focus: x, edge, from: x, to: y, head: `${L(y)} is new.`, body: `Mark it seen and add it to the back of the queue. It is ${plural(S.tag[y], 'string')} from ${L(start)}, one more than ${L(x)}.` });
        if (y === target) { found = true; break; }
      } else {
        push('skip', { focus: x, edge, from: x, to: y, head: `${L(y)} is already seen.`, body: S.st[y] === 'done' || S.st[y] === 'active' ? `${L(y)} has already been visited. Skip it.` : `${L(y)} is already waiting in the queue. Skip it.` });
      }
    }
  }
  if (active != null && !found) S.st[active] = 'done';
  const reached = Object.keys(S.tag).length, maxLayer = Math.max(0, ...Object.values(S.tag));
  if (found) {
    S.path = pathTo(S, target);
    push('found', { focus: target, head: `Found ${L(target)}, ${plural(S.tag[target], 'string')} from ${L(start)}.`,
      body: `BFS reaches every node by the fewest strings, because it finishes each layer before starting the next. Route: ${S.path.map(L).join(' → ')}.`, pathEdges: pathEdges(g, S.path) });
  } else {
    const missed = total - reached;
    push('done', { head: target != null ? `${L(target)} cannot be reached from ${L(start)}.` : 'The queue is empty.',
      body: `BFS visited ${plural(reached, 'node')} in ${plural(maxLayer + 1, 'layer')}.${missed ? ` ${plural(missed, 'node')} ${missed === 1 ? 'is' : 'are'} not connected to ${L(start)}, so ${missed === 1 ? 'it stays' : 'they stay'} on the plinth.` : ''}` });
  }
  // payoff: every string the same length, so lifting the start hangs the net in its layers
  for (const id in S.tag) S.lifted[id] = S.tag[id];
  S.tau = found ? S.tag[target] : maxLayer;
  push('lift', { focus: start, liftKind: 'layers', pathEdges: found ? pathEdges(g, S.path) : [],
    head: `Lift ${L(start)} by its string.`,
    body: `With every string counted as one step, the net hangs in layers: each knot sits exactly as many strings below ${L(start)} as BFS said.${found ? ` The route to ${L(target)} pulls taut.` : ''}` });
  return steps;
}

export function runDFS(g, start, target = null) {
  const { L, steps, S, push } = recorder(g, 'dfs', start, target);
  const total = g.size;
  let order = 0;
  const stack = [{ id: start, i: 0, nb: g.neighbors(start) }];
  S.st[start] = 'active'; S.tag[start] = ++order; S.ds = [{ id: start }]; S.stats.visited = 1; S.order.push(start);
  push('start', { focus: start, head: `DFS from ${L(start)}.`, body: `Push ${L(start)} on the stack and mark it visited. DFS always follows the newest string it can, as deep as it goes, and only backs up at a dead end.` });
  let found = start === target;
  while (stack.length && !found) {
    const f = stack[stack.length - 1];
    if (f.i < f.nb.length) {
      const { to: y, edge } = f.nb[f.i++];
      if (S.st[y] === 'unseen') {
        S.st[f.id] = 'wait'; S.st[y] = 'active'; S.parent[y] = f.id; S.tag[y] = ++order; S.stats.visited++; S.order.push(y);
        stack.push({ id: y, i: 0, nb: g.neighbors(y) }); S.ds.push({ id: y });
        push('dive', { focus: y, edge, from: f.id, to: y, head: `Dive to ${L(y)}.`, body: `${L(y)} is unvisited, so push it on the stack and follow the string. The thread is now ${plural(stack.length - 1, 'string')} deep.` });
        if (y === target) found = true;
      } else {
        push('skip', { focus: f.id, edge, from: f.id, to: y, head: `${L(y)} is already visited.`, body: S.st[y] === 'done' ? `${L(y)} is finished. Try the next string.` : `${L(y)} is on the thread already. Try the next string.` });
      }
    } else {
      stack.pop(); S.ds.pop(); S.st[f.id] = 'done';
      const back = stack.length ? stack[stack.length - 1].id : null;
      if (back != null) S.st[back] = 'active';
      const e = back != null ? g.findEdge(back, f.id) : null;
      push('back', { focus: back ?? f.id, edge: e ? e.id : null, from: f.id, to: back,
        head: back != null ? `Dead end at ${L(f.id)}. Back up to ${L(back)}.` : `${L(f.id)} is finished.`,
        body: back != null ? `Every string from ${L(f.id)} is used up. Pop it off the stack and reel the thread back to ${L(back)}.` : `The stack is empty: DFS has explored everything it can reach from ${L(start)}.` });
    }
  }
  const reached = Object.keys(S.tag).length;
  if (found) {
    S.path = pathTo(S, target);
    push('found', { focus: target, pathEdges: pathEdges(g, S.path), head: `Found ${L(target)}.`,
      body: `The thread shows the route DFS happened to take: ${S.path.map(L).join(' → ')}, ${plural(S.path.length - 1, 'string')}. DFS finds a route, not necessarily the shortest one.` });
  } else {
    const missed = total - reached;
    push('done', { head: target != null ? `${L(target)} cannot be reached from ${L(start)}.` : 'Every reachable node is visited.',
      body: `DFS visited ${plural(reached, 'node')}; the ink strings are the tree its thread traced.${missed ? ` ${plural(missed, 'node')} ${missed === 1 ? 'is' : 'are'} not connected to ${L(start)}.` : ''}` });
  }
  return steps;
}

export function runDijkstra(g, start, target = null) {
  const { L, steps, S, push } = recorder(g, 'dijkstra', start, target);
  const dist = {}, settled = new Set();
  for (const id of g.nodes.keys()) { dist[id] = Infinity; S.tag[id] = '∞'; }
  dist[start] = 0; S.tag[start] = 0;
  const pq = new Map([[start, 0]]);
  const syncPQ = () => { S.ds = [...pq].map(([id, key]) => ({ id, key })).sort((p, q) => p.key - q.key || labelIndex(L(p.id)) - labelIndex(L(q.id))); };
  syncPQ(); S.st[start] = 'wait';
  push('start', { focus: start, head: `Dijkstra from ${L(start)}${target != null ? ` to ${L(target)}` : ''}.`,
    body: `Every distance starts at ∞ except ${L(start)}, which is 0. ${L(start)}’s ticket goes in the priority queue, which always hands out the cheapest ticket first.` });
  let active = null, reached = false;
  while (pq.size) {
    const x = S.ds[0].id;
    pq.delete(x); syncPQ();
    if (active != null) S.st[active] = 'done';
    settled.add(x); S.st[x] = 'active'; active = x; S.order.push(x); S.stats.visited++;
    S.tau = dist[x]; S.lifted[x] = dist[x];
    const first = x === start;
    push('extract', { focus: x, head: first ? `Take ${L(start)}’s ticket: 0.` : `Take the cheapest ticket: ${L(x)} at ${dist[x]}.`,
      body: first ? `Lift ${L(start)} off the plinth. Its strings will pull the others up in order of distance.` : `Nothing still waiting can beat ${dist[x]}, because every other ticket is at least as big and no string costs less than 0. ${L(x)} is settled and leaves the plinth.` });
    if (x === target) {
      reached = true;
      S.st[x] = 'done'; active = null;
      S.path = pathTo(S, target);
      const w = []; for (let i = 1; i < S.path.length; i++) w.push(g.findEdge(S.path[i - 1], S.path[i]).w);
      push('path', { focus: target, pathEdges: pathEdges(g, S.path), head: `${L(target)} is settled at ${dist[target]}: the cheapest route.`,
        body: `${S.path.map(L).join(' → ')}${w.length > 1 ? `, ${w.join(' + ')} = ${dist[target]}` : ''}. Lifted by ${L(start)}, those strings hang taut; every other route to ${L(target)} is slack.` });
      break;
    }
    for (const { to: y, w, edge } of g.neighbors(x)) {
      if (settled.has(y)) continue;
      const nd = dist[x] + w;
      if (nd < dist[y]) {
        const old = dist[y];
        dist[y] = nd; S.parent[y] = x; S.tag[y] = nd; pq.set(y, nd); syncPQ(); S.st[y] = 'wait';
        push('improve', { focus: x, edge, from: x, to: y, old, nd,
          head: `Relax ${L(x)} → ${L(y)}: ${dist[x]} + ${w} = ${nd}.`,
          body: old === Infinity ? `${L(y)} had no route yet, so its first ticket is ${nd}.` : `That beats ${L(y)}’s ${old}, so its ticket drops to ${nd} and moves up the queue.` });
      } else {
        push('keep', { focus: x, edge, from: x, to: y, nd, cur: dist[y],
          head: `Relax ${L(x)} → ${L(y)}: ${dist[x]} + ${w} = ${nd}.`,
          body: `${nd === dist[y] ? 'That only ties' : 'That is worse than'} ${L(y)}’s ${dist[y]}. Keep ${dist[y]}.` });
      }
    }
  }
  if (!reached) {
    if (active != null) S.st[active] = 'done';
    const unreached = [...g.nodes.keys()].filter(id => dist[id] === Infinity);
    if (target != null) {
      push('unreachable', { focus: target, head: `${L(target)} cannot be reached from ${L(start)}.`,
        body: `The queue is empty and ${L(target)} still says ∞. No chain of strings joins them${g.directed ? ' in the direction they point' : ''}, so it stays on the plinth.` });
    } else {
      push('done', { head: 'Every reachable knot is settled.', body: `The net hangs from ${L(start)} as its shortest-path tree: each taut string is the last leg of a cheapest route.${unreached.length ? ` ${plural(unreached.length, 'knot')} cannot be reached and ${unreached.length === 1 ? 'stays' : 'stay'} on the plinth.` : ''}` });
    }
  }
  return steps;
}

export const RUN = { bfs: runBFS, dfs: runDFS, dijkstra: runDijkstra };

/* ---------------- race ---------------- */
// One tick per node processed, so two algorithms can be compared fairly.
const TICK = { bfs: new Set(['dequeue']), dfs: new Set(['start', 'dive']), dijkstra: new Set(['extract']) };
export function ticksOf(steps, algo) {
  const ends = [];
  let seenFirst = false;
  steps.forEach((s, i) => {
    if (TICK[algo].has(s.kind)) { if (seenFirst) ends.push(i - 1); seenFirst = true; }
  });
  ends.push(steps.length - 1);
  return ends; // index of the last fine step in each tick
}

/* ---------------- presets ---------------- */
export function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function build(nodes, edges, { directed = false } = {}) {
  const g = new Graph(); g.directed = directed;
  const ids = {};
  for (const [label, x, z] of nodes) ids[label] = g.addNode(x, z, label).id;
  for (const [a, b, w] of edges) g.addEdge(ids[a], ids[b], w);
  return g;
}
function scatter(rnd, n, W, H, minGap) {
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 20000) {
    const p = [(rnd() - 0.5) * W, (rnd() - 0.5) * H];
    if (pts.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) >= minGap)) pts.push(p);
  }
  return pts;
}
function connectNearest(g, ids, rnd, k, wMax) {
  const P = id => g.nodes.get(id);
  for (const a of ids) {
    const near = ids.filter(b => b !== a).sort((p, q) => Math.hypot(P(p).x - P(a).x, P(p).z - P(a).z) - Math.hypot(P(q).x - P(a).x, P(q).z - P(a).z));
    for (const b of near.slice(0, k)) if (!g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * wMax));
  }
}
function spanning(g, ids, rnd, wMax) { // join everything with a nearest-neighbor tree so the net is connected
  const P = id => g.nodes.get(id);
  const inTree = [ids[0]], rest = ids.slice(1);
  while (rest.length) {
    let best = null;
    for (const a of inTree) for (const b of rest) { const d = Math.hypot(P(a).x - P(b).x, P(a).z - P(b).z); if (!best || d < best.d) best = { a, b, d }; }
    g.addEdge(best.a, best.b, 1 + Math.floor(rnd() * wMax));
    inTree.push(best.b); rest.splice(rest.indexOf(best.b), 1);
  }
}

export const PRESETS = {
  textbook: { name: 'Textbook', algo: 'dijkstra', make() {
    return build(
      [['A', -5.3, 0.2], ['B', -1.9, -2.0], ['C', -3.6, 2.2], ['D', -0.2, 0.4], ['E', 0.8, 2.8], ['F', 2.2, -2.0], ['G', 3.4, 1.5], ['H', 5.4, -0.1]],
      [['A', 'B', 4], ['A', 'C', 2], ['C', 'B', 1], ['B', 'D', 5], ['C', 'D', 8], ['C', 'E', 10], ['D', 'E', 2], ['D', 'F', 6], ['E', 'G', 3], ['F', 'G', 1], ['F', 'H', 4], ['G', 'H', 7], ['D', 'G', 9]]);
  }, start: 'A', target: 'H' },
  contrast: { name: 'Wide vs deep', algo: 'race', make() {
    return build(
      [['A', -0.6, 0.2], ['B', 1.3, -2.2], ['C', 3.2, -3.1], ['D', 5.0, -2.1], ['E', 5.8, 0.0], ['F', 5.0, 2.0], ['G', 3.2, 2.9],
       ['H', -2.4, 2.1], ['I', -2.9, 0.1], ['J', -2.4, -1.9], ['K', -4.4, 3.1], ['L', -5.1, 1.1], ['M', -5.0, -0.9], ['N', -4.4, -2.9]],
      [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'E', 1], ['E', 'F', 1], ['F', 'G', 1], ['A', 'H', 1], ['A', 'I', 1], ['A', 'J', 1], ['H', 'K', 1], ['I', 'L', 1], ['I', 'M', 1], ['J', 'N', 1]]);
  }, start: 'A', target: 'K', race: ['bfs', 'dfs'] },
  grid: { name: 'Grid', algo: 'bfs', make(seed = 3) {
    const rnd = mulberry(seed), g = new Graph(), C = 6, Rw = 4, gap = 2.1, ids = [];
    for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) ids.push(g.addNode((c - (C - 1) / 2) * gap, (r - (Rw - 1) / 2) * gap).id);
    for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (c < C - 1) g.addEdge(ids[i], ids[i + 1], 1 + Math.floor(rnd() * 9));
      if (r < Rw - 1) g.addEdge(ids[i], ids[i + C], 1 + Math.floor(rnd() * 9));
    }
    return g;
  }, start: 'A', target: 'X' },
  sparse: { name: 'Random sparse', algo: 'dijkstra', random: true, make(seed = 11) {
    const rnd = mulberry(seed), g = new Graph();
    const pts = scatter(rnd, 16, 13, 8, 1.7);
    const ids = pts.map(p => g.addNode(p[0], p[1]).id);
    spanning(g, ids, rnd, 12);
    for (let k = 0; k < 5; k++) { const a = ids[Math.floor(rnd() * ids.length)], b = ids[Math.floor(rnd() * ids.length)]; if (a !== b && !g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * 12)); }
    return g;
  }, start: 'A' },
  dense: { name: 'Random dense', algo: 'dijkstra', random: true, make(seed = 5) {
    const rnd = mulberry(seed), g = new Graph();
    const pts = scatter(rnd, 22, 14, 9, 1.6);
    const ids = pts.map(p => g.addNode(p[0], p[1]).id);
    spanning(g, ids, rnd, 20);
    connectNearest(g, ids, rnd, 4, 20);
    return g;
  }, start: 'A' },
  islands: { name: 'Islands', algo: 'dijkstra', make() {
    return build(
      [['A', -5.2, -0.6], ['B', -3.6, 1.6], ['C', -3.3, -1.9], ['D', -1.7, 0.2], ['E', -1.2, 2.4], ['F', -0.9, -2.3],
       ['G', 2.2, 1.6], ['H', 3.8, 2.4], ['I', 4.2, 0.2], ['J', 2.6, -1.3], ['K', 5.6, -1.6], ['L', 0.6, -0.4]],
      [['A', 'B', 3], ['A', 'C', 2], ['B', 'D', 4], ['C', 'D', 1], ['B', 'E', 2], ['D', 'E', 5], ['C', 'F', 6], ['D', 'F', 3],
       ['G', 'H', 2], ['G', 'J', 4], ['H', 'I', 3], ['I', 'J', 1], ['I', 'K', 2], ['J', 'K', 5]]);
  }, start: 'A', target: 'K' },
  large: { name: 'Large (60 knots)', algo: 'bfs', random: true, make(seed = 21) {
    const rnd = mulberry(seed), g = new Graph(), C = 10, Rw = 6, gap = 1.75, ids = [];
    for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) ids.push(g.addNode((c - (C - 1) / 2) * gap + (rnd() - 0.5) * 0.6, (r - (Rw - 1) / 2) * gap + (rnd() - 0.5) * 0.6).id);
    for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (c < C - 1) g.addEdge(ids[i], ids[i + 1], 1 + Math.floor(rnd() * 9));
      if (r < Rw - 1) g.addEdge(ids[i], ids[i + C], 1 + Math.floor(rnd() * 9));
    }
    let guard = 0;
    while (g.edges.size < 150 && guard++ < 1000) {
      const r = Math.floor(rnd() * (Rw - 1)), c = Math.floor(rnd() * (C - 1)), i = r * C + c;
      const [a, b] = rnd() < 0.5 ? [ids[i], ids[i + C + 1]] : [ids[i + 1], ids[i + C]];
      if (!g.findEdge(a, b)) g.addEdge(a, b, 1 + Math.floor(rnd() * 9));
    }
    return g;
  }, start: 'A', target: 'BH' },
};
