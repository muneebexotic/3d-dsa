// Poses. A pose is a plain description of everything on the plinths at one
// instant. The rest pose after each step is built from the algorithm's snapshot;
// motion between two poses is a blend. No Three.js here, so it is unit-tested.

import { lerp } from '../../core/math';
import {
  ALGOS,
  RUN,
  ticksOf,
  type AlgoKey,
  type EdgeId,
  type Graph,
  type NodeId,
  type Step,
  type StepKind,
} from './algorithms';
import { L0, LIFT_MAX, MARGIN, STATE, mix3, type RGB } from './palette';

export type TagStyle = 'wait' | 'done' | 'inf';

export interface NodePose {
  key: string;
  id: NodeId;
  label: string;
  x: number;
  z: number;
  /** Height of the knot above the plinth. */
  h: number;
  /** Scale; 0 means gone. */
  s: number;
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  /** Processing halo, 0..1. */
  halo: number;
  /** Target ring (dashed), and how much of it is solid (reached). */
  tgt: number;
  tgtSolid: number;
  /** The small ring the lifting wire hooks into (start knot). */
  hook: number;
  tag: string | null;
  tagA: number;
  tagSt: TagStyle;
}

export interface EdgePose {
  key: string;
  id: EdgeId;
  /** Node keys of the two ends. */
  a: string;
  b: string;
  w: number;
  s: number;
  /** Visibility of the weight label, for cross-fading a changed weight. */
  wA: number;
  /** Part of the search tree (ink). */
  tree: number;
  /** Part of the final route (cobalt), drawn from pathFrom. */
  path: number;
  pathFrom: string;
  /** How much of the DFS thread covers it, drawn from thrFrom. */
  thr: number;
  thrFrom: string;
  /** Being examined in this step. */
  hl: number;
  /** Arrowhead (directed graphs). */
  dir: number;
}

export interface Bead {
  edge: string;
  from: string;
  u: number;
  col: RGB;
  a: number;
  r?: number;
}
export interface Ripple {
  node: string;
  r: number;
  a: number;
  col: RGB;
}
/** An old distance lifting away, struck through. */
export interface Ghost {
  node: string;
  text: string;
  g: number;
}
export interface Plinth {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

/** One plinth with one algorithm on it. */
export interface NetPose {
  key: string;
  gen: number;
  algo: AlgoKey;
  title: string;
  startKey: string | null;
  rulerText: string;
  ox: number;
  oz: number;
  plinth: Plinth;
  /** Plinth presence; it sinks into the floor as this falls to 0. */
  pa: number;
  /** World units per unit of distance when lifted. */
  HS: number;
  /** 1 when every string counts as one step (BFS). */
  unit: number;
  /** How far the start has been lifted, in distance units. */
  tau: number;
  wire: number;
  ruler: number;
  titleA: number;
  nodes: Map<string, NodePose>;
  edges: Map<string, EdgePose>;
  beads: Bead[];
  ripples: Ripple[];
  ghosts: Ghost[];
}

export interface Callout {
  node: string;
  text: string;
  tone?: 'cobalt' | 'red';
  a: number;
}
export interface Focus {
  node: string;
  w: number;
}
/** Everything on screen: one or two plinths, plus the floating label and camera focus. */
export interface ScenePose {
  nets: NetPose[];
  callout: (Callout & { j: number }) | null;
  focus: (Focus & { j: number }) | null;
}

/** A net's steps and cached poses. */
export interface NetCtx {
  key: string;
  j: number;
  gen: number;
  g: Graph;
  algo: AlgoKey;
  steps: Step[];
  HS: number;
  unit: number;
  plinth: Plinth;
  ox: number;
  oz: number;
  start: NodeId | null;
  target: NodeId | null;
  title: string;
  /** Speeds up big graphs. */
  pace: number;
  /** Race only: index of the last fine step in each tick. */
  ticks: number[] | null;
  statics: NetPose[];
  trs: NetTransition[];
}

/** One net's pose during a step, with the label and camera focus the step wants. */
export interface NetMotion {
  net: NetPose;
  callout?: Callout | null;
  focus?: Focus | null;
}
/** The motion of one step on one net. */
export interface NetTransition {
  dur: number;
  kind: StepKind;
  pose(t: number): NetMotion;
}

export function plinthOf(g: Graph): Plinth {
  if (!g.size) return { cx: 0, cz: 0, w: 8, d: 5 };
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const n of g.nodes.values()) {
    x0 = Math.min(x0, n.x);
    x1 = Math.max(x1, n.x);
    z0 = Math.min(z0, n.z);
    z1 = Math.max(z1, n.z);
  }
  const w = Math.max(6, x1 - x0 + 2 * MARGIN),
    d = Math.max(4.2, z1 - z0 + 2 * MARGIN);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w, d };
}

