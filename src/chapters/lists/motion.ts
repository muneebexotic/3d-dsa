// Motion. Each recorded step becomes a transition pose(t), t in [0, 1], that
// starts exactly where the previous step came to rest. Stepping back plays the
// same function in reverse. No Three.js here, so it is unit-tested.

import { easeInOut, easeOut, fadeInOut, lerp, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import type { Step, StepKind } from './diagram';
import * as Lay from './layout';
import { COL } from './palette';
import {
  mixPose,
  restAt,
  type ItemPose,
  type ListProgram,
  type Pose,
  type Timing,
  type Via,
  type WirePose,
} from './poses';

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Record<StepKind, number>> = {
  start: 0.7,
  hop: 0.8,
  found: 1.0,
  missing: 0.9,
  alloc: 1.0,
  link: 1.05,
  move: 0.8,
  save: 0.6,
  swing: 1.45,
  swap: 1.3,
  advance: 0.75,
  free: 1.15,
  tidy: 0.95,
  turn: 2.1,
  empty: 0.85,
  jump: 1.15,
  scan: 0.5,
  shift: 0.5,
  write: 0.75,
  lift: 0.8,
  grow: 0.95,
  copy: 0.45,
  retire: 1.1,
  read: 0.75,
  out: 1.0,
  overflow: 0.9,
  underflow: 0.9,
  put: 0.95,
  take: 1.0,
  skip: 0.9,
  done: 0.85,
};

export const bounce = (t: number): number => {
  const n = 7.5625,
    d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** Move an item in both views at once. */
function nudge(it: ItemPose | undefined, dx: number, dy: number, dz: number): void {
  if (!it) return;
  it.x += dx;
  it.y += dy;
  it.z += dz;
  it.mx += dx;
  it.my += dy;
  it.mz += dz;
}
/** A quick swell of an item's scale over [a, b]. */
function pop(P: Pose, key: string | null | undefined, t: number, a: number, b: number, amt = 0.2): void {
  const it = key ? P.items.get(key) : undefined;
  if (it) it.s *= 1 + amt * Math.sin(Math.PI * seg(t, a, b));
}

const calloutOf = (s: Step, t: number, a = 0.25, b = 0.4) =>
  s.callout && s.focus
    ? { at: s.focus, text: s.callout.text, tone: s.callout.tone, a: fadeInOut(t, a, b, 0.88, 1) }
    : null;

/** Keys whose pieces differ between two poses: moved, appeared or vanished. */
function movedItems(A: Pose, B: Pose): Set<string> {
  const out = new Set<string>();
  for (const [key, b] of B.items) {
    const a = A.items.get(key);
    if (!a || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > 1e-6) out.add(key);
  }
  return out;
}
const turningWires = (A: Pose, B: Pose): Set<string> => {
  const out = new Set<string>();
  for (const [key, b] of B.wires) {
    const a = A.wires.get(key);
    if (!a || a.to !== b.to) out.add(key);
  }
  return out;
};

/** The motion of step i. */
export function buildTransition(prog: ListProgram, i: number): Transition<Pose> {
  const s = prog.steps[i],
    A = restAt(prog, i - 1),
    B = restAt(prog, i);
  const dur = DUR[s.kind];
  const focus = (t: number, w = 0.5) => (s.focus ? { at: s.focus, w: w * Math.sin(Math.PI * t) } : null);
  const finish = (P: Pose, t: number, calloutAt?: [number, number]): Pose => {
    P.callout = calloutOf(s, t, ...(calloutAt ?? [0.25, 0.4]));
    if (!P.focus) P.focus = focus(t);
    return P;
  };
  const fallback = (t: number) => finish(mixPose(A, B, easeInOut(t)), t);
  let pose: (t: number) => Pose = fallback;

  switch (s.kind) {
    case 'hop': {
      // a bead runs along the pointer; the hand follows it
      const from = s.hop?.from,
        to = s.hop?.to;
      pose = t => {
        const kB = smooth(0.05, 0.85, t),
          kQ = easeInOut(seg(t, 0, 0.35));
        const P = mixPose(A, B, kQ, {
          flag: () => easeInOut(seg(t, 0.08, 0.88)),
          item: key => (key === to ? smooth(0.62, 0.9, t) : key === from ? smooth(0.05, 0.4, t) : kQ),
          wire: key => (key === s.wire ? kB : kQ),
        });
        if (s.wire && from && to)
          P.beads.push({
            kind: 'wire',
            wire: s.wire,
            from,
            to,
            u: kB,
            a: fadeInOut(t, 0, 0.08, 0.85, 0.95),
            r: 0.12,
            col: COL.cobalt,
          });
        pop(P, to, t, 0.65, 1, 0.14);
        return finish(P, t, [0.05, 0.2]);
      };
      break;
    }
    case 'alloc': {
      // the new node drops in from above
      const born = [...B.items.keys()].filter(k => !A.items.has(k));
      pose = t => {
        const u = seg(t, 0, 0.62);
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.5)), {
          item: key => (born.includes(key) ? Math.min(1, u * 5) : easeInOut(seg(t, 0, 0.5))),
          wire: key => (born.some(b => key.startsWith(b + '.')) ? smooth(0.6, 0.9, t) : easeInOut(seg(t, 0, 0.5))),
          flag: key => (key === 'NODE' ? smooth(0.55, 0.85, t) : easeInOut(seg(t, 0, 0.5))),
        });
        for (const key of born) nudge(P.items.get(key), 0, (1 - bounce(u)) * 2.4, 0);
        return finish(P, t, [0.55, 0.7]);
      };
      break;
    }
    case 'link':
    case 'swing':
    case 'swap': {
      const turning = turningWires(A, B);
      const arraySwap = s.kind === 'swap' && s.diag.structure === 'array';
      if (arraySwap) {
        // two values trade cells: one arcs over, the other passes in front
        const moving = [...movedItems(A, B)];
        pose = t => {
          const u = easeInOut(t);
          const P = mixPose(A, B, u);
          moving.forEach((key, j) => {
            const h = Math.sin(Math.PI * u);
            nudge(P.items.get(key), 0, j === 0 ? 1.1 * h : 0.15 * h, j === 0 ? 0 : 1.2 * h);
          });
          return finish(P, t);
        };
        break;
      }
      const via = (w: WirePose): Via =>
        s.kind === 'swing' ? 'front' : s.kind === 'swap' ? (w.role === 'next' ? 'front' : 'back') : 'short';
      const span: [number, number] = s.kind === 'link' ? [0.12, 0.82] : [0.06, 0.9];
      pose = t => {
        const kW = easeInOut(seg(t, ...span)),
          kQ = easeInOut(seg(t, 0, 0.3));
        const T: Timing = { via, wire: key => (turning.has(key) ? kW : kQ), flag: () => kQ, item: () => kQ };
        return finish(mixPose(A, B, kQ, T), t);
      };
      break;
    }
    case 'free':
    case 'lift':
    case 'skip': {
      // something nothing points to any more drops away (or lifts out of its cell)
      const gone = [...A.items.keys()].filter(k => !B.items.has(k));
      const up = s.kind === 'lift';
      pose = t => {
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.6)), {
          item: key => (gone.includes(key) ? smooth(0.55, 1, t) : easeInOut(seg(t, 0.3, 1))),
          wire: key => (gone.some(g => key.startsWith(g + '.')) ? smooth(0, 0.35, t) : easeInOut(seg(t, 0, 0.6))),
        });
        for (const key of gone) {
          const it = P.items.get(key);
          if (s.kind === 'skip') nudge(it, 0.1 * Math.sin(t * Math.PI * 8) * (1 - t), 0.6 * easeOut(t), 0);
          else nudge(it, 0, up ? 1.3 * easeOut(t) : -2.6 * t * t, 0);
        }
        return finish(P, t, [0.15, 0.3]);
      };
      break;
    }
    case 'turn': {
      // the reversed chain turns round like a turnstile, so it reads left to right again
      pose = t => {
        const e = easeInOut(t),
          th = Math.PI * e,
          land = smooth(0.9, 1, t);
        const P = mixPose(A, B, e);
        for (const [key, it] of P.items) {
          const a = A.items.get(key),
            b = B.items.get(key);
          if (!a || !b) continue;
          // lifted a little off the plinth, the whole chain turns about its middle
          const rx = a.x * Math.cos(th),
            rz = a.z + a.x * Math.sin(th) * 0.95;
          it.x = lerp(rx, b.x, land);
          it.z = lerp(rz, b.z, land);
          it.y = lerp(a.y, b.y, e) + 0.55 * Math.sin(th);
        }
        return finish(P, t);
      };
      break;
    }
    case 'jump': {
      // the index is a sum: one leap from the start of the block straight to the cell
      pose = t => {
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.4)), {
          flag: () => smooth(0.6, 0.9, t),
          item: key => (key === s.focus ? smooth(0.72, 0.95, t) : easeInOut(seg(t, 0, 0.4))),
        });
        if (s.jump)
          P.beads.push({
            kind: 'jump',
            from: s.jump.from,
            to: s.jump.to,
            u: easeInOut(seg(t, 0.05, 0.78)),
            a: fadeInOut(t, 0, 0.06, 0.8, 0.92),
            r: 0.13,
            col: COL.cobalt,
          });
        pop(P, s.focus, t, 0.75, 1, 0.18);
        return finish(P, t, [0.1, 0.25]);
      };
      break;
    }
    case 'shift':
    case 'copy':
    case 'out':
    case 'take': {
      // values hop from one place to another
      const moving = movedItems(A, B);
      const h = s.kind === 'shift' ? 0.55 : s.kind === 'copy' ? 1.0 : 1.7;
      pose = t => {
        const u = easeInOut(t);
        const P = mixPose(A, B, u);
        for (const key of moving) {
          const it = P.items.get(key);
          if (it && A.items.has(key)) nudge(it, 0, h * Math.sin(Math.PI * u), 0);
        }
        if (s.kind === 'take' && s.focus)
          P.ripples.push({
            at: s.focus,
            r: 0.5 + 1.2 * seg(t, 0.3, 1),
            a: (1 - seg(t, 0.3, 1)) * 0.6,
            col: COL.cobalt,
          });
        return finish(P, t);
      };
      break;
    }
    case 'write': {
      const born = [...B.items.keys()].filter(k => !A.items.has(k));
      pose = t => {
        const u = seg(t, 0, 0.7);
        const P = mixPose(A, B, easeInOut(t), {
          item: key => (born.includes(key) ? Math.min(1, u * 4) : easeInOut(t)),
        });
        for (const key of born) nudge(P.items.get(key), 0, (1 - bounce(u)) * 1.5, 0);
        return finish(P, t);
      };
      break;
    }
    case 'put': {
      // a disc flies from its knot into the stack or queue
      const fly = s.fly;
      const knot = fly ? B.net?.knots.get(fly.from) : undefined;
      pose = t => {
        const u = easeInOut(seg(t, 0.05, 0.85));
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.5)), {
          item: key => (fly && key === fly.item ? smooth(0, 0.15, t) : easeInOut(seg(t, 0, 0.5))),
        });
        const it = fly ? P.items.get(fly.item) : undefined;
        const b = fly ? B.items.get(fly.item) : undefined;
        if (it && b && knot) {
          const hy = 1.6 * Math.sin(Math.PI * u);
          it.x = lerp(knot.x, b.x, u);
          it.z = lerp(knot.z, b.z, u);
          it.y = lerp(Lay.KNOT_Y, b.y, u) + hy;
          it.mx = lerp(knot.x, b.mx, u);
          it.mz = lerp(knot.z, b.mz, u);
          it.my = lerp(Lay.KNOT_Y, b.my, u) + hy;
        }
        return finish(P, t);
      };
      break;
    }
    case 'empty':
    case 'overflow':
    case 'underflow':
    case 'missing': {
      // a shake of the head
      pose = t => {
        const P = mixPose(A, B, easeInOut(t));
        const it = s.focus ? P.items.get(s.focus) : undefined;
        if (it) nudge(it, 0.09 * Math.sin(t * Math.PI * 7) * (1 - t), 0, 0);
        return finish(P, t, [0.1, 0.25]);
      };
      break;
    }
    case 'found':
    case 'read':
      pose = t => {
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.5)));
        pop(P, s.focus, t, 0.1, 0.6, 0.22);
        if (s.focus)
          P.ripples.push({
            at: s.focus,
            r: 0.5 + 1.3 * seg(t, 0.15, 1),
            a: (1 - seg(t, 0.15, 1)) * 0.55,
            col: COL.cobalt,
          });
        return finish(P, t, [0.15, 0.3]);
      };
      break;
    case 'start':
    case 'save':
      pose = t => {
        const P = mixPose(A, B, easeInOut(t));
        pop(P, s.focus, t, 0.3, 0.9, 0.12);
        return finish(P, t);
      };
      break;
    case 'grow':
    case 'retire':
      pose = t => finish(mixPose(A, B, easeInOut(t)), t);
      break;
    default:
      break;
  }
  return { dur, pose };
}

