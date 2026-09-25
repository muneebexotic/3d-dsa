// Poses: a plain description of everything on the wall at one instant. Every step
// is a function pose(t), t in [0, 1], so stepping back simply plays the same
// motion in reverse. No drawing here, so it is unit-tested.

import { Color } from 'three';
import type { CalloutSpec } from '../../core/controls';
import { clamp01, easeInOut, easeOut, lerp, plural, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import { fmtBf, type AvlStep, type AvlStepKind, type Rotation, type Side, type Snap, type Visitor } from './engine';
import {
  BEAD,
  R,
  ROW,
  STEM,
  VR,
  bead,
  hookPoint,
  layoutSnap,
  linkKey,
  linksOf,
  subtreeIds,
  type Point3,
  type Slot2,
} from './layout';

export type DiscState = 'ink' | 'yellow' | 'red' | 'cobalt';

const HEX: Readonly<Record<DiscState, number>> = { ink: 0x1b1a17, yellow: 0xe8a817, red: 0xd1361e, cobalt: 0x2346a8 };
const NUMHEX: Readonly<Record<DiscState, number>> = {
  ink: 0xefe8da,
  yellow: 0x1b1a17,
  red: 0xfff6ea,
  cobalt: 0xffffff,
};
/** Disc and numeral colours per state, in the renderer's working (linear) colour space. */
export const FILL = {} as Record<DiscState, Color>;
export const NUMC = {} as Record<DiscState, Color>;
for (const k of Object.keys(HEX) as DiscState[]) {
  FILL[k] = new Color(HEX[k]);
  NUMC[k] = new Color(NUMHEX[k]);
}
/** Level (ink), leaning (yellow) or out of balance (red). */
export const stateOf = (bf: number): DiscState => (Math.abs(bf) >= 2 ? 'red' : Math.abs(bf) === 1 ? 'yellow' : 'ink');

/** Gentle anticipation and overshoot: the swing has weight. */
export const easeBack = (t: number): number => {
  const c1 = 0.9,
    c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
};

export interface PoseNode {
  id: number;
  v: number;
  x: number;
  y: number;
  z: number;
  /** Opacity. */
  a: number;
  s: number;
  bf: number;
  /** Cobalt focus ring. */
  ringC: number;
  stA: DiscState;
  stB: DiscState;
  m: number;
  fr: number;
  fg: number;
  fb: number;
  nr: number;
  ng: number;
  nb: number;
}
export interface PoseLink {
  p: number | null;
  c: number;
  side: Side | 'c';
  /** How far the arm and wire have grown, 0..1. */
  ext: number;
  /** How cobalt (on the path) it is. */
  cob: number;
}
export interface VisitorPose {
  x: number;
  y: number;
  z: number;
  a: number;
  v: number;
  s: number;
}
/** The empty place a rotating pair swings through. */
export interface Slot {
  p: number | null;
  side: Side | null;
  x: number;
  y: number;
  z: number;
  cob: number;
}
/** The two nodes locked together while they swing. */
export interface Lever {
  a: number;
  b: number;
  ext: number;
}
/** A clip holding a subtree while it changes parent. */
export interface Clip {
  x: number;
  y: number;
  z: number;
  c: number;
  a: number;
  follow?: boolean;
}
/** The rotation arrows. */
export interface Arc {
  x: number;
  y: number;
  r: number;
  ang: number;
  dir: 1 | -1;
  a: number;
}
export interface HookRequest {
  p: number;
  side: Side;
  a: number;
}
export interface AvlPose {
  nodes: Map<number, PoseNode>;
  links: PoseLink[];
  visitor: VisitorPose | null;
  lever: Lever | null;
  clips: Clip[];
  slot: Slot | null;
  arc: Arc | null;
  callout: CalloutSpec | null;
  hooks: HookRequest[];
}

export interface AvlProgram {
  title: string;
  steps: AvlStep[];
  startSnap: Snap;
  startPose: AvlPose;
  intro?: { head: string; body: string };
  demo?: boolean;
}

function setState(n: PoseNode, stA: DiscState, stB: DiscState, m: number): void {
  n.stA = stA;
  n.stB = stB;
  n.m = m;
  const a = FILL[stA],
    b = FILL[stB],
    na = NUMC[stA],
    nb = NUMC[stB];
  n.fr = lerp(a.r, b.r, m);
  n.fg = lerp(a.g, b.g, m);
  n.fb = lerp(a.b, b.b, m);
  n.nr = lerp(na.r, nb.r, m);
  n.ng = lerp(na.g, nb.g, m);
  n.nb = lerp(na.b, nb.b, m);
}
function mkNode(id: number, v: number, x: number, y: number, bf: number): PoseNode {
  const st = stateOf(bf);
  const n: PoseNode = {
    id,
    v,
    x,
    y,
    z: 0,
    a: 1,
    s: 1,
    bf,
    ringC: 0,
    stA: st,
    stB: st,
    m: 0,
    fr: 0,
    fg: 0,
    fb: 0,
    nr: 0,
    ng: 0,
    nb: 0,
  };
  setState(n, st, st, 0);
  return n;
}
export function emptyPose(): AvlPose {
  return {
    nodes: new Map(),
    links: [],
    visitor: null,
    lever: null,
    clips: [],
    slot: null,
    arc: null,
    callout: null,
    hooks: [],
  };
}
export function staticPose(snap: Snap): AvlPose {
  const P = emptyPose(),
    pos = layoutSnap(snap);
  for (const [id, p] of pos) P.nodes.set(id, mkNode(id, snap.n[id].v, p.x, p.y, snap.n[id].bf));
  for (const L of linksOf(snap).values()) P.links.push({ ...L, ext: 1, cob: 0 });
  return P;
}

/** The point a fraction u of the way along a polyline. */
function pathPoint(pts: Point3[], u: number): Point3 {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    lens.push(d);
    total += d;
  }
  let d = u * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? clamp01(d / lens[i]) : 1;
      const a = pts[i],
        b = pts[i + 1];
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
    }
    d -= lens[i];
  }
  return { ...pts[pts.length - 1] };
}
/** The value in hand follows the real wires: past the disc, along the arm, down the next wire. */
function descendPts(pp: Slot2, to: Point3): Point3[] {
  const py = pp.y - R - STEM;
  return [
    bead(pp),
    { x: pp.x, y: pp.y + 0.05, z: 0.55 },
    { x: pp.x, y: py, z: 0.3 },
    { x: to.x, y: py, z: 0.25 },
    { x: to.x, y: to.y, z: 0 },
  ];
}
const visAtRest = (st: AvlStep | null): Visitor | null =>
  st && st.visitor && !st.visitor.merge && !st.visitor.fall && !st.visitor.shake ? st.visitor : null;
