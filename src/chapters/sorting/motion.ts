// Motion. Each recorded step becomes a transition pose(t), t in [0, 1], that
// starts exactly where the previous step came to rest. Stepping back plays the same
// function in reverse. A comparison lights its two threads and lays a gold pick
// between them; then the cloth draws back one row while the threads move to their
// new slots, so the crossing is woven into the row just laid. No Three.js here.

import { easeInOut, lerp, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import type { StepKind } from './diagram';
import { fellX, mixPose, restAt, type LoomPose, type LoomProgram, type Pose } from './poses';

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Record<StepKind, number>> = {
  pick: 1.05,
  move: 1.0,
  done: 1.7,
  weave: 1.4,
  stand: 3.2,
};

/** Reading time after each kind, and per character. */
export const HOLD: Readonly<Record<string, number>> = { pick: 0.25, move: 0.3, done: 0.6, weave: 0.35, stand: 1.2 };
export const RATE: Readonly<Record<string, number>> = {
  pick: 0.006,
  move: 0.008,
  done: 0.01,
  weave: 0.008,
  stand: 0.012,
};

/** Threads that move left hop forward, so they pass in front of the ones going right. */
function hop(P: Pose, A: Pose, B: Pose, e: number): void {
  const w = Math.sin(Math.PI * e);
  if (w <= 0) return;
  for (const L of P.looms) {
    const a = A.looms.find(l => l.id === L.id),
      b = B.looms.find(l => l.id === L.id);
    if (!a || !b) continue;
    L.threads.forEach((th, t) => {
      const d = b.threads[t].x - a.threads[t].x;
      if (d < -0.01) th.lift = Math.min(1.4, th.lift + w * Math.min(1, 0.55 + 0.1 * -d));
    });
  }
}

/** The comparison laid at the front: grows from one thread to the other, then hands over to the cloth. */
function weftAt(P: Pose, B: Pose, t: number): void {
  const L = P.looms[0],
    b = B.looms[0];
  if (!L || !b) return;
  const lit = b.threads.map((th, i) => (th.glow > 0.5 ? i : -1)).filter(i => i >= 0);
  if (lit.length !== 2) return;
  const al = 1 - smooth(0.3, 0.46, t);
  if (t < 0.46) L.weft = { a: lit[0], b: lit[1], s: smooth(0.02, 0.22, t), al };
}

export function buildTransition(prog: LoomProgram, i: number): Transition<Pose> {
  const st = prog.steps[i],
    A = restAt(prog, i - 1),
    B = restAt(prog, i);
  switch (st.kind) {
    case 'pick': {
      const liftUp = A.looms[0]?.threads.some((th, t) => th.lift < 0.5 && (B.looms[0]?.threads[t].lift ?? 0) > 0.5);
      return {
        dur: DUR.pick,
        pose(t) {
          const kc = smooth(0, 0.3, t),
            e = easeInOut(seg(t, 0.28, 1));
          const P = mixPose(A, B, e, {
            glow: kc,
            ring: kc,
            callout: kc,
            marks: smooth(0.15, 0.95, t),
            lift: liftUp ? smooth(0, 0.28, t) : smooth(0.55, 1, t),
          });
          hop(P, A, B, e);
          weftAt(P, B, t);
          return P;
        },
      };
    }
    case 'move':
      return {
        dur: DUR.move,
        pose(t) {
          const e = easeInOut(t);
          const P = mixPose(A, B, e, { glow: smooth(0, 0.35, t), ring: smooth(0, 0.5, t), callout: smooth(0, 0.3, t) });
          hop(P, A, B, e);
          return P;
        },
      };
    case 'done': {
      const n = B.looms[0]?.cells.length ?? 1;
      return {
        dur: DUR.done,
        pose(t) {
          return mixPose(A, B, smooth(0, 0.5, t), {
            cell: s => smooth(0.1 + (0.5 * s) / n, 0.35 + (0.5 * s) / n, t),
            glow: smooth(0, 0.3, t),
            callout: smooth(0, 0.3, t),
          });
        },
      };
    }
    case 'weave': {
      const most = Math.max(...B.looms.map((b, k) => b.rows - (A.looms[k]?.rows ?? 0)));
      return {
        dur: Math.min(3.2, Math.max(DUR.weave, most * 0.075)),
        pose(t) {
          // every loom weaves at the same pace, so the first to stop did the least work
          const u = most > 0 ? t : 1;
          const P = mixPose(A, B, t, { rows: 0, x: 0, marks: smooth(0, 1, t) });
          P.looms.forEach((L: LoomPose, k) => {
            const a = A.looms[k],
              b = B.looms[k];
            if (!a || !b || L.id !== b.id) return;
            L.rows = Math.min(b.rows, a.rows + most * u);
            L.threads.forEach((th, j) => (th.x = fellX(L.weave, L.rows, j)));
            // a loom's plate lights as it stops
            const stop = most > 0 ? (b.rows - a.rows) / most : 0;
            L.done = b.done > a.done ? smooth(stop - 0.12, stop + 1e-6, t) : lerp(a.done, b.done, t);
          });
          return P;
        },
      };
    }
    case 'stand':
      return {
        dur: DUR.stand,
        pose(t) {
          return mixPose(A, B, easeInOut(t), { stand: easeInOut(t) });
        },
      };
  }
}

/** A plain blend between any two poses (seek, catch-up, a new recording). */
export function morph(a: Pose, b: Pose, dur = 0.6): Transition<Pose> {
  return { dur, pose: t => mixPose(a, b, easeInOut(t)) };
}

/** The opening: the looms appear, and their heddles rise from the plinth, one loom after another from the left. */
export function assemble(P: Pose, reduced = false): Transition<Pose> {
  return {
    dur: reduced ? 0.4 : 1.9,
    pose(t) {
      const Q: Pose = { ...P, looms: P.looms.map((L, k) => ({ ...L, rise: smooth(0.07 * k, 0.6 + 0.07 * k, t) })) };
      return lerpA(Q, t);
    },
  };
}

const lerpA = (P: Pose, t: number): Pose => ({
  ...P,
  looms: P.looms.map(L => ({ ...L, a: lerp(0, L.a, smooth(0, 0.3, t)) })),
});
