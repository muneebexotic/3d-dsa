// Motion. Each recorded step becomes a transition pose(t), t in [0, 1], that
// starts exactly where the previous step came to rest. Stepping back plays the
// same function in reverse. Every move happens twice at once: along the wire in
// the tree, and as a hop between cells in the array. No Three.js here, so it is
// unit-tested.

import { mix3 } from '../../core/color';
import { easeInOut, easeOut, fadeInOut, lerp, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import type { StepKind } from './diagram';
import { rowOf } from './heap';
import * as Lay from './layout';
import { COL, PAINT } from './palette';
import { mixP, mixPose, restAt, type HeapProgram, type ItemPose, type P3, type Pose, type SlotPose } from './poses';

/** Seconds per step kind at 1× speed. Batched steps add time for every row they climb or sink. */
const DUR: Readonly<Record<StepKind, number>> = {
  arcs: 2.4,
  fold: 2.8,
  append: 1.15,
  up: 0.85,
  down: 0.9,
  swap: 0.95,
  stay: 0.85,
  take: 1.5,
  last: 1.25,
  lower: 1.0,
  keep: 0.8,
  scatter: 1.9,
  leaves: 1.3,
  push: 1.0,
  pop: 1.5,
  relower: 1.1,
  full: 0.9,
  empty: 0.9,
  done: 1.3,
};
/** Seconds a batched step spends on each row. */
const PER_ROW = 0.42;

export const bounce = (t: number): number => {
  const n = 7.5625,
    d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** A straight move from a to b that rises by h and leans toward the viewer by dz in the middle. */
export function hop(a: P3, b: P3, u: number, h: number, dz = 0): P3 {
  const w = Math.sin(Math.PI * u);
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) + h * w, z: lerp(a.z, b.z, u) + dz * w };
}

/** A quadratic Bézier from a through (near) c to b. */
export function bez(a: P3, c: P3, b: P3, u: number): P3 {
  const v = 1 - u;
  return {
    x: v * v * a.x + 2 * v * u * c.x + u * u * b.x,
    y: v * v * a.y + 2 * v * u * c.y + u * u * b.y,
    z: v * v * a.z + 2 * v * u * c.z + u * u * b.z,
  };
}

interface Spot {
  t: P3;
  c: P3;
}

/**
 * Two keys changing places. In the tree they pass along the same wire, the rising
 * one in front, the sinking one behind; in the array the rising one hops over the
 * sinking one.
 */
export function swapPath(a: Spot, b: Spot, u: number, rising: boolean): Spot {
  const span = Math.abs(b.c.x - a.c.x) / Lay.CW;
  // in the tree the two pass side by side, across the wire from each other
  const dx = b.t.x - a.t.x,
    dy = b.t.y - a.t.y,
    L = Math.hypot(dx, dy) || 1;
  const w = Math.sin(Math.PI * u),
    side = (rising ? 0.34 : -0.34) * w * Math.sign(dy || 1);
  const t = hop(a.t, b.t, u, 0, rising ? 0.3 : -0.3);
  t.x += (-dy / L) * side;
  t.y += (dx / L) * side;
  if (rising) return { t, c: hop(a.c, b.c, u, 0.4 + 0.11 * span, 0.3) };
  const settle = -0.1 * Math.sin(Math.PI * seg(u, 0.82, 1));
  const c = hop(a.c, b.c, u, 0.12, -0.3);
  t.y += settle;
  c.y += settle * 0.6;
  return { t, c };
}

const same = (a: P3, b: P3) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-6;

/** Items that change place between two poses and exist in both. */
function movers(A: Pose, B: Pose): string[] {
  const out: string[] = [];
  for (const [key, b] of B.items) {
    const a = A.items.get(key);
    if (a && (!same(a.t, b.t) || !same(a.c, b.c))) out.push(key);
  }
  return out;
}

/** A quick swell of an item's scale over [a, b]. */
function swell(it: ItemPose | undefined, t: number, a: number, b: number, amt = 0.16): void {
  if (it) it.s *= 1 + amt * Math.sin(Math.PI * seg(t, a, b));
}

/** Paint an item as the key in motion while w > 0. */
function paint(it: ItemPose, tone: keyof typeof PAINT, w: number): void {
  if (w <= 0) return;
  const P = PAINT[tone];
  it.fill = mix3(it.fill, P.fill, w);
  it.glyph = mix3(it.glyph, P.glyph, w);
  it.rim = mix3(it.rim, P.rim, w);
  it.halo = lerp(it.halo, P.halo, w);
}