function resolveVisitor(vis: Visitor | null | undefined, pos: Map<number, Slot2>, snap: Snap): Point3 | null {
  if (!vis) return null;
  if (vis.merge != null) {
    const p = pos.get(vis.merge);
    return p ? { x: p.x, y: p.y, z: 0 } : null;
  }
  if (vis.at != null) {
    const p = pos.get(vis.at);
    return p ? bead(p) : null;
  }
  if (vis.hook) {
    const p = pos.get(vis.hook.p);
    return p ? hookPoint(p, vis.hook.side) : null;
  }
  if (vis.top) {
    const r = snap.root != null ? pos.get(snap.root) : null;
    return r ? bead(r) : { x: 0, y: BEAD - 0.4, z: 0 };
  }
  return null;
}

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Record<AvlStepKind, number>> = {
  start: 0.95,
  compare: 0.7,
  descend: 0.85,
  place: 1.1,
  update: 0.8,
  imbalance: 1.15,
  rotate: 2.9,
  found: 1.0,
  missing: 1.25,
  duplicate: 1.1,
  remove: 1.35,
  replace: 1.7,
  succ: 0.8,
  done: 0.9,
  clear: 1.5,
};
/** When the disc colours switch, per kind. */
const TSW: Readonly<Partial<Record<AvlStepKind, number>>> = {
  update: 0.3,
  rotate: 0.84,
  place: 0.6,
  replace: 0.7,
  remove: 0.6,
};
/** When nodes move, per kind. */
const MV: Readonly<Partial<Record<AvlStepKind, [number, number]>>> = {
  place: [0.08, 0.85],
  update: [0.15, 0.75],
  remove: [0.2, 0.78],
  replace: [0.2, 0.78],
};