/** Race: two plinths, one behind the other, centred on the origin. */
export const RACE_GAP = 1.0;
export function raceOffsets(pl: Plinth): [{ ox: number; oz: number }, { ox: number; oz: number }] {
  return [
    { ox: -pl.cx, oz: -RACE_GAP - pl.cz - pl.d / 2 },
    { ox: -pl.cx, oz: RACE_GAP - pl.cz + pl.d / 2 },
  ];
}

export interface CtxOptions {
  g: Graph;
  algo: AlgoKey;
  /** Which plinth, and how many there are. */
  j: number;
  count: number;
  /** Generation of the graph; poses of different generations never blend knot by knot. */
  gen: number;
  start: NodeId | null;
  target: NodeId | null;
}

/** Run one algorithm and prepare its plinth. */
export function makeCtx({ g, algo, j, count, gen, start, target }: CtxOptions): NetCtx {
  const hasStart = start != null && g.nodes.has(start);
  let steps = hasStart ? RUN[algo](g, start, target) : [];
  if (count > 1) steps = steps.filter(s => s.kind !== 'lift');
  let HS = 0,
    unit = 0;
  if (algo === 'dijkstra') {
    const T = Math.max(0, ...steps.map(s => s.tau));
    HS = T > 0 ? (LIFT_MAX * (count > 1 ? 0.6 : 1)) / T : 0;
  } else if (algo === 'bfs') {
    const lift = steps.find(s => s.kind === 'lift');
    const T = lift ? lift.tau : 0;
    HS = T > 0 ? Math.min(1.9, LIFT_MAX / T) : 0;
    unit = 1;
  }
  const plinth = plinthOf(g);
  const { ox, oz } = count > 1 ? raceOffsets(plinth)[j] : { ox: 0, oz: 0 };
  return {
    key: 'n' + j,
    j,
    gen,
    g,
    algo,
    steps,
    HS,
    unit,
    plinth,
    ox,
    oz,
    start: hasStart ? start : null,
    target: hasStart ? target : null,
    title: count > 1 ? ALGOS[algo].name.toUpperCase() : '',
    pace: g.size > 30 ? 0.7 : 1,
    ticks: count > 1 ? ticksOf(steps, algo) : null,
    statics: [],
    trs: [],
  };
}

export const nkey = (ctx: { gen: number }, id: NodeId): string => `${ctx.gen}:${id}`;
export const ekey = (ctx: { gen: number }, id: EdgeId): string => `${ctx.gen}:e${id}`;

/** Step kinds that highlight the string they examine. */
export const FOCUS_EDGE: ReadonlySet<StepKind> = new Set<StepKind>([
  'discover',
  'skip',
  'dive',
  'back',
  'improve',
  'keep',
]);