const keyInSlot = (P: Pose, i: number): string | undefined => {
  for (const it of P.items.values()) if (it.slot === i) return it.key;
  return undefined;
};

const slotSpot = (s: SlotPose | undefined): Spot | null => (s ? { t: s.t, c: s.c } : null);

/** The motion of step i. */
export function buildTransition(prog: HeapProgram, i: number): Transition<Pose> {
  const s = prog.steps[i],
    A = restAt(prog, i - 1),
    B = restAt(prog, i);
  let dur = DUR[s.kind];
  const focusOf = (t: number, w = 0.45) => (s.focus ? { at: s.focus, w: w * Math.sin(Math.PI * t) } : null);
  const finish = (P: Pose, t: number): Pose => {
    if (!P.focus) P.focus = focusOf(t);
    return P;
  };
  const moving = movers(A, B);
  /** Send moving items (all, or those `only` allows) along their way with blend u. */
  const glide = (P: Pose, u: number, only?: (key: string) => boolean) => {
    for (const key of moving) {
      if (only && !only(key)) continue;
      const a = A.items.get(key),
        b = B.items.get(key),
        it = P.items.get(key);
      if (!a || !b || !it) continue;
      const span = Math.abs(a.c.x - b.c.x) / Lay.CW;
      it.t = hop(a.t, b.t, u, 0.15);
      it.c = hop(a.c, b.c, u, Math.min(1.2, 0.08 * span));
    }
  };
  let pose: (t: number) => Pose = t => {
    const u = easeInOut(t),
      P = mixPose(A, B, u);
    glide(P, u);
    return finish(P, t);
  };

  switch (s.kind) {
    case 'arcs': {
      // every cell is tied to its children, one after another along the array
      const N = Math.max(1, B.slots.length),
        n = B.slots.filter(sl => sl.used > 0.5).length;
      const at = (c: number) => 0.05 + (0.62 * (c - 1)) / N;
      pose = t => {
        const P = mixPose(A, B, 1, { wire: c => easeInOut(seg(t, at(c), at(c) + 0.3)), over: smooth(0.6, 1, t) });
        for (const it of P.items.values()) {
          const c = 2 * it.slot + 1;
          if (it.slot >= 0 && c < n) swell(it, t, at(c) - 0.02, at(c) + 0.25, 0.14);
        }
        return finish(P, t);
      };
      break;
    }
    case 'fold': {
      // the array lifts into the tree one slot at a time, in index order; unfolding
      // plays it the other way, the bottom row first
      const up = (B.slots[0]?.f ?? 1) > (A.slots[0]?.f ?? 0);
      const N = Math.max(2, B.slots.length);
      const st = (i: number) => (0.62 * (up ? i : N - 1 - i)) / (N - 1);
      pose = t => {
        const fk = (i: number) => easeInOut(seg(t, st(i), st(i) + 0.38));
        const P = mixPose(A, B, easeInOut(t), {
          slot: fk,
          item: key => {
            const sl = B.items.get(key)?.slot ?? -1;
            return sl >= 0 ? fk(sl) : easeInOut(t);
          },
        });
        for (const it of P.items.values()) {
          if (it.slot < 0) continue;
          const b = 0.55 * Math.sin(Math.PI * fk(it.slot));
          it.t = { ...it.t, y: it.t.y + b, z: it.t.z + 0.35 * b };
          it.c = { ...it.c, y: it.c.y + b, z: it.c.z + 0.35 * b };
        }
        return finish(P, t);
      };
      break;
    }
    case 'append': {
      // the new key drops into the next free slot; its wire is tied on
      const id = s.focus ?? '';
      pose = t => {
        const k0 = easeInOut(seg(t, 0, 0.45));
        const P = mixPose(A, B, k0, {
          item: key => (key === id ? Math.min(1, seg(t, 0.28, 0.4) * 1.2) : k0),
          wire: c => (A.wires.get(c)?.ghost ? smooth(0.5, 0.85, t) : k0),
          over: k0,
        });
        glide(P, k0, key => key !== id);
        const it = P.items.get(id);
        if (it) {
          const d = 1 - bounce(seg(t, 0.28, 0.9));
          it.t = { ...it.t, y: it.t.y + d * 2.4 };
          it.c = { ...it.c, y: it.c.y + d * 1.5 };
        }
        return finish(P, t);
      };
      break;
    }
    case 'up':
    case 'down':
    case 'stay':
    case 'lower':
    case 'keep': {
      // a comparison: the wires being checked light up, the index arithmetic arcs over the array
      const look = (s.look ?? []).map(j => keyInSlot(B, j));
      const shake = s.kind === 'keep';
      pose = t => {
        const k0 = easeInOut(seg(t, 0, 0.4));
        const P = mixPose(A, B, k0, { over: easeInOut(seg(t, 0.05, 0.5)) });
        glide(P, k0);
        for (const key of look) swell(key ? P.items.get(key) : undefined, t, 0.3, 0.7, 0.12);
        if (s.kind === 'stay') swell(s.focus ? P.items.get(s.focus) : undefined, t, 0.45, 0.95, 0.2);
        if (shake && s.focus) {
          const it = P.items.get(s.focus);
          if (it) {
            const dx = 0.08 * Math.sin(t * Math.PI * 7) * (1 - t);
            it.t = { ...it.t, x: it.t.x + dx };
            it.c = { ...it.c, x: it.c.x + dx };
          }
        }
        return finish(P, t);
      };
      break;
    }
    case 'swap': {
      // two keys change places along their wire
      const pair = moving.filter(key => (A.items.get(key)?.slot ?? -1) >= 0 && (B.items.get(key)?.slot ?? -1) >= 0);
      const swapped = pair.filter(key => A.items.get(key)?.slot !== B.items.get(key)?.slot);
      pose = t => {
        const u = easeInOut(seg(t, 0.04, 0.9)),
          k0 = easeInOut(seg(t, 0, 0.5));
        const P = mixPose(A, B, k0, { item: key => (swapped.includes(key) ? u : k0) });
        for (const key of swapped) {
          const a = A.items.get(key),
            b = B.items.get(key),
            it = P.items.get(key);
          if (!a || !b || !it) continue;
          const p = swapPath(a, b, u, b.slot < a.slot);
          it.t = p.t;
          it.c = p.c;
        }
        glide(P, k0, key => !swapped.includes(key));
        return finish(P, t);
      };
      break;
    }
    case 'take': {
      // the top rises off the tree and flies to the out tray
      const id = s.focus ?? '';
      pose = t => {
        const k0 = easeInOut(seg(t, 0, 0.4));
        const P = mixPose(A, B, k0, { item: key => (key === id ? easeInOut(seg(t, 0.3, 0.95)) : k0), over: k0 });
        glide(P, k0, key => key !== id);
        flyOut(P, A, B, id, t, 0, 1);
        P.ripples.push({
          at: 's:0',
          r: 0.5 + 1.3 * seg(t, 0.05, 0.6),
          a: (1 - seg(t, 0.05, 0.6)) * 0.5,
          col: COL.cobalt,
        });
        return finish(P, t);
      };
      break;
    }
    case 'last': {
      // the last key leaps from the end of the array to the top
      const id = s.focus ?? '';
      pose = t => {
        const k0 = easeInOut(seg(t, 0, 0.5)),
          u = easeInOut(seg(t, 0.08, 0.85));
        const P = mixPose(A, B, k0, { item: key => (key === id ? u : k0), over: k0 });
        glide(P, k0, key => key !== id);
        leap(
          P,
          A.items.get(id),
          { t: B.items.get(id)?.t ?? A.slots[0].t, c: B.items.get(id)?.c ?? A.slots[0].c },
          id,
          u,
        );
        return finish(P, t);
      };
      break;
    }
    case 'push':
    case 'relower': {
      // a whole push (or a ticket lowered in place) in one step: in, then up the path
      const id = s.mover ?? '';
      const path = s.path ?? [];
      const k = Math.max(0, path.length - 1);
      const t0 = s.kind === 'push' ? 0.3 + 0.1 / (1 + k) : 0.28;
      dur += PER_ROW * k;
      const d = (0.95 - t0) / Math.max(1, k);
      const disp = path.slice(1).map(j => keyInSlot(A, j));
      const born = !A.items.has(id);
      pose = t => {
        const k0 = easeInOut(seg(t, 0, t0));
        const P = mixPose(A, B, k0, {
          item: key => (key === id && born ? Math.min(1, seg(t, 0.05, 0.14) * 8) : k0),
          wire: c => (A.wires.get(c)?.ghost ? smooth(t0 * 0.6, t0, t) : k0),
        });
        glide(P, k0, key => key !== id && !disp.includes(key));
        climb(P, A, B, path, disp, id, t, t0, d, true, true);
        const it = P.items.get(id);
        if (it) {
          if (born && t < t0) {
            const drop = 1 - bounce(seg(t, 0.05, t0));
            it.t = { ...it.t, y: it.t.y + drop * 2.3 };
            it.c = { ...it.c, y: it.c.y + drop * 1.4 };
          }
          paint(it, born ? 'new' : 'cur', smooth(0, 0.1, t) * (1 - smooth(0.9, 1, t)));
          if (s.kind === 'relower' && s.was != null) {
            it.label = t < 0.16 ? String(s.was) : (B.items.get(id)?.label ?? it.label);
            swell(it, t, 0.08, 0.28, 0.3);
          }
        }
        return finish(P, t);
      };
      break;
    }
    case 'pop': {
      // a whole pop in one step: the top flies out, the last key leaps up and sinks
      const top = s.top ?? '',
        id = s.mover ?? '';
      const path = s.path ?? [];
      const k = Math.max(0, path.length - 1);
      dur += PER_ROW * k + (id ? 0.4 : 0);
      const t0 = id ? 0.52 : 1;
      const d = (0.95 - t0) / Math.max(1, k);
      const disp = path.slice(1).map(j => keyInSlot(A, j));
      pose = t => {
        const k0 = easeInOut(seg(t, 0.2, t0));
        const P = mixPose(A, B, k0, {
          item: key => (key === top ? easeInOut(seg(t, 0.1, 0.42)) : k0),
        });
        glide(P, k0, key => key !== top && key !== id && !disp.includes(key));
        flyOut(P, A, B, top, t, 0, id ? 0.45 : 1);
        if (id) {
          climb(P, A, B, path, disp, id, t, t0, d, false, false);
          const b0 = slotSpot(B.slots[0]);
          if (t < t0 && b0) leap(P, A.items.get(id), b0, id, easeInOut(seg(t, 0.28, t0)));
          const it = P.items.get(id);
          if (it) paint(it, 'cur', smooth(0.28, 0.4, t) * (1 - smooth(0.92, 1, t)));
        }
        return finish(P, t);
      };
      break;
    }
    case 'scatter': {
      // the old keys lift away and the new ones drop in, slot by slot
      const gone = [...A.items.keys()].filter(key => !B.items.has(key));
      const fresh = [...B.items.keys()].filter(key => !A.items.has(key));
      const N = Math.max(1, B.slots.length);
      const st = (key: string) => 0.3 + (0.42 * Math.max(0, B.items.get(key)?.slot ?? 0)) / N;
      pose = t => {
        const k0 = easeInOut(seg(t, 0.15, 0.6));
        const P = mixPose(A, B, k0, {
          item: key =>
            gone.includes(key)
              ? smooth(0, 0.4, t)
              : fresh.includes(key)
                ? Math.min(1, seg(t, st(key), st(key) + 0.06) * 1.2)
                : easeInOut(seg(t, 0.2, 0.8)),
          wire: c => (A.wires.has(c) ? easeInOut(seg(t, 0.2, 0.8)) : smooth(0.75, 1, t)),
        });
        glide(P, k0);
        for (const key of gone) {
          const it = P.items.get(key);
          if (!it) continue;
          const e = seg(t, 0, 0.4);
          it.t = { ...it.t, y: it.t.y + 2.2 * e * e };
          it.c = { ...it.c, y: it.c.y + 1.4 * e * e };
        }
        for (const key of fresh) {
          const it = P.items.get(key);
          if (!it) continue;
          const drop = 1 - bounce(seg(t, st(key), st(key) + 0.28));
          it.t = { ...it.t, y: it.t.y + drop * 2.4 };
          it.c = { ...it.c, y: it.c.y + drop * 1.6 };
        }
        return finish(P, t);
      };
      break;
    }
    case 'leaves': {
      // the leaves glow and nod, left to right
      pose = t => {
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.5)));
        const lit = B.slots.map(sl => sl.lit > 0.5);
        const first = lit.indexOf(true),
          n = Math.max(1, lit.filter(Boolean).length);
        for (const it of P.items.values()) {
          if (it.slot < 0 || !lit[it.slot]) continue;
          const a = 0.15 + (0.45 * (it.slot - first)) / n;
          const b = 0.22 * Math.sin(Math.PI * seg(t, a, a + 0.35));
          it.t = { ...it.t, y: it.t.y + b };
          it.c = { ...it.c, y: it.c.y + b * 0.6 };
        }
        return finish(P, t);
      };
      break;
    }
    case 'full':
    case 'empty': {
      const at = s.kind === 'full' ? `s:${Math.max(0, B.slots.length - 1)}` : 's:0';
      pose = t => {
        const P = mixPose(A, B, easeInOut(t));
        P.ripples.push({ at, r: 0.5 + 1.3 * seg(t, 0.1, 0.9), a: (1 - seg(t, 0.1, 0.9)) * 0.6, col: COL.red });
        const it = s.focus ? P.items.get(s.focus) : undefined;
        if (it) {
          const dx = 0.09 * Math.sin(t * Math.PI * 7) * (1 - t);
          it.t = { ...it.t, x: it.t.x + dx };
          it.c = { ...it.c, x: it.c.x + dx };
        }
        return finish(P, t);
      };
      break;
    }
    case 'done': {
      // a wave down the pyramid, row by row
      pose = t => {
        const k0 = easeInOut(seg(t, 0, 0.4));
        const P = mixPose(A, B, k0);
        glide(P, k0);
        for (const it of P.items.values()) {
          if (it.slot < 0) continue;
          const a = 0.08 + 0.13 * rowOf(it.slot);
          swell(it, t, a, a + 0.32, 0.14);
        }
        if (B.slots.some(sl => sl.used > 0.5))
          P.ripples.push({
            at: 's:0',
            r: 0.5 + 1.4 * seg(t, 0.05, 0.7),
            a: (1 - seg(t, 0.05, 0.7)) * 0.45,
            col: COL.cobalt,
          });
        return finish(P, t);
      };
      break;
    }
    default:
      break;
  }
  return { dur, pose };
}