/** A rotation: the link between two nodes turns about its middle like a see-saw. */
function prepRotation(r: Rotation, B: Snap, posA: Map<number, Slot2>, posB: Map<number, Slot2>) {
  const at = (m: Map<number, Slot2>, id: number) => m.get(id) as Slot2;
  const ZA = at(posA, r.z),
    YA = at(posA, r.y),
    ZB = at(posB, r.z),
    YB = at(posB, r.y);
  const MA = { x: (ZA.x + YA.x) / 2, y: (ZA.y + YA.y) / 2 },
    MB = { x: (ZB.x + YB.x) / 2, y: (ZB.y + YB.y) / 2 };
  const vA = { x: YA.x - MA.x, y: YA.y - MA.y },
    vB = { x: YB.x - MB.x, y: YB.y - MB.y };
  const angA = Math.atan2(vA.y, vA.x),
    angB = Math.atan2(vB.y, vB.x);
  let d = angB - angA;
  if (r.dir === 'left') {
    while (d <= 0) d += 2 * Math.PI;
    while (d > 2 * Math.PI) d -= 2 * Math.PI;
  } else {
    while (d >= 0) d -= 2 * Math.PI;
    while (d < -2 * Math.PI) d += 2 * Math.PI;
  }
  const lA = Math.hypot(vA.x, vA.y),
    lB = Math.hypot(vB.x, vB.y);
  const Yb = B.n[r.y],
    Zb = B.n[r.z];
  const yF = subtreeIds(B, r.dir === 'right' ? Yb.l : Yb.r);
  const zF = subtreeIds(B, r.dir === 'right' ? Zb.r : Zb.l);
  const pair = (u: number) => {
    const ang = angA + d * u,
      L = lerp(lA, lB, u),
      M = { x: lerp(MA.x, MB.x, u), y: lerp(MA.y, MB.y, u) };
    const c = Math.cos(ang) * L,
      s = Math.sin(ang) * L;
    return { Y: { x: M.x + c, y: M.y + s }, Z: { x: M.x - c, y: M.y - s }, M, ang, L };
  };
  const U = (t: number) => easeBack(seg(t, 0.2, 0.8));
  const P0 = r.p ?? '^';
  const kPZ = `${P0}>${r.z}`,
    kPY = `${P0}>${r.y}`,
    kZY = `${r.z}>${r.y}`,
    kYZ = `${r.y}>${r.z}`;
  const kYT = r.t2 != null ? `${r.y}>${r.t2}` : null,
    kZT = r.t2 != null ? `${r.z}>${r.t2}` : null;
  const T2A = r.t2 != null ? posA.get(r.t2) : undefined;
  const clipPt = T2A ? { x: T2A.x, y: YA.y - R - STEM, z: 0 } : null;
  const lin = (id: number, u: number) => {
    const a = at(posA, id),
      b = at(posB, id);
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
  };
  return {
    place(n: PoseNode, t: number) {
      const u = U(t),
        pp = pair(u);
      if (n.id === r.y) {
        n.x = pp.Y.x;
        n.y = pp.Y.y;
      } else if (n.id === r.z) {
        n.x = pp.Z.x;
        n.y = pp.Z.y;
      } else if (yF.has(n.id)) {
        const b = lin(n.id, u),
          yl = lin(r.y, u);
        n.x = b.x + pp.Y.x - yl.x;
        n.y = b.y + pp.Y.y - yl.y;
      } else if (zF.has(n.id)) {
        const b = lin(n.id, u),
          zl = lin(r.z, u);
        n.x = b.x + pp.Z.x - zl.x;
        n.y = b.y + pp.Z.y - zl.y;
      } else {
        const b = lin(n.id, easeInOut(seg(t, 0.2, 0.8)));
        n.x = b.x;
        n.y = b.y;
      }
      if (n.id === r.y || n.id === r.z) n.ringC = smooth(0, 0.12, t) * (1 - smooth(0.9, 1, t));
    },
    skip(k: string) {
      return k === kPZ || k === kPY;
    },
    linkExt(k: string, t: number): number | null {
      if (k === kZY) return 1 - smooth(0.02, 0.18, t);
      if (k === kYZ) return smooth(0.82, 0.98, t);
      if (k === kYT) return 1 - smooth(0.06, 0.2, t);
      if (k === kZT) return smooth(0.8, 0.96, t);
      return null;
    },
    extras(P: AvlPose, t: number, cobSlot: number, arcFrom: number) {
      const Zn = P.nodes.get(r.z),
        Yn = P.nodes.get(r.y);
      if (!Zn || !Yn) return;
      const lev = Math.min(smooth(0.03, 0.2, t), 1 - smooth(0.8, 0.97, t));
      if (lev > 0.001) P.lever = { a: r.z, b: r.y, ext: lev };
      const q = easeInOut(seg(t, 0.2, 0.8));
      P.slot = {
        p: r.p,
        side: r.side,
        x: lerp(Zn.x, Yn.x, q),
        y: lerp(Zn.y, Yn.y, q) + (R + 0.1) * (1 - 4 * q * (1 - q)),
        z: 0,
        cob: cobSlot,
      };
      if (clipPt) {
        const a = smooth(0.05, 0.15, t) * (1 - smooth(0.9, 1, t));
        if (a > 0.001 && r.t2 != null) P.clips.push({ ...clipPt, c: r.t2, a });
      }
      const aa = lerp(arcFrom, 1, smooth(0.04, 0.2, t)) * (1 - smooth(0.7, 0.84, t));
      const pp = pair(U(t));
      if (aa > 0.001)
        P.arc = { x: pp.M.x, y: pp.M.y, r: pp.L + 0.62, ang: pp.ang, dir: r.dir === 'left' ? 1 : -1, a: aa };
      P.callout = {
        text: `rotate ${r.dir}`,
        x: pp.M.x,
        y: pp.M.y,
        side: r.dir === 'left' ? 'r' : 'l',
        off: pp.L + 0.9,
        tone: 'cobalt',
        a: smooth(0.08, 0.22, t) * (1 - smooth(0.78, 0.92, t)),
      };
    },
  };
}