/** The rest pose of one net after step i (i = -1: before the first step). */
export function netStatic(ctx: NetCtx, i: number): NetPose {
  const hit = ctx.statics[i + 1];
  if (hit) return hit;
  const step = i >= 0 ? ctx.steps[i] : null,
    g = ctx.g;
  const nodes = new Map<string, NodePose>(),
    edges = new Map<string, EdgePose>();
  const reached =
    !!step && (step.kind === 'found' || step.kind === 'path' || (step.kind === 'lift' && step.path.length > 0));
  let maxH = 0;
  for (const n of g.nodes.values()) {
    const st = step ? step.st[n.id] : 'unseen',
      S = STATE[st];
    const d = step ? step.lifted[n.id] : undefined;
    const h = step && d != null ? L0 + (step.tau - d) * ctx.HS : 0;
    maxH = Math.max(maxH, h);
    let tag: string | null = null,
      tagSt: TagStyle = 'done';
    if (step) {
      if (ctx.algo === 'dijkstra') {
        tag = String(step.tag[n.id]);
        tagSt = st === 'unseen' ? 'inf' : st === 'wait' ? 'wait' : 'done';
      } else if (step.tag[n.id] != null) {
        tag = String(step.tag[n.id]);
        tagSt = st === 'wait' ? 'wait' : 'done';
      }
    }
    const k = nkey(ctx, n.id);
    nodes.set(k, {
      key: k,
      id: n.id,
      label: n.label,
      x: n.x,
      z: n.z,
      h,
      s: 1,
      fill: S.fill,
      glyph: S.glyph,
      rim: S.rim,
      rimW: S.rimW,
      halo: st === 'active' ? 1 : 0,
      tgt: n.id === ctx.target ? 1 : 0,
      tgtSolid: reached && n.id === ctx.target ? 1 : 0,
      hook: n.id === ctx.start ? 1 : 0,
      tag,
      tagA: tag != null ? 1 : 0,
      tagSt,
    });
  }
  // the DFS thread follows the stack; the payoff route follows the path
  const thread = new Map<EdgeId, NodeId>(),
    route = new Map<EdgeId, NodeId>();
  if (step && ctx.algo === 'dfs')
    for (let k = 1; k < step.ds.length; k++) {
      const e = g.findEdge(step.ds[k - 1].id, step.ds[k].id);
      if (e) thread.set(e.id, step.ds[k - 1].id);
    }
  if (step && step.pathEdges && step.pathEdges.length)
    for (let k = 1; k < step.path.length; k++) {
      const e = g.findEdge(step.path[k - 1], step.path[k]);
      if (e) route.set(e.id, step.path[k - 1]);
    }
  for (const e of g.edges.values()) {
    const tree = !!step && (step.parent[e.b] === e.a || (!g.directed && step.parent[e.a] === e.b));
    const k = ekey(ctx, e.id);
    edges.set(k, {
      key: k,
      id: e.id,
      a: nkey(ctx, e.a),
      b: nkey(ctx, e.b),
      w: e.w,
      s: 1,
      wA: 1,
      tree: tree ? 1 : 0,
      path: route.has(e.id) ? 1 : 0,
      pathFrom: nkey(ctx, route.get(e.id) ?? e.a),
      thr: thread.has(e.id) ? 1 : 0,
      thrFrom: nkey(ctx, thread.get(e.id) ?? e.a),
      hl: step && step.edge === e.id && FOCUS_EDGE.has(step.kind) ? 1 : 0,
      dir: g.directed ? 1 : 0,
    });
  }
  const lifted = maxH > 0 ? 1 : 0;
  const net: NetPose = {
    key: ctx.key,
    gen: ctx.gen,
    algo: ctx.algo,
    title: ctx.title,
    startKey: ctx.start != null ? nkey(ctx, ctx.start) : null,
    rulerText: `${ctx.algo === 'bfs' ? 'STRINGS' : 'DISTANCE'} FROM ${ctx.start != null ? g.label(ctx.start) : ''}`,
    ox: ctx.ox,
    oz: ctx.oz,
    plinth: { ...ctx.plinth },
    pa: 1,
    HS: ctx.HS,
    unit: ctx.unit,
    tau: step ? step.tau : 0,
    wire: lifted,
    ruler: lifted,
    titleA: ctx.title ? 1 : 0,
    nodes,
    edges,
    beads: [],
    ripples: [],
    ghosts: [],
  };
  ctx.statics[i + 1] = net;
  return net;
}

/* ---------------- blending ---------------- */

function mixNode(a: NodePose, b: NodePose, k: number, kh: number): NodePose {
  const same = a.tag === b.tag && a.tagSt === b.tagSt;
  return {
    key: b.key,
    id: b.id,
    label: b.label,
    x: lerp(a.x, b.x, k),
    z: lerp(a.z, b.z, k),
    h: lerp(a.h, b.h, kh),
    s: lerp(a.s, b.s, k),
    fill: mix3(a.fill, b.fill, k),
    glyph: mix3(a.glyph, b.glyph, k),
    rim: mix3(a.rim, b.rim, k),
    rimW: lerp(a.rimW, b.rimW, k),
    halo: lerp(a.halo, b.halo, k),
    tgt: lerp(a.tgt, b.tgt, k),
    tgtSolid: lerp(a.tgtSolid, b.tgtSolid, k),
    hook: lerp(a.hook, b.hook, k),
    tag: k < 0.5 ? a.tag : b.tag,
    tagSt: k < 0.5 ? a.tagSt : b.tagSt,
    // a changed label dips out and back in
    tagA: same ? lerp(a.tagA, b.tagA, k) : k < 0.5 ? a.tagA * (1 - 2 * k) : b.tagA * (2 * k - 1),
  };
}
function mixEdge(a: EdgePose, b: EdgePose, k: number): EdgePose {
  const same = a.w === b.w;
  return {
    ...b,
    s: lerp(a.s, b.s, k),
    tree: lerp(a.tree, b.tree, k),
    path: lerp(a.path, b.path, k),
    pathFrom: b.path > 0 ? b.pathFrom : a.pathFrom,
    thr: a.thr > 0 && b.thr > 0 && a.thrFrom !== b.thrFrom ? b.thr : lerp(a.thr, b.thr, k),
    thrFrom: b.thr > 0 ? b.thrFrom : a.thrFrom,
    hl: lerp(a.hl, b.hl, k),
    dir: lerp(a.dir, b.dir, k),
    w: k < 0.5 ? a.w : b.w,
    wA: same ? lerp(a.wA, b.wA, k) : k < 0.5 ? a.wA * (1 - 2 * k) : b.wA * (2 * k - 1),
  };
}
const appearN = (n: NodePose, k: number): NodePose => ({ ...n, s: n.s * k, tagA: n.tagA * k });
const appearE = (e: EdgePose, k: number): EdgePose => ({ ...e, s: e.s * k });