/** The top leaves: up off its slot, then over to its place on the out tray, shrinking to fit. */
function flyOut(P: Pose, A: Pose, B: Pose, id: string, t: number, t0: number, t1: number): void {
  const a = A.items.get(id),
    b = B.items.get(id),
    it = P.items.get(id);
  if (!a || !b || !it) return;
  const T = (x: number) => t0 + (t1 - t0) * x;
  const lift = easeOut(seg(t, T(0), T(0.3))),
    fly = easeInOut(seg(t, T(0.3), T(0.95)));
  const upT = { ...a.t, y: a.t.y + Lay.LIFT },
    upC = { ...a.c, y: a.c.y + 1.1 };
  const midT = { x: (upT.x + b.t.x) / 2, y: upT.y + 0.5, z: (upT.z + b.t.z) / 2 + 1.1 };
  const midC = { x: (upC.x + b.c.x) / 2, y: upC.y + 0.7, z: (upC.z + b.c.z) / 2 };
  const flying = t >= T(0.3);
  it.t = flying ? bez(upT, midT, b.t, fly) : mixP(a.t, upT, lift);
  it.c = flying ? bez(upC, midC, b.c, fly) : mixP(a.c, upC, lift);
  it.f = lerp(a.f, 0, smooth(T(0.55), T(0.95), t));
  it.chip = 1 - smooth(T(0), T(0.2), t);
  const air = fadeInOut(t, T(0.02), T(0.18), T(0.75), T(0.97));
  paint(it, 'top', air);
}

