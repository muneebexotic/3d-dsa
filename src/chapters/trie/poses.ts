// Poses. A pose says, for every sunburst on the plinth, where each node stands
// (its angle and its ring), how big its disc is, whether it is there at all, and
// what is lit on it. All the poses of one recording share a Universe: every node
// the recording ever shows, in one fixed order, so two poses blend slot by slot and
// a node that comes or goes simply grows out of, or shrinks into, the node it
// hangs from. No Three.js here, so it is unit-tested.

import { glyphWidth } from '../../core/glyphs';
import { lerp } from '../../core/math';
import type { Program } from '../../core/player';
import type { Callout, FanKey, FanState, Recording, Step } from './diagram';
import * as Lay from './layout';
import { firstWith, shapeOf, zipShapeOf, type Dict, type Shape } from './trie';

/* ---------------- where the nodes go ---------------- */

/** Angles and disc sizes for every node of a shape. */
export interface Layout {
  th: Float32Array;
  r: Float32Array;
  /** The slice of the fan each node's words take: from angle lo to angle hi. */
  lo: Float32Array;
  hi: Float32Array;
}

const SUBTREES = new WeakMap<Shape, Int32Array>();
/** How many nodes each node's subtree holds, itself included. In walk order a subtree is a run: [i, i + size). */
export function subtreeSizes(S: Shape): Int32Array {
  let size = SUBTREES.get(S);
  if (size) return size;
  size = new Int32Array(S.ids.length).fill(1);
  for (let i = S.ids.length - 1; i > 0; i--) size[S.parent[i]] += size[i];
  SUBTREES.set(S, size);
  return size;
}

const isLeaf = (S: Shape, i: number): boolean => i > 0 && S.kids[i].length === 0;

const LAYOUTS = new WeakMap<Shape, Map<string, Layout>>();

/**
 * Lay a shape out as a fan. Every leaf gets an equal slice of the half circle, in
 * walk order (A to Z, left to right), and every other node sits in the middle of
 * its children, so a word's letters run out along a ray. The focus, if any, is
 * given room: its slice widens (up to a little over half the fan) until its words
 * are far enough apart to read, and the rest of the fan closes up to make way.
 */
export function layoutOf(S: Shape, focus: string | null): Layout {
  let byFocus = LAYOUTS.get(S);
  if (!byFocus) LAYOUTS.set(S, (byFocus = new Map()));
  const key = focus ?? '';
  const cached = byFocus.get(key);
  if (cached) return cached;
  const n = S.ids.length,
    size = subtreeSizes(S);
  const th = new Float32Array(n),
    r = new Float32Array(n),
    lo = new Float32Array(n),
    hi = new Float32Array(n);
  // the focus: a run of the walk, and the weight each of its leaves gets
  let f0 = -1,
    f1 = -1,
    W = 1;
  const fi = focus ? S.index.get(focus) : undefined;
  if (fi != null && fi > 0) {
    f0 = fi;
    f1 = fi + size[fi];
    let F = 0;
    for (let i = f0; i < f1; i++) if (isLeaf(S, i)) F++;
    const N = S.leaves;
    if (F > 0 && F < N) {
      const want = Math.min(0.55, (F * 0.11) / Lay.SPAN);
      if (want > F / N) W = (want * (N - F)) / ((1 - want) * F);
    }
  }
  let total = 0;
  for (let i = 1; i < n; i++) if (isLeaf(S, i)) total += i >= f0 && i < f1 ? W : 1;
  let acc = 0;
  for (let i = 1; i < n; i++) {
    if (!isLeaf(S, i)) continue;
    const w = i >= f0 && i < f1 ? W : 1;
    hi[i] = Lay.TH1 - (acc / total) * Lay.SPAN;
    acc += w;
    lo[i] = Lay.TH1 - (acc / total) * Lay.SPAN;
    th[i] = (lo[i] + hi[i]) / 2;
  }
  for (let i = n - 1; i >= 0; i--) {
    const k = S.kids[i];
    if (!k.length) continue;
    const a = k[0],
      b = k[k.length - 1];
    th[i] = (th[a] + th[b]) / 2;
    hi[i] = hi[a];
    lo[i] = lo[b];
  }
  if (n === 1 || !S.kids[0].length) {
    th[0] = Math.PI / 2;
    lo[0] = Lay.TH0;
    hi[0] = Lay.TH1;
  }
  // discs: as big as the gap to their neighbours on the same ring allows
  const rings: number[][] = [];
  for (let i = 1; i < n; i++) (rings[S.depth[i]] ??= []).push(i);
  for (let d = 1; d < rings.length; d++) {
    const row = rings[d];
    if (!row) continue;
    const R = Lay.ringR(d);
    row.forEach((i, k) => {
      let gap = Infinity;
      if (k > 0) gap = Math.min(gap, th[row[k - 1]] - th[i]);
      if (k < row.length - 1) gap = Math.min(gap, th[i] - th[row[k + 1]]);
      r[i] = Math.max(Lay.DISC_MIN, Math.min(Lay.DISC_MAX, 0.42 * gap * R));
    });
  }
  r[0] = Lay.HUB_R;
  const L = { th, r, lo, hi };
  byFocus.set(key, L);
  return L;
}