/** A whole plinth appearing (k: 0 → 1) or going away (1 → 0). */
export function fadeNet(N: NetPose, k: number): NetPose {
  const nodes = new Map<string, NodePose>(),
    edges = new Map<string, EdgePose>();
  for (const [key, n] of N.nodes) nodes.set(key, appearN(n, k));
  for (const [key, e] of N.edges) edges.set(key, appearE(e, k));
  return {
    ...N,
    pa: N.pa * k,
    wire: N.wire * k,
    ruler: N.ruler * k,
    titleA: N.titleA * k,
    nodes,
    edges,
    beads: [],
    ripples: [],
    ghosts: [],
  };
}

/** Per-item timing: returns the blend amount for a node ('n') or edge ('e'). */
export type ItemTiming = (key: string, type: 'n' | 'e') => number;

/**
 * Blend two poses of one net. `kf` gives per-item timing and `hf` per-knot height
 * timing; without them everything moves together. Overlays (beads, ripples,
 * ghosts) are never blended: each motion adds its own.
 */
export function mixNet(
  A: NetPose | undefined,
  B: NetPose | undefined,
  k: number,
  kf?: ItemTiming | null,
  hf?: ((key: string) => number) | null,
): NetPose {
  if (!A && !B) throw new Error('mixNet needs at least one pose');
  if (!A) return fadeNet(B as NetPose, k);
  if (!B) return fadeNet(A, 1 - k);
  const nodes = new Map<string, NodePose>(),
    edges = new Map<string, EdgePose>();
  for (const [key, b] of B.nodes) {
    const a = A.nodes.get(key),
      kk = kf ? kf(key, 'n') : k;
    nodes.set(key, a ? mixNode(a, b, kk, hf ? hf(key) : kk) : appearN(b, kk));
  }
  for (const [key, a] of A.nodes)
    if (!B.nodes.has(key)) {
      // a knot that goes away sinks as it fades
      const kk = kf ? kf(key, 'n') : k;
      nodes.set(key, { ...appearN(a, 1 - kk), h: a.h * (1 - kk) });
    }
  for (const [key, b] of B.edges) {
    const a = A.edges.get(key),
      kk = kf ? kf(key, 'e') : k;
    edges.set(key, a ? mixEdge(a, b, kk) : appearE(b, kk));
  }
  for (const [key, a] of A.edges) if (!B.edges.has(key)) edges.set(key, appearE(a, 1 - (kf ? kf(key, 'e') : k)));
  const pl = {
    cx: lerp(A.plinth.cx, B.plinth.cx, k),
    cz: lerp(A.plinth.cz, B.plinth.cz, k),
    w: lerp(A.plinth.w, B.plinth.w, k),
    d: lerp(A.plinth.d, B.plinth.d, k),
  };
  return {
    key: B.key,
    gen: B.gen,
    algo: B.algo,
    title: B.title || A.title,
    startKey: B.startKey,
    rulerText: B.rulerText,
    ox: lerp(A.ox, B.ox, k),
    oz: lerp(A.oz, B.oz, k),
    plinth: pl,
    pa: lerp(A.pa, B.pa, k),
    HS: lerp(A.HS, B.HS, k),
    unit: lerp(A.unit, B.unit, k),
    tau: lerp(A.tau, B.tau, k),
    wire: lerp(A.wire, B.wire, k),
    ruler: lerp(A.ruler, B.ruler, k),
    titleA: lerp(A.titleA, B.titleA, k),
    nodes,
    edges,
    beads: [],
    ripples: [],
    ghosts: [],
  };
}