/** The last key leaps from the end of the array to the top: round the tree's flank, and in one long hop over the array. */
function leap(P: Pose, a: ItemPose | undefined, to: Spot, id: string, u: number): void {
  const it = P.items.get(id);
  if (!a || !it) return;
  const ctrl = { x: a.t.x + 0.9, y: Math.max(a.t.y, to.t.y) + 1.3, z: a.t.z + 1.0 };
  const span = Math.abs(a.c.x - to.c.x) / Lay.CW;
  it.t = bez(a.t, ctrl, to.t, u);
  it.c = hop(a.c, to.c, u, 0.6 + 0.17 * span, 0.2);
}

/**
 * A key moving along a path of slots, one row per segment, each key in its way
 * passing it on the same wire. Before its segment, a key in the way waits where
 * the rest of the heap is.
 */
function climb(
  P: Pose,
  A: Pose,
  B: Pose,
  path: number[],
  disp: (string | undefined)[],
  id: string,
  t: number,
  t0: number,
  d: number,
  rising: boolean,
  wait: boolean,
): void {
  const spot = (j: number) => slotSpot(B.slots[path[j]]);
  const it = P.items.get(id);
  const k = path.length - 1;
  if (it && wait && t < t0) {
    const s0 = spot(0);
    if (s0) {
      it.t = { ...s0.t };
      it.c = { ...s0.c };
    }
  }
  for (let j = 0; j < k; j++) {
    const u = easeInOut(seg(t, t0 + j * d, t0 + (j + 1) * d));
    const from = spot(j),
      to = spot(j + 1);
    if (!from || !to) continue;
    const key = disp[j],
      other = key ? P.items.get(key) : undefined;
    if (other && u > 0) {
      const p = swapPath(to, from, u, !rising);
      other.t = p.t;
      other.c = p.c;
    }
    if (it && t >= t0 + j * d && (t < t0 + (j + 1) * d || j === k - 1)) {
      const p = swapPath(from, to, u, rising);
      it.t = p.t;
      it.c = p.c;
    }
  }
  if (it && k === 0 && t >= t0) {
    const s0 = spot(0);
    if (s0) {
      it.t = { ...s0.t };
      it.c = { ...s0.c };
    }
  }
  // keys in the way that have not moved yet wait at their (re-laid-out) slot
  const k0 = easeInOut(seg(t, 0, t0));
  disp.forEach((key, j) => {
    if (!key || t >= t0 + j * d) return;
    const a = A.items.get(key),
      o = P.items.get(key),
      s1 = spot(j + 1);
    if (a && o && s1) {
      o.t = mixP(a.t, s1.t, k0);
      o.c = mixP(a.c, s1.c, k0);
    }
  });
}

