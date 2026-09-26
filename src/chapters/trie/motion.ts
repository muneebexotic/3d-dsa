// Motion. Each recorded step becomes a transition pose(t), t in [0, 1], that starts
// exactly where the previous step came to rest and ends on its own rest pose;
// stepping back plays the same function in reverse. A letter followed sends a
// spark out along its wire; a new node grows out of its parent; a node taken away
// turns red and shrinks back into it; a spell check sweeps out one ring at a time.
// No Three.js here.

import { easeInOut, easeOut, fadeInOut, lerp, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import type { StepKind } from './diagram';
import {
  bridge,
  even,
  mixFan,
  mixPose,
  restAt,
  type FanPose,
  type Pose,
  type Spark,
  type Timing,
  type TrieProgram,
} from './poses';
import * as Lay from './layout';

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Record<StepKind, number>> = {
  zip: 1.9,
  walk: 0.95,
  miss: 1.25,
  found: 1.35,
  prefix: 1.3,
  grow: 1.05,
  mark: 1.2,
  unmark: 1.1,
  prune: 1.15,
  keep: 1.0,
  spell: 1.3,
  suggest: 1.4,
  none: 0.9,
};

/** Reading time after each kind, and per character. */
export const HOLD: Readonly<Record<string, number>> = {
  zip: 0.6,
  walk: 0.3,
  miss: 0.6,
  found: 0.7,
  prefix: 0.6,
  grow: 0.35,
  mark: 0.6,
  unmark: 0.4,
  prune: 0.35,
  keep: 0.6,
  spell: 0.45,
  suggest: 0.8,
  none: 0.5,
};
export const RATE: Readonly<Record<string, number>> = {
  zip: 0.012,
  walk: 0.008,
  miss: 0.01,
  found: 0.01,
  prefix: 0.01,
  grow: 0.008,
  mark: 0.01,
  unmark: 0.008,
  prune: 0.008,
  keep: 0.01,
  spell: 0.01,
  suggest: 0.012,
  none: 0.01,
};

/** The node the light is on in a sunburst (-1 for none). */
function lightOf(F: FanPose): number {
  let best = -1,
    v = 0.5;
  for (let i = 0; i < F.glow.length; i++)
    if (F.glow[i] > v) {
      v = F.glow[i];
      best = i;
    }
  return best;
}

/** Nodes that are there in b and not in a. */
function arrivals(a: FanPose, b: FanPose): number[] {
  const out: number[] = [];
  for (let i = 0; i < b.al.length; i++) if (b.al[i] > 0.5 && a.al[i] < 0.5) out.push(i);
  return out;
}

/** Add effects to every sunburst of a pose being played. */
function withFx(P: Pose, add: (F: FanPose, k: number) => void): Pose {
  P.fans = P.fans.map((F, k) => {
    const G = { ...F, sparks: [...F.sparks], pulses: [...F.pulses] };
    add(G, k);
    return G;
  });
  return P;
}

/** A spark from the old light to the new one, when the light moved one wire. */
function sparkFor(a: FanPose, b: FanPose, s: number, amt: number, tone: Spark['tone'] = 'cobalt'): Spark | null {
  const from = lightOf(a),
    to = lightOf(b);
  if (to < 0 || from === to || amt <= 0.001) return null;
  // follow the wire the new node hangs from, starting at its parent
  const up = b.up[to] >= 0 ? b.up[to] : from;
  if (up < 0) return null;
  return { from: up, to, s, a: amt, tone };
}

export function buildTransition(prog: TrieProgram, i: number): Transition<Pose> {
  const st = prog.steps[i],
    A = restAt(prog, i - 1),
    B = restAt(prog, i);
  const kind = st.kind;
  const dur = DUR[kind];
  const T = (t: number): Timing => {
    switch (kind) {
      case 'zip':
        return {
          place: easeInOut(seg(t, 0.05, 0.95)),
          light: smooth(0, 1, t),
          word: easeInOut(seg(t, 0.05, 0.95)),
          wedge: t,
          labels: t,
          miss: t,
          callout: smooth(0.1, 0.5, t),
        };
      case 'walk':
      case 'keep':
        return {
          place: easeInOut(seg(t, 0, 0.8)),
          light: smooth(0.35, 0.8, t),
          word: t,
          wedge: smooth(0.2, 0.9, t),
          labels: smooth(0.4, 1, t),
          miss: smooth(0, 0.4, t),
          callout: smooth(0.2, 0.6, t),
        };
      case 'miss':
        return {
          place: easeInOut(seg(t, 0, 0.6)),
          light: smooth(0, 0.4, t),
          word: t,
          wedge: smooth(0, 0.4, t),
          labels: smooth(0, 0.4, t),
          miss: smooth(0.35, 0.7, t),
          callout: smooth(0.4, 0.8, t),
        };
      case 'grow':
        return {
          place: easeOut(seg(t, 0.12, 0.9)),
          light: smooth(0, 0.25, t),
          word: t,
          wedge: t,
          labels: t,
          miss: smooth(0, 0.3, t),
          callout: smooth(0.3, 0.7, t),
        };
      case 'prune':
        return {
          place: easeInOut(seg(t, 0.35, 1)),
          light: smooth(0, 0.35, t),
          word: t,
          wedge: t,
          labels: t,
          miss: t,
          callout: smooth(0, 0.35, t),
        };
      case 'mark':
      case 'unmark':
      case 'found':
      case 'prefix':
      case 'suggest':
        return {
          place: easeInOut(seg(t, 0, 0.7)),
          light: smooth(0.1, 0.6, t),
          word: smooth(0.15, 0.55, t),
          wedge: smooth(0.1, 0.7, t),
          labels: smooth(0.35, 1, t),
          miss: smooth(0, 0.4, t),
          callout: smooth(0.2, 0.6, t),
        };
      case 'spell':
        return {
          place: easeInOut(seg(t, 0, 0.7)),
          light: smooth(0.2, 0.85, t),
          word: t,
          wedge: t,
          labels: smooth(0.5, 1, t),
          miss: smooth(0, 0.3, t),
          callout: smooth(0, 0.3, t),
        };
      default:
        return even(smooth(0, 1, t));
    }
  };
  const last = kind === 'zip' && i === prog.steps.length - 1;
  return {
    dur: last ? 2.2 : dur,
    pose(t) {
      const P = mixPose(A, B, T(t));
      if (t <= 0 || t >= 1) return P;
      return withFx(P, (F, k) => {
        const a = A.fans[k],
          b = B.fans[k];
        if (!a || !b) return;
        switch (kind) {
          case 'walk':
          case 'keep':
          case 'grow': {
            const sp = sparkFor(a, b, easeInOut(seg(t, 0.05, 0.75)), fadeInOut(t, 0, 0.08, 0.7, 0.9));
            if (sp) F.sparks.push(sp);
            if (kind === 'keep') {
              const to = lightOf(b);
              if (to >= 0)
                F.pulses.push({ node: to, s: seg(t, 0.5, 1), a: fadeInOut(t, 0.5, 0.6, 0.85, 1), tone: 'cobalt' });
            }
            break;
          }
          case 'miss': {
            // the light reaches for the empty slot and comes back
            const g = b.miss,
              from = lightOf(b);
            if (g && from >= 0) {
              const s = seg(t, 0.1, 0.45) - seg(t, 0.55, 0.85);
              F.sparks.push({
                from,
                to: -1,
                s: easeInOut(Math.max(0, s)),
                a: fadeInOut(t, 0.05, 0.12, 0.8, 0.9),
                tone: 'red',
              });
            }
            break;
          }
          case 'found':
          case 'mark': {
            const to = lightOf(b);
            if (to >= 0)
              F.pulses.push({ node: to, s: seg(t, 0.15, 0.8), a: fadeInOut(t, 0.15, 0.25, 0.6, 0.85), tone: 'gold' });
            break;
          }
          case 'unmark': {
            const to = lightOf(b);
            if (to >= 0)
              F.pulses.push({ node: to, s: seg(t, 0.1, 0.7), a: fadeInOut(t, 0.1, 0.2, 0.5, 0.75), tone: 'red' });
            break;
          }
          case 'prune': {
            // the doomed node flashes red before it shrinks away
            for (let n = 0; n < b.doom.length; n++)
              if (b.doom[n] > 0.5 && a.al[n] > 0.5)
                F.pulses.push({ node: n, s: seg(t, 0, 0.4), a: fadeInOut(t, 0, 0.1, 0.3, 0.45), tone: 'red' });
            break;
          }
          case 'spell': {
            const ring = st.fans[k].spell?.ring ?? 1;
            F.ripple = {
              rr: lerp(Lay.ringR(ring - 1), Lay.ringR(ring), easeInOut(seg(t, 0.05, 0.8))),
              a: fadeInOut(t, 0, 0.1, 0.75, 0.95),
            };
            break;
          }
          case 'zip': {
            // merging letters: a gold pulse on every node made by this ring's sharing
            for (const n of arrivals(a, b))
              if (b.uni.depth[n] > 0)
                F.pulses.push({ node: n, s: seg(t, 0.55, 1), a: fadeInOut(t, 0.55, 0.7, 0.85, 1) * 0.8, tone: 'gold' });
            if (last) {
              // every word mark, lit in turn from A to Z
              const lit = new Float32Array(F.lit);
              for (let n = 0; n < lit.length; n++) {
                if (F.word[n] < 0.5 || F.al[n] < 0.5) continue;
                const u = (Lay.TH1 - F.th[n]) / Lay.SPAN;
                lit[n] = Math.max(lit[n], fadeInOut(t, 0.05 + 0.6 * u, 0.15 + 0.6 * u, 0.3 + 0.6 * u, 0.45 + 0.6 * u));
              }
              F.lit = lit;
            }
            break;
          }
          default:
            break;
        }
      });
    },
  };
}

/** A plain blend between any two poses, even from different recordings (seek, catch-up, a new operation). */
export function morph(A: Pose, B: Pose, dur = 0.6): Transition<Pose> {
  const pairs = bridge(A, B);
  // the callout that is showing, by the index its sunburst has in the blend
  const coA = A.callout
    ? { ...A.callout, fan: pairs.findIndex(p => p.a.key === A.fans[A.callout?.fan ?? 0]?.key) }
    : null;
  const coB = B.callout;
  return {
    dur,
    pose(t) {
      const e = easeInOut(t);
      if (t >= 1) return B;
      if (t <= 0) return A;
      const T = even(e);
      return {
        fans: pairs.map(p => mixFan(p.a, p.b, T)),
        callout:
          t < 0.5
            ? coA && coA.fan >= 0
              ? { ...coA, al: coA.al * (1 - 2 * e) }
              : null
            : coB
              ? { ...coB, al: coB.al * (2 * e - 1) }
              : null,
        x0: lerp(A.x0, B.x0, e),
        x1: lerp(A.x1, B.x1, e),
      };
    },
  };
}

/** The opening: the sunburst grows out of its centre, ring by ring. */
export function assemble(P: Pose, reduced = false): Transition<Pose> {
  return {
    dur: reduced ? 0.4 : 2.1,
    pose(t) {
      if (t >= 1) return P;
      return {
        ...P,
        callout: null,
        fans: P.fans.map(F => {
          const G = { ...F, a: F.a * smooth(0, 0.25, t) } as FanPose;
          const rr = new Float32Array(F.rr),
            al = new Float32Array(F.al);
          for (let i = 0; i < rr.length; i++) {
            const d = F.uni.depth[i];
            const u = easeOut(seg(t, 0.08 + 0.07 * d, 0.55 + 0.07 * d));
            rr[i] = F.rr[i] * u;
            al[i] = F.al[i] * smooth(0, 0.35, u);
          }
          G.rr = rr;
          G.al = al;
          return G;
        }),
      };
    },
  };
}