/** The player's build hook: the motion of step i. */
export function buildTransition(prog: AvlProgram, i: number): Transition<AvlPose> {
  const st = prog.steps[i],
    prev = i > 0 ? prog.steps[i - 1] : null;
  const A = prev ? prev.snap : prog.startSnap,
    B = st.snap;
  const posA = layoutSnap(A),
    posB = layoutSnap(B);
  const LA = linksOf(A),
    LB = linksOf(B);
  const kind = st.kind;
  const pathA = prev ? prev.path : [],
    pathB = st.path;
  const focA = prev ? prev.focus : null,
    focB = st.focus;
  const vA = visAtRest(prev),
    vPA = vA ? resolveVisitor(vA, posA, A) : null;
  const vB = st.visitor,
    vPB = vB ? resolveVisitor(vB, posB, B) : null;
  const vVal = vB ? vB.v : vA ? vA.v : null;
  const ids = new Set([...posA.keys(), ...posB.keys()]);
  const keys = new Set([...LA.keys(), ...LB.keys()]);
  const rot = kind === 'rotate' && st.rot ? prepRotation(st.rot, B, posA, posB) : null;
  const tSw = TSW[kind] ?? 0.5;
  const mv = MV[kind] || [0, 1];
  let dpts: Point3[] | null = null;
  const fromPos = st.from != null ? posA.get(st.from) : undefined;
  if (kind === 'descend' && vPA && vPB && fromPos) dpts = descendPts(fromPos, vPB);
  if (kind === 'missing' && fromPos && vPA && st.visitor?.hook)
    dpts = descendPts(fromPos, hookPoint(fromPos, st.visitor.hook.side));
  const arcFrom = prev && prev.kind === 'imbalance' ? 0.45 : 0;
  const slotCob =
    rot && st.rot && (pathA.includes(st.rot.z) || pathA.includes(st.rot.y) || pathB.includes(st.rot.y)) ? 1 : 0;
  const lifting = kind === 'remove' || kind === 'replace';
  // nodes that change parent while something is lifted out are held by clips until their new arm arrives
  const rehung: number[] = [];
  if (lifting) {
    const inA = new Map<number, string>(),
      inB = new Map<number, string>();
    for (const [k, L] of LA) inA.set(L.c, k);
    for (const [k, L] of LB) inB.set(L.c, k);
    for (const id of posB.keys()) if (inA.has(id) && inA.get(id) !== inB.get(id)) rehung.push(id);
  }

  function pose(t: number): AvlPose {
    const P = emptyPose();
    const em = easeInOut(seg(t, mv[0], mv[1]));
    for (const id of ids) {
      const a = posA.get(id),
        b = posB.get(id);
      let n: PoseNode;
      if (a && b) {
        const oA = A.n[id],
          oB = B.n[id];
        n = mkNode(id, oB.v, lerp(a.x, b.x, em), lerp(a.y, b.y, em), t < tSw ? oA.bf : oB.bf);
        setState(n, stateOf(oA.bf), stateOf(oB.bf), smooth(tSw - 0.08, tSw + 0.12, t));
        if (rot) rot.place(n, t);
      } else if (b) {
        const oB = B.n[id];
        n = mkNode(id, oB.v, b.x, b.y, oB.bf);
        if (kind === 'place' && id === st.placed && vPA) {
          n.x = lerp(vPA.x, b.x, em);
          n.y = lerp(vPA.y, b.y, em);
          setState(n, 'cobalt', stateOf(oB.bf), smooth(0.5, 0.95, t));
          n.s = lerp(VR / R, 1, easeInOut(seg(t, 0, 0.6)));
        } else {
          n.y = b.y + 1.5 * (1 - em);
          n.a = smooth(0, 0.6, t);
        }
      } else if (a) {
        const oA = A.n[id];
        n = mkNode(id, oA.v, a.x, a.y, oA.bf);
        if (kind === 'clear') {
          // the whole mobile is taken down, lower levels trailing
          const e = seg(t, 0.04 * a.d, 0.55 + 0.04 * a.d);
          n.y += 16 * e * e * e;
          n.a = 1 - smooth(0.6, 0.95, t);
        } else {
          const e = easeInOut(seg(t, lifting ? 0.02 : 0.05, lifting ? 0.55 : 0.7));
          n.y += 1.5 * e;
          n.z += 0.5 * e;
          n.a = 1 - smooth(0.35, 1, e);
          n.s = 1 - 0.3 * e;
        }
      } else continue;
      const fA = focA === id,
        fB = focB === id;
      n.ringC = Math.max(n.ringC, fA && fB ? 1 : fB ? smooth(0, 0.3, t) : fA ? 1 - smooth(0, 0.3, t) : 0);
      P.nodes.set(id, n);
    }
    for (const k of keys) {
      if (rot && rot.skip(k)) continue;
      const la = LA.get(k),
        lb = LB.get(k),
        L = lb || la;
      if (!L) continue;
      let ext: number;
      if (la && lb) ext = 1;
      else if (lb) ext = lifting ? smooth(0.74, 0.98, t) : smooth(0.5, 0.95, t);
      else if (kind === 'clear') ext = 1;
      else ext = lifting ? 1 - smooth(0, 0.2, t) : 1 - smooth(0.05, 0.45, t);
      if (rot) {
        const e2 = rot.linkExt(k, t);
        if (e2 != null) ext = e2;
      }
      if (kind === 'place' && lb && L.c === st.placed) ext = 1;
      if (ext <= 0.001) continue;
      const inA = pathA.includes(L.c),
        inB = pathB.includes(L.c);
      const cob = inA && inB ? 1 : inB ? smooth(0.15, 0.85, t) : inA ? 1 - smooth(0.05, 0.6, t) : 0;
      P.links.push({ p: L.p, c: L.c, side: L.side, ext, cob });
    }

    // the value in hand
    if (vVal != null) {
      if (kind === 'start' && vPB) {
        P.visitor = {
          x: vPB.x,
          y: vPB.y + 5 * (1 - easeOut(seg(t, 0, 0.85))),
          z: 0,
          a: smooth(0, 0.35, t),
          v: vVal,
          s: 1,
        };
      } else if (kind === 'descend' && dpts) {
        P.visitor = { ...pathPoint(dpts, easeInOut(t)), a: 1, v: vVal, s: 1 };
        if (st.visitor?.hook) P.hooks.push({ p: st.visitor.hook.p, side: st.visitor.hook.side, a: smooth(0, 0.3, t) });
      } else if (kind === 'missing') {
        let p: Point3;
        if (dpts) {
          p = pathPoint(dpts, easeInOut(seg(t, 0, 0.45)));
          if (st.visitor?.hook)
            P.hooks.push({ p: st.visitor.hook.p, side: st.visitor.hook.side, a: 1 - smooth(0.85, 1, t) });
        } else p = { ...((vPA || vPB) as Point3) };
        const f = seg(t, 0.5, 1);
        p.y -= 2.4 * f * f;
        P.visitor = { ...p, a: 1 - smooth(0.55, 0.95, t), v: vVal, s: 1 };
        P.callout = {
          text: 'not here',
          x: p.x,
          y: p.y,
          side: 'r',
          off: 0.6,
          tone: 'ink',
          a: smooth(0.4, 0.55, t) * (1 - smooth(0.8, 1, t)),
        };
      } else if (kind === 'found' && vPA && vPB) {
        const e = easeInOut(seg(t, 0, 0.7));
        P.visitor = {
          x: lerp(vPA.x, vPB.x, e),
          y: lerp(vPA.y, vPB.y, e),
          z: 0.15 * e,
          a: 1 - smooth(0.45, 0.85, t),
          v: vVal,
          s: 1 - 0.3 * e,
        };
      } else if (kind === 'duplicate' && vPA) {
        const k = 1 - smooth(0.6, 1, t);
        P.visitor = { x: vPA.x + 0.14 * Math.sin(t * Math.PI * 7) * (1 - t), y: vPA.y, z: 0, a: k, v: vVal, s: 1 };
        P.callout = {
          text: 'already here',
          x: vPA.x,
          y: vPA.y,
          side: 'r',
          off: 0.62,
          tone: 'ink',
          a: smooth(0.1, 0.3, t) * k,
        };
      } else if (kind === 'place') {
        // the value in hand becomes the new disc
      } else if (vPA && vPB) {
        const e = easeInOut(t);
        P.visitor = { x: lerp(vPA.x, vPB.x, e), y: lerp(vPA.y, vPB.y, e), z: 0, a: 1, v: vVal, s: 1 };
      } else if (vPA) {
        P.visitor = { ...vPA, a: 1 - smooth(0, 0.4, t), v: vVal, s: 1 };
      } else if (vPB) {
        P.visitor = { ...vPB, a: smooth(0, 0.4, t), v: vVal, s: 1 };
      }
    }

    // step-specific details
    if (kind === 'compare' && vPB && st.cmp) {
      const c = st.cmp;
      const txt = c.side === 'l' ? `← ${c.a} < ${c.b}` : `${c.a} > ${c.b} →`;
      P.callout = {
        text: txt,
        x: vPB.x,
        y: vPB.y,
        side: c.side === 'l' ? 'l' : 'r',
        off: VR + 0.2,
        tone: 'ink',
        a: smooth(0.05, 0.3, t),
      };
    } else if (kind === 'update' && st.co) {
      const n = st.focus != null ? P.nodes.get(st.focus) : undefined;
      if (n) {
        n.s *= 1 + 0.07 * Math.sin(Math.PI * seg(t, 0, 0.5));
        P.callout = {
          text: `height ${st.co.h} · balance ${fmtBf(st.co.bf)}`,
          x: n.x,
          y: n.y,
          side: 'r',
          off: R + 0.55,
          tone: Math.abs(st.co.bf) >= 2 ? 'red' : 'ink',
          a: smooth(0.2, 0.4, t),
        };
      }
    } else if (kind === 'imbalance' && st.kase) {
      const z = st.focus != null ? P.nodes.get(st.focus) : undefined,
        c = st.child != null ? P.nodes.get(st.child) : undefined;
      if (c) c.ringC = Math.max(c.ringC, smooth(0.1, 0.35, t));
      let pa = st.focus,
        pb = st.child;
      let dir: 1 | -1 = st.kase === 'LL' ? -1 : 1;
      if (st.grand != null) {
        const g = P.nodes.get(st.grand);
        if (g) g.ringC = Math.max(g.ringC, smooth(0.25, 0.5, t));
        pa = st.child;
        pb = st.grand;
        dir = st.kase === 'LR' ? 1 : -1;
      }
      const A1 = pa != null ? P.nodes.get(pa) : undefined,
        B1 = pb != null ? P.nodes.get(pb) : undefined;
      if (A1 && B1) {
        const M = { x: (A1.x + B1.x) / 2, y: (A1.y + B1.y) / 2 };
        const vx = B1.x - M.x,
          vy = B1.y - M.y;
        P.arc = {
          x: M.x,
          y: M.y,
          r: Math.hypot(vx, vy) + 0.62,
          ang: Math.atan2(vy, vx),
          dir,
          a: 0.45 * smooth(0.3, 0.65, t),
        };
      }
      if (z)
        P.callout = {
          text: `${st.kase} case`,
          x: z.x,
          y: z.y,
          side: st.kase[0] === 'L' ? 'r' : 'l',
          off: R + 0.55,
          tone: 'red',
          a: smooth(0.1, 0.3, t),
        };
    } else if (kind === 'rotate' && rot) {
      rot.extras(P, t, slotCob, arcFrom);
    } else if (kind === 'found') {
      const n = st.focus != null ? P.nodes.get(st.focus) : undefined;
      if (n) {
        n.s *= 1 + 0.1 * Math.sin(Math.PI * seg(t, 0.45, 0.9));
        P.callout = st.cmpN
          ? {
              text: `found in ${plural(st.cmpN, 'step')}`,
              x: n.x,
              y: n.y,
              side: 'r',
              off: R + 0.55,
              tone: 'cobalt',
              a: smooth(0.5, 0.7, t),
            }
          : null;
      }
    } else if (kind === 'place') {
      const n = st.placed != null ? P.nodes.get(st.placed) : undefined;
      if (n)
        P.callout = {
          text: 'new leaf · height 1',
          x: n.x,
          y: n.y,
          side: 'r',
          off: R + 0.5,
          tone: 'ink',
          a: smooth(0.65, 0.85, t),
        };
    } else if (kind === 'replace') {
      const n = st.succ != null ? P.nodes.get(st.succ) : undefined;
      if (n) {
        n.z += 0.9 * Math.sin(Math.PI * seg(t, 0.2, 0.78));
        n.ringC = 1;
      }
    }
    if (lifting) {
      const a = smooth(0, 0.12, t) * (1 - smooth(0.9, 1, t));
      if (a > 0.001)
        for (const id of rehung) {
          const n = P.nodes.get(id);
          if (n) P.clips.push({ x: n.x, y: n.y + (R + 0.1) * n.s + 0.5, z: n.z, c: id, a, follow: true });
        }
    } else if (kind === 'succ') {
      const n = st.focus != null ? P.nodes.get(st.focus) : undefined;
      if (n && st.focus != null && B.n[st.focus].l == null)
        P.callout = {
          text: 'successor',
          x: n.x,
          y: n.y,
          side: 'l',
          off: R + 0.5,
          tone: 'cobalt',
          a: smooth(0.4, 0.7, t),
        };
    }
    return P;
  }
  return { dur: DUR[kind] || 1, pose };
}