/** The shape a sunburst's state draws. */
export const shapeFor = (st: FanState): Shape =>
  st.zip != null ? zipShapeOf(st.dict, st.zip) : shapeOf(st.dict, st.draft);

/**
 * Where a node that is not there should be drawn from, or shrink into: the node
 * that stands for it. A letter not yet shared stands for the shared node it will
 * become, and the other way round; a new node stands on its parent.
 */
export function anchorId(id: string, dict: Dict, has: (id: string) => boolean): string {
  const bar = id.indexOf('|');
  if (bar >= 0) {
    const p = id.slice(0, bar),
      w = id.slice(bar + 1);
    if (has(p)) return p;
    for (let k = p.length - 1; k > 0; k--) {
      if (has(`${w.slice(0, k)}|${w}`)) return `${w.slice(0, k)}|${w}`;
      if (has(w.slice(0, k))) return w.slice(0, k);
    }
    return '';
  }
  const w = id ? firstWith(dict, id) : null;
  if (w && has(`${id}|${w}`)) return `${id}|${w}`;
  for (let k = id.length - 1; k > 0; k--) {
    const p = id.slice(0, k);
    if (has(p)) return p;
    if (w && has(`${p}|${w}`)) return `${p}|${w}`;
  }
  return '';
}

/* ---------------- poses ---------------- */

/** Every node a recording's sunburst will ever show, in one fixed order. */
export interface Universe {
  ids: string[];
  index: Map<string, number>;
  ch: string[];
  depth: Uint8Array;
}

export function universeOf(shapes: readonly Shape[]): Universe {
  const ids: string[] = [],
    ch: string[] = [],
    depth: number[] = [];
  const index = new Map<string, number>();
  for (const S of shapes)
    S.ids.forEach((id, j) => {
      if (index.has(id)) return;
      index.set(id, ids.length);
      ids.push(id);
      ch.push(S.ch[j]);
      depth.push(S.depth[j]);
    });
  return { ids, index, ch, depth: Uint8Array.from(depth) };
}

/** What is blended node by node. */
export const CHANNELS = [
  'th', // angle
  'rr', // distance from the centre
  'r', // disc radius
  'al', // 1 when the node is there
  'word', // 1 when a word ends here
  'path', // on the path being followed
  'glow', // the node the light is on
  'fresh', // just made
  'doom', // being taken away
  'lit', // a word read out
  'seen', // a spell check reached it, still in reach
  'cut', // a spell check cut it
  'dim', // not part of what is being looked at
] as const;
export type Channel = (typeof CHANNELS)[number];
/** Channels that say where a node is, rather than how it is lit. */
const PLACE: ReadonlySet<Channel> = new Set(['th', 'rr', 'r', 'al']);

export interface RimLabel {
  key: string;
  text: string;
  /** The node it reads out (-1 for "+ N more"). */
  node: number;
  th: number;
  a: number;
}
export interface Wedge {
  th0: number;
  th1: number;
  r0: number;
  a: number;
}
/** The slot a missing letter would have had. */
export interface Ghost {
  node: number;
  ch: string;
  th: number;
  rr: number;
  a: number;
}