/** A plain blend between any two poses: seeking, replaying, switching heap. */
export function morph(P0: Pose, P1: Pose, dur = 0.6): Transition<Pose> {
  return {
    dur,
    pose: t => {
      const e = easeInOut(t);
      const P = mixPose(P0, P1, e);
      for (const [key, b] of P1.items) {
        const a = P0.items.get(key),
          it = P.items.get(key);
        if (!a || !it) continue;
        it.t = hop(a.t, b.t, e, 0.2 * Math.min(1, Math.hypot(a.t.x - b.t.x, a.t.y - b.t.y)));
        it.c = hop(a.c, b.c, e, Math.min(1, 0.06 * Math.abs(a.c.x - b.c.x)));
      }
      return P;
    },
  };
}

/** Opening move: the cells rise along the plinth and the keys drop into them, one by one. */
export function assemble(P1: Pose, reduced = false): Transition<Pose> {
  const N = Math.max(1, P1.slots.length);
  const empty: Pose = {
    ...P1,
    items: new Map(),
    wires: new Map(),
    slots: P1.slots.map(sl => ({ ...sl, a: 0 })),
    arcs: new Map(),
    guides: new Map(),
    callout: null,
  };
  let tNow = 0;
  const drop = (slot: number) => {
    const a = 0.22 + (0.5 * Math.max(0, slot)) / N;
    return seg(tNow, a, a + 0.3);
  };
  return {
    dur: reduced ? 0.8 : 2.3,
    pose(t) {
      tNow = t;
      const P = mixPose(empty, P1, 1, {
        item: key => Math.min(1, drop(P1.items.get(key)?.slot ?? 0) * 4),
        slot: i => smooth((0.3 * i) / N, (0.3 * i) / N + 0.25, t),
        wire: () => smooth(0.7, 1, t),
        over: smooth(0.7, 1, t),
      });
      for (const it of P.items.values()) {
        const dr = 1 - (reduced ? drop(it.slot) : bounce(drop(it.slot)));
        it.t = { ...it.t, y: it.t.y + dr * 3 };
        it.c = { ...it.c, y: it.c.y + dr * 2.2 };
      }
      return P;
    },
  };
}

/** How long each kind holds for reading while playing. */
export const HOLD: Readonly<Partial<Record<StepKind, number>>> = {
  arcs: 1.0,
  fold: 1.2,
  append: 0.35,
  up: 0.25,
  down: 0.3,
  swap: 0.15,
  stay: 0.8,
  take: 0.5,
  last: 0.5,
  keep: 0.4,
  scatter: 0.8,
  leaves: 0.9,
  push: 0.15,
  pop: 0.2,
  relower: 0.35,
  full: 0.8,
  empty: 0.8,
  done: 1.4,
};

/** Reading time per character, by kind: quick steps are read at a glance. */
export const RATE: Readonly<Partial<Record<StepKind, number>>> = {
  up: 0.005,
  down: 0.005,
  swap: 0.004,
  push: 0.004,
  pop: 0.004,
};