/** A plain morph between any two poses: used to jump along the timeline, rewind, or catch up. */
export function morph(P0: AvlPose, P1: AvlPose, dur = 0.55): Transition<AvlPose> {
  const ids = new Set([...P0.nodes.keys(), ...P1.nodes.keys()]);
  const k0 = new Map(P0.links.map(l => [linkKey(l), l])),
    k1 = new Map(P1.links.map(l => [linkKey(l), l]));
  const keys = new Set([...k0.keys(), ...k1.keys()]);
  return {
    dur,
    pose(t) {
      const e = easeInOut(t),
        P = emptyPose();
      for (const id of ids) {
        const a = P0.nodes.get(id),
          b = P1.nodes.get(id);
        let n: PoseNode;
        if (a && b) {
          n = {
            ...b,
            x: lerp(a.x, b.x, e),
            y: lerp(a.y, b.y, e),
            z: lerp(a.z, b.z, e),
            a: lerp(a.a, b.a, e),
            s: lerp(a.s, b.s, e),
            bf: t < 0.5 ? a.bf : b.bf,
            ringC: lerp(a.ringC, b.ringC, e),
          };
          for (const c of ['fr', 'fg', 'fb', 'nr', 'ng', 'nb'] as const) n[c] = lerp(a[c], b[c], e);
        } else if (b) n = { ...b, a: b.a * e, y: b.y + 1.2 * (1 - e) };
        else if (a) n = { ...a, a: a.a * (1 - e), y: a.y + 1.2 * e };
        else continue;
        P.nodes.set(id, n);
      }
      for (const k of keys) {
        const a = k0.get(k),
          b = k1.get(k);
        if (a && b) P.links.push({ ...b, ext: lerp(a.ext, b.ext, e), cob: lerp(a.cob, b.cob, e) });
        else if (b) P.links.push({ ...b, ext: b.ext * smooth(0.4, 1, t) });
        else if (a) P.links.push({ ...a, ext: a.ext * (1 - smooth(0, 0.6, t)) });
      }
      const va = P0.visitor,
        vb = P1.visitor;
      if (va && vb)
        P.visitor = {
          ...vb,
          x: lerp(va.x, vb.x, e),
          y: lerp(va.y, vb.y, e),
          z: lerp(va.z, vb.z, e),
          a: lerp(va.a, vb.a, e),
        };
      else if (va) P.visitor = { ...va, a: va.a * (1 - e) };
      else if (vb) P.visitor = { ...vb, a: vb.a * e };
      if (P1.slot && t > 0.5) P.slot = P1.slot;
      else if (P0.slot && t <= 0.5) P.slot = P0.slot;
      if (P0.lever) P.lever = { ...P0.lever, ext: P0.lever.ext * (1 - e) };
      for (const c of P0.clips) P.clips.push({ ...c, a: c.a * (1 - e) });
      if (P0.arc) P.arc = { ...P0.arc, a: P0.arc.a * (1 - e) };
      return P;
    },
  };
}

/** Opening: the mobile is lowered from the ceiling, top levels first. */
export function lowering(P1: AvlPose): Transition<AvlPose> {
  return {
    dur: 2.2,
    pose(t) {
      const P = emptyPose();
      for (const [id, b] of P1.nodes) {
        const depth = Math.round(-b.y / ROW);
        const e = easeBack(seg(t, 0.06 * depth, 0.06 * depth + 0.72));
        P.nodes.set(id, { ...b, y: b.y + 9 * (1 - e), a: smooth(0, 0.15, t) });
      }
      P.links = P1.links.map(l => ({ ...l }));
      return P;
    },
  };
}