/** A spark running along a wire, from one node toward another. */
export interface Spark {
  from: number;
  to: number;
  /** How far along: 0 at `from`, 1 at `to`. */
  s: number;
  a: number;
  tone: 'cobalt' | 'red' | 'gold';
}
/** A ring widening round a node. */
export interface Pulse {
  node: number;
  s: number;
  a: number;
  tone: 'cobalt' | 'red' | 'gold';
}
/** An arc sweeping out from one ring to the next: a spell check moving a letter deeper. */
export interface Ripple {
  rr: number;
  a: number;
}

export type FanPose = Record<Channel, Float32Array> & {
  key: FanKey;
  uni: Universe;
  dict: Dict;
  /** Parent of each node, as an index into the universe (-1 for none). */
  up: Int32Array;
  /** Where the sunburst stands: its centre is at (cx, cy + HUB_Y). */
  cx: number;
  cy: number;
  a: number;
  wedge: Wedge | null;
  miss: Ghost | null;
  labels: RimLabel[];
  /** Effects that exist only while a step plays. */
  sparks: Spark[];
  pulses: Pulse[];
  ripple: Ripple | null;
};

export interface CalloutPose {
  fan: number;
  node: number;
  text: string;
  tone: Callout['tone'];
  al: number;
}

export interface Pose {
  fans: FanPose[];
  callout: CalloutPose | null;
  /** The plinth, left and right. */
  x0: number;
  x1: number;
}

function blankFan(key: FanKey, uni: Universe, dict: Dict, cx: number, cy: number): FanPose {
  const n = uni.ids.length;
  const P = {
    key,
    uni,
    dict,
    up: new Int32Array(n).fill(-1),
    cx,
    cy,
    a: 1,
    wedge: null,
    miss: null,
    labels: [],
    sparks: [],
    pulses: [],
    ripple: null,
  } as Omit<FanPose, Channel> as FanPose;
  for (const c of CHANNELS) P[c] = new Float32Array(n);
  return P;
}

/** Room a read-out word needs along the rim at angle th, as an angle. */
function pillGap(a: string, b: string, th: number): number {
  const w = (s: string) => glyphWidth(s, Lay.PILL_H) + Lay.PILL_H * 1.6;
  const h = Lay.PILL_H * 2.1;
  return (((w(a) + w(b)) / 2) * Math.abs(Math.sin(th)) + h * Math.abs(Math.cos(th))) / Lay.RIM + 0.012;
}