/** A plain blend between any two poses: seeking, replaying, switching structure. */
export function morph(P0: Pose, P1: Pose, dur = 0.6): Transition<Pose> {
  return { dur, pose: t => mixPose(P0, P1, easeInOut(t)) };
}

/** Opening move: the discs drop in one by one, then the pointers are tied from each to the next. */
export function assemble(P1: Pose, reduced = false): Transition<Pose> {
  const keys = [...P1.items.keys()];
  const order = new Map(keys.map((k, i) => [k, i]));
  const n = Math.max(1, keys.length);
  const empty: Pose = { ...P1, items: new Map(), wires: new Map(), flags: new Map(), blocks: new Map(), net: null };
  return {
    dur: reduced ? 0.8 : 2.2,
    pose(t) {
      const drop = (key: string) => {
        const d = ((order.get(key) ?? 0) / n) * 0.45;
        return seg(t, d, d + 0.35);
      };
      const P = mixPose(empty, P1, 1, {
        item: key => Math.min(1, drop(key) * 4),
        wire: key => {
          const from = key.slice(0, key.lastIndexOf('.'));
          const d = ((order.get(from) ?? 0) / n) * 0.45 + 0.3;
          return smooth(d, d + 0.2, t);
        },
        flag: () => smooth(0.8, 1, t),
        block: () => smooth(0, 0.3, t),
      });
      P.plinth = P1.plinth;
      P.mplinth = P1.mplinth;
      for (const key of keys) nudge(P.items.get(key), 0, (1 - (reduced ? drop(key) : bounce(drop(key)))) * 3, 0);
      return P;
    },
  };
}

/** How long each kind holds for reading while playing. */
export const HOLD: Readonly<Partial<Record<StepKind, number>>> = {
  start: 0.25,
  hop: 0.08,
  found: 0.7,
  missing: 0.7,
  alloc: 0.3,
  link: 0.35,
  move: 0.25,
  save: 0.15,
  swing: 0.3,
  swap: 0.25,
  advance: 0.1,
  free: 0.4,
  tidy: 0.8,
  turn: 1.0,
  empty: 0.8,
  jump: 0.8,
  scan: 0.05,
  shift: 0.02,
  write: 0.3,
  lift: 0.3,
  grow: 0.6,
  copy: 0.02,
  retire: 0.6,
  read: 0.3,
  out: 0.5,
  overflow: 0.8,
  underflow: 0.8,
  put: 0.15,
  take: 0.35,
  skip: 0.4,
  done: 0.9,
};
/** Reading time per character, by kind: quick steps are read at a glance. */
export const RATE: Readonly<Partial<Record<StepKind, number>>> = {
  hop: 0.002,
  scan: 0.001,
  shift: 0.001,
  copy: 0.001,
  advance: 0.003,
  put: 0.003,
  save: 0.004,
};