/** Spread labels (sorted left to right) so neighbours never overlap, keeping them near their words. */
function spread(labels: RimLabel[]): void {
  if (labels.length < 2) return;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let k = 0; k < labels.length - 1; k++) {
      const A = labels[k],
        B = labels[k + 1];
      const need = pillGap(A.text, B.text, (A.th + B.th) / 2);
      const have = A.th - B.th;
      if (have < need - 1e-6) {
        const push = (need - have) / 2;
        A.th = Math.min(Lay.TH1, A.th + push);
        B.th = Math.max(Lay.TH0, B.th - push);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** A sunburst at rest in one step's state. */
export function restFan(st: FanState, uni: Universe, cx: number, cy: number): FanPose {
  const S = shapeFor(st),
    L = layoutOf(S, st.focus),
    n = uni.ids.length;
  const P = blankFan(st.key, uni, st.dict, cx, cy);
  const there = new Uint8Array(n);
  for (let j = 0; j < S.ids.length; j++) {
    const i = uni.index.get(S.ids[j]);
    if (i == null) continue;
    there[i] = 1;
    P.th[i] = L.th[j];
    P.rr[i] = Lay.ringR(S.depth[j]);
    P.r[i] = L.r[j];
    P.al[i] = 1;
    P.word[i] = S.word[j];
    P.up[i] = S.parent[j] >= 0 ? (uni.index.get(S.ids[S.parent[j]]) ?? -1) : -1;
  }
  // everything else waits on the node it will grow out of
  for (let i = 0; i < n; i++) {
    if (there[i]) continue;
    const j = S.index.get(anchorId(uni.ids[i], st.dict, id => S.index.has(id))) ?? 0;
    P.th[i] = L.th[j];
    P.rr[i] = Lay.ringR(S.depth[j]);
    P.r[i] = j === 0 ? 0.12 : L.r[j];
  }
  const at = (id: string | null) => (id == null ? -1 : (uni.index.get(id) ?? -1));
  for (let k = 0; k <= st.path.length; k++) {
    const i = at(st.path.slice(0, k));
    if (i >= 0 && st.at != null) P.path[i] = 1;
  }
  if (st.at != null && at(st.at) >= 0) P.glow[at(st.at)] = 1;
  for (const f of st.fresh) if (at(f) >= 0) P.fresh[at(f)] = 1;
  if (st.doomed && at(st.doomed) >= 0) P.doom[at(st.doomed)] = 1;
  for (const w of st.lit) if (at(w) >= 0) P.lit[at(w)] = 1;
  if (st.spell) {
    for (const [id, low] of st.spell.seen) if (at(id) >= 0) P.seen[at(id)] = low <= 1 ? 1 : 0;
    for (const id of st.spell.cut) if (at(id) >= 0) P.cut[at(id)] = 1;
    for (let i = 1; i < n; i++) if (there[i] && !st.spell.seen.has(uni.ids[i])) P.dim[i] = 1;
  }
  // the wedge: every word under a prefix; the rest of the sunburst steps back
  const wj = st.wedge != null ? S.index.get(st.wedge) : undefined;
  if (wj != null) {
    const size = subtreeSizes(S);
    for (let j = 1; j < S.ids.length; j++) {
      const inside = j >= wj && j < wj + size[wj];
      if (!inside && !st.path.startsWith(S.ids[j])) P.dim[at(S.ids[j])] = Math.max(P.dim[at(S.ids[j])], 0.6);
    }
    P.wedge = {
      th0: L.lo[wj],
      th1: L.hi[wj],
      r0: Math.max(Lay.HUB_R + 0.1, Lay.ringR(S.depth[wj]) - 0.5 * Lay.DR),
      a: 1,
    };
  }
  // the slot that was empty: where the missing letter would have gone
  if (st.miss) {
    const qj = S.index.get(st.miss.at);
    if (qj != null) {
      const kids = S.kids[qj],
        ch = st.miss.ch;
      const before = kids.filter(k => S.ch[k] < ch);
      let th: number;
      if (!kids.length) th = L.th[qj];
      else if (!before.length) th = Math.min(Lay.TH1, L.hi[kids[0]] + 0.02);
      else if (before.length === kids.length) th = Math.max(Lay.TH0, L.lo[kids[kids.length - 1]] - 0.02);
      else th = L.lo[before[before.length - 1]];
      P.miss = { node: at(st.miss.at), ch, th, rr: Lay.ringR(S.depth[qj] + 1), a: 1 };
    }
  }
  // words read out at the rim, A to Z from the left
  if (st.lit.length) {
    const many = st.lit.length > Lay.RIM_MAX;
    const shown = many ? st.lit.slice(0, Lay.RIM_MAX - 1) : st.lit;
    const labels: RimLabel[] = shown
      .map(w => ({ key: w, text: w, node: at(w), th: 0, a: 1 }))
      .filter(l => l.node >= 0 && there[l.node]);
    // A to Z along the rim, each as near its word as the order allows
    for (const l of labels) l.th = P.th[l.node];
    for (let k = 1; k < labels.length; k++) labels[k].th = Math.min(labels[k].th, labels[k - 1].th);
    if (many && labels.length)
      labels.push({
        key: '+more',
        text: `+${st.lit.length - labels.length}`,
        node: -1,
        th: labels[labels.length - 1].th - 0.05,
        a: 1,
      });
    spread(labels);
    P.labels = labels;
  }
  return P;
}

/* ---------------- a recording, ready to play ---------------- */

export interface TrieProgram extends Program<Step, Pose> {
  rec: Recording;
  /** One universe per sunburst. */
  unis: Universe[];
  rests: Map<number, Pose>;
}

function restPose(fans: readonly FanState[], unis: readonly Universe[], callout: Callout | null): Pose {
  const F = fans.map((st, k) => restFan(st, unis[k], 0, Lay.fanY(k, fans.length)));
  let co: CalloutPose | null = null;
  if (callout) {
    const k = fans.findIndex(f => f.key === callout.fan);
    const node = k >= 0 ? unis[k].index.get(callout.at) : undefined;
    if (k >= 0 && node != null) co = { fan: k, node, text: callout.text, tone: callout.tone, al: 1 };
  }
  return { fans: F, callout: co, x0: -Lay.HALF_W, x1: Lay.HALF_W };
}

export function makeProgram(rec: Recording): TrieProgram {
  const unis = rec.start.map((st, k) => universeOf([shapeFor(st), ...rec.steps.map(s => shapeFor(s.fans[k]))]));
  return { rec, steps: rec.steps, unis, rests: new Map(), startPose: restPose(rec.start, unis, null) };
}

/** The pose after step i (-1: before the first). */
export function restAt(prog: TrieProgram, i: number): Pose {
  if (i < 0) return prog.startPose;
  let P = prog.rests.get(i);
  if (!P) {
    const st = prog.steps[i];
    P = restPose(st.fans, prog.unis, st.callout);
    prog.rests.set(i, P);
  }
  return P;
}

/* ---------------- blending ---------------- */

/** How far along each part of a blend is, 0 to 1. */
export interface Timing {
  /** Where nodes are, and whether they are there. */
  place: number;
  /** Everything that lights up. */
  light: number;
  /** Word marks coming and going. */
  word: number;
  wedge: number;
  labels: number;
  miss: number;
  callout: number;
}
export const even = (t: number): Timing => ({
  place: t,
  light: t,
  word: t,
  wedge: t,
  labels: t,
  miss: t,
  callout: t,
});

function mixArr(a: Float32Array, b: Float32Array, t: number): Float32Array {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

function mixWedge(a: Wedge | null, b: Wedge | null, t: number): Wedge | null {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a && b)
    return { th0: lerp(a.th0, b.th0, t), th1: lerp(a.th1, b.th1, t), r0: lerp(a.r0, b.r0, t), a: lerp(a.a, b.a, t) };
  if (a) return { ...a, a: a.a * (1 - t) };
  if (b) return { ...b, a: b.a * t };
  return null;
}

function mixGhost(a: Ghost | null, b: Ghost | null, t: number): Ghost | null {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a && b && a.ch === b.ch && a.node === b.node)
    return { ...b, th: lerp(a.th, b.th, t), rr: lerp(a.rr, b.rr, t), a: lerp(a.a, b.a, t) };
  // one goes out, the other comes in
  if (a && (!b || t < 0.5)) return { ...a, a: a.a * (1 - (b ? 2 * t : t)) };
  if (b) return { ...b, a: b.a * (a ? 2 * t - 1 : t) };
  return null;
}

function mixLabels(a: RimLabel[], b: RimLabel[], t: number): RimLabel[] {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out: RimLabel[] = [];
  for (const B of b) {
    const A = a.find(l => l.key === B.key);
    out.push(A ? { ...B, th: lerp(A.th, B.th, t), a: lerp(A.a, B.a, t) } : { ...B, a: B.a * t });
  }
  for (const A of a) if (!b.some(l => l.key === A.key)) out.push({ ...A, a: A.a * (1 - t) });
  return out;
}

/** Blend two poses of the same sunburst (same universe). */
export function mixFan(A: FanPose, B: FanPose, T: Timing): FanPose {
  const P = { ...B } as FanPose;
  for (const c of CHANNELS) P[c] = mixArr(A[c], B[c], PLACE.has(c) ? T.place : c === 'word' ? T.word : T.light);
  if (T.place < 1) {
    const up = new Int32Array(A.up.length);
    for (let i = 0; i < up.length; i++) up[i] = A.al[i] > 0 ? A.up[i] : B.up[i];
    P.up = up;
  }
  P.cx = lerp(A.cx, B.cx, T.place);
  P.cy = lerp(A.cy, B.cy, T.place);
  P.a = lerp(A.a, B.a, T.place);
  P.wedge = mixWedge(A.wedge, B.wedge, T.wedge);
  P.miss = mixGhost(A.miss, B.miss, T.miss);
  P.labels = mixLabels(A.labels, B.labels, T.labels);
  P.dict = T.place < 0.5 ? A.dict : B.dict;
  return P;
}

function mixCallout(a: CalloutPose | null, b: CalloutPose | null, t: number): CalloutPose | null {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a && b && a.text === b.text && a.node === b.node && a.fan === b.fan) return { ...b, al: lerp(a.al, b.al, t) };
  if (t < 0.5) return a ? { ...a, al: a.al * (1 - 2 * t) } : null;
  return b ? { ...b, al: b.al * (2 * t - 1) } : null;
}

/** Blend two poses of the same program. */
export function mixPose(A: Pose, B: Pose, T: Timing): Pose {
  return {
    fans: B.fans.map((b, k) => (A.fans[k] ? mixFan(A.fans[k], b, T) : b)),
    callout: mixCallout(A.callout, B.callout, T.callout),
    x0: lerp(A.x0, B.x0, T.place),
    x1: lerp(A.x1, B.x1, T.place),
  };
}

/* ---------------- between recordings ---------------- */

const UNIONS = new WeakMap<Universe, WeakMap<Universe, Universe>>();
function unionOf(a: Universe, b: Universe): Universe {
  let m = UNIONS.get(a);
  if (!m) UNIONS.set(a, (m = new WeakMap()));
  let u = m.get(b);
  if (!u) {
    const ids = [...a.ids],
      ch = [...a.ch],
      depth = [...a.depth];
    const index = new Map(a.index);
    b.ids.forEach((id, j) => {
      if (index.has(id)) return;
      index.set(id, ids.length);
      ids.push(id);
      ch.push(b.ch[j]);
      depth.push(b.depth[j]);
    });
    u = { ids, index, ch, depth: Uint8Array.from(depth) };
    m.set(b, u);
  }
  return u;
}

/** The same pose, over a bigger universe: nodes it does not show wait on the node that stands for them. */
function project(F: FanPose, U: Universe): FanPose {
  const P = { ...F, uni: U, up: new Int32Array(U.ids.length).fill(-1) } as FanPose;
  for (const c of CHANNELS) P[c] = new Float32Array(U.ids.length);
  const has = (id: string) => {
    const j = F.uni.index.get(id);
    return j != null && F.al[j] > 0.5;
  };
  U.ids.forEach((id, i) => {
    const j = F.uni.index.get(id);
    if (j != null) {
      for (const c of CHANNELS) P[c][i] = F[c][j];
      P.up[i] = F.up[j] >= 0 ? (U.index.get(F.uni.ids[F.up[j]]) ?? -1) : -1;
      return;
    }
    const k = F.uni.index.get(anchorId(id, F.dict, has)) ?? 0;
    P.th[i] = F.th[k];
    P.rr[i] = F.rr[k];
    P.r[i] = k === 0 ? 0.12 : F.r[k];
  });
  P.labels = F.labels.map(l => ({ ...l, node: l.node >= 0 ? (U.index.get(F.uni.ids[l.node]) ?? -1) : -1 }));
  if (F.miss) P.miss = { ...F.miss, node: U.index.get(F.uni.ids[F.miss.node]) ?? -1 };
  return P;
}

/** A sunburst coming in from nothing, or going out to nothing, at its centre. */
function vanished(F: FanPose): FanPose {
  const P = { ...F, a: 0, wedge: null, miss: null, labels: [], sparks: [], pulses: [], ripple: null } as FanPose;
  for (const c of CHANNELS) P[c] = new Float32Array(F.uni.ids.length);
  P.th.fill(Math.PI / 2);
  return P;
}

/** Pairs of poses for the same sunbursts, over shared universes, ready to blend. */
export function bridge(A: Pose, B: Pose): { a: FanPose; b: FanPose }[] {
  const out: { a: FanPose; b: FanPose }[] = [];
  for (const b of B.fans) {
    const a = A.fans.find(f => f.key === b.key);
    if (!a) out.push({ a: vanished(b), b });
    else if (a.uni === b.uni) out.push({ a, b });
    else {
      const U = unionOf(a.uni, b.uni);
      out.push({ a: project(a, U), b: project(b, U) });
    }
  }
  for (const a of A.fans) if (!B.fans.some(f => f.key === a.key)) out.push({ a, b: vanished(a) });
  return out;
}
