// Motion. Each algorithm step becomes a transition pose(t), t in [0, 1], that
// starts exactly where the previous step's rest pose ended. Stepping back plays
// the same function in reverse. No Three.js here, so it is unit-tested.

import type { Transition } from '../../core/player';
import { clamp01, easeInOut, easeOut, fadeInOut, lerp, plural, seg, smooth } from '../../core/math';
import type { StepKind } from './algorithms';
import { COL, L0, R } from './palette';
import {
  ekey,
  mixNet,
  netStatic,
  nkey,
  type NetCtx,
  type NetMotion,
  type NetPose,
  type NetTransition,
  type ScenePose,
} from './poses';
import { tickEnd, tickRange, type GraphProgram } from './program';

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Partial<Record<StepKind, number>>> = {
  start: 0.8,
  dequeue: 0.55,
  discover: 0.55,
  skip: 0.32,
  found: 1.8,
  done: 0.7,
  lift: 3.4,
  dive: 0.6,
  back: 0.5,
  extract: 1.0,
  improve: 0.72,
  keep: 0.5,
  path: 2.4,
  unreachable: 1.0,
};
/** Race steps play a little faster, since each tick holds several fine steps. */
const RACE_PACE = 0.7;

const bounce = (t: number): number => {
  const n = 7.5625,
    d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** A quick swell of a knot's scale over [a, b]. */
function pop(P: NetPose, key: string | null, t: number, a: number, b: number, amt = 0.22): void {
  const n = key ? P.nodes.get(key) : undefined;
  if (n) n.s *= 1 + amt * Math.sin(Math.PI * seg(t, a, b));
}

/** The motion of step i on one net. */
export function netTr(ctx: NetCtx, i: number): NetTransition {
  const cached = ctx.trs[i];
  if (cached) return cached;
  const s = ctx.steps[i],
    A = netStatic(ctx, i - 1),
    B = netStatic(ctx, i);
  const L = (id: number) => ctx.g.label(id);
  const nk = (id: number) => nkey(ctx, id),
    ek = (id: number) => ekey(ctx, id);
  let dur = (DUR[s.kind] ?? 0.6) * ctx.pace;
  let pose = (t: number): NetMotion => ({ net: mixNet(A, B, easeInOut(t)) });
  const toK = s.to != null ? nk(s.to) : null,
    eK = s.edge != null ? ek(s.edge) : null,
    fromK = s.from != null ? nk(s.from) : null;
  const startK = ctx.start != null ? nk(ctx.start) : null;
  const focusK = s.focus != null ? nk(s.focus) : null;
  switch (s.kind) {
    case 'start':
      pose = t => {
        const P = mixNet(A, B, easeInOut(seg(t, 0, 0.6)));
        pop(P, startK, t, 0.1, 0.7);
        const u = seg(t, 0.15, 1);
        if (startK && u > 0 && u < 1)
          P.ripples.push({
            node: startK,
            r: R + 0.25 + u * 1.5,
            a: (1 - u) * 0.6,
            col: ctx.algo === 'dfs' ? COL.cobalt : COL.yellowDeep,
          });
        return { net: P };
      };
      break;
    case 'dequeue': // BFS: the knot at the front starts a ripple
      pose = t => {
        const P = mixNet(A, B, easeInOut(seg(t, 0, 0.5)));
        pop(P, focusK, t, 0, 0.5);
        const u = seg(t, 0.1, 1);
        if (focusK && u > 0 && u < 1)
          P.ripples.push({ node: focusK, r: R + 0.25 + u * 1.9, a: (1 - u) * 0.55, col: COL.yellowDeep });
        return { net: P };
      };
      break;
    case 'discover': // a bead runs along the string; the new knot turns yellow when it arrives
      pose = t => {
        const kTo = smooth(0.55, 0.85, t),
          kE = smooth(0.05, 0.6, t),
          kD = easeInOut(seg(t, 0, 0.4));
        const P = mixNet(A, B, kD, key => (key === toK ? kTo : key === eK ? kE : kD));
        if (eK && fromK)
          P.beads.push({
            edge: eK,
            from: fromK,
            u: easeInOut(seg(t, 0, 0.6)),
            col: COL.yellowDeep,
            a: 1 - seg(t, 0.55, 0.68),
          });
        pop(P, toK, t, 0.55, 0.95);
        return {
          net: P,
          callout: toK
            ? { node: toK, text: `layer ${B.nodes.get(toK)?.tag}`, a: fadeInOut(t, 0.55, 0.7, 0.9, 1) }
            : null,
        };
      };
      break;
    case 'skip': // a bead goes to look and comes back
      pose = t => {
        const P = mixNet(A, B, easeInOut(seg(t, 0, 0.5)));
        if (eK && fromK)
          P.beads.push({
            edge: eK,
            from: fromK,
            u: 0.42 * Math.sin(Math.PI * t),
            col: COL.string,
            a: Math.sin(Math.PI * t),
            r: 0.075,
          });
        return { net: P };
      };
      break;
    case 'dive': // DFS: the thread grows along the string
      pose = t => {
        const kT = easeInOut(seg(t, 0, 0.7)),
          kTo = smooth(0.6, 0.85, t),
          kF = smooth(0, 0.3, t);
        const P = mixNet(A, B, kF, key => (key === eK ? kT : key === toK ? kTo : kF));
        pop(P, toK, t, 0.62, 1);
        return { net: P };
      };
      break;
    case 'extract': {
      // Dijkstra: the start rises by the new distance and the settled knot peels off the plinth
      const first = s.focus === ctx.start;
      dur *= first ? 1.3 : 1;
      pose = t => {
        const kH = easeInOut(seg(t, first ? 0.45 : 0.05, 1)),
          kX = smooth(0.68, 1, t),
          kC = smooth(0, 0.3, t);
        const P = mixNet(A, B, kC, null, key => (key === focusK ? kX : kH));
        P.tau = lerp(A.tau, B.tau, kH);
        if (first) {
          P.wire = easeOut(seg(t, 0, 0.45));
          P.ruler = smooth(0.4, 0.8, t);
        }
        pop(P, focusK, t, 0.68, 1, 0.16);
        return {
          net: P,
          callout: focusK
            ? { node: focusK, text: `settled at ${s.tau}`, tone: 'cobalt', a: fadeInOut(t, 0.55, 0.7, 0.9, 1) }
            : null,
        };
      };
      break;
    }
    case 'improve': // a cheaper route: the old distance lifts away, struck through
      pose = t => {
        const kTo = smooth(0.48, 0.75, t),
          kE = smooth(0.1, 0.55, t);
        const P = mixNet(A, B, kTo, key => (key === eK ? kE : kTo));
        if (eK && fromK)
          P.beads.push({
            edge: eK,
            from: fromK,
            u: easeInOut(seg(t, 0, 0.5)),
            col: COL.cobalt,
            a: 1 - seg(t, 0.5, 0.62),
          });
        if (toK && s.old !== Infinity) P.ghosts.push({ node: toK, text: String(s.old), g: seg(t, 0.5, 0.95) });
        pop(P, toK, t, 0.5, 0.9);
        const text = s.old === Infinity ? `${s.nd} < ∞` : `${s.nd} < ${s.old}`;
        return {
          net: P,
          callout: toK ? { node: toK, text, tone: 'cobalt', a: fadeInOut(t, 0.3, 0.45, 0.9, 1) } : null,
        };
      };
      break;
    case 'keep':
      pose = t => {
        const P = mixNet(A, B, easeInOut(seg(t, 0, 0.5)));
        const u = seg(t, 0, 0.6);
        if (eK && fromK)
          P.beads.push({
            edge: eK,
            from: fromK,
            u: 0.88 * Math.sin((Math.PI / 2) * u),
            col: COL.string,
            a: 1 - seg(t, 0.6, 0.8),
            r: 0.08,
          });
        const text = `${s.nd} ${s.nd === s.cur ? '=' : '>'} ${s.cur}`;
        return { net: P, callout: toK ? { node: toK, text, a: fadeInOut(t, 0.35, 0.5, 0.9, 1) } : null };
      };
      break;
    case 'found':
    case 'path': {
      // the payoff: the route lights up string by string and pulls taut
      const pe = s.pathEdges || [],
        n = pe.length;
      const order = new Map(pe.map((id, k) => [ek(id), k]));
      if (s.kind === 'found') dur = (DUR.found ?? 1.8) * ctx.pace;
      pose = t => {
        const kB = easeInOut(seg(t, 0, 0.25));
        const P = mixNet(A, B, kB, (key, type) => {
          const k = order.get(key);
          if (type === 'e' && k != null) return smooth((k / n) * 0.72, ((k + 1) / n) * 0.72, t);
          if (key === focusK) return smooth(0.7, 0.92, t);
          return kB;
        });
        if (n && t < 0.8) {
          const v = seg(t, 0, 0.72) * n,
            k = Math.min(n - 1, Math.floor(v));
          P.beads.push({
            edge: ek(pe[k]),
            from: nk(s.path[k]),
            u: Math.min(1, v - k),
            col: COL.cobalt,
            a: 1 - seg(t, 0.72, 0.8),
            r: 0.13,
          });
        }
        pop(P, focusK, t, 0.7, 1, 0.25);
        const route =
          s.kind === 'path'
            ? `${s.path.length > 1 ? s.path.map(L).join('→') + ' = ' : ''}${focusK ? (B.nodes.get(focusK)?.tag ?? '') : ''}`
            : plural(s.path.length - 1, 'string');
        return {
          net: P,
          callout: focusK ? { node: focusK, text: route, tone: 'cobalt', a: fadeInOut(t, 0.72, 0.82, 0.93, 1) } : null,
          focus: focusK ? { node: focusK, w: fadeInOut(t, 0.1, 0.55, 0.85, 1) * 0.8 } : null,
        };
      };
      break;
    }
    case 'lift': {
      // BFS payoff: every string counts as one, so the net lifts off in tiers
      const T = s.tau;
      pose = t => {
        const P = mixNet(A, B, smooth(0, 0.2, t), null, () => 1);
        const v = (T + 0.4) * easeInOut(seg(t, 0.24, 1)),
          tau = Math.min(v, T);
        for (const node of P.nodes.values()) {
          const layer = s.lifted[node.id];
          if (layer == null) {
            node.h = 0;
            continue;
          }
          node.h = v <= layer ? 0 : L0 * smooth(0, 0.4, v - layer) + Math.max(0, tau - layer) * ctx.HS;
        }
        P.tau = tau;
        P.wire = easeOut(seg(t, 0, 0.22));
        P.ruler = smooth(0.2, 0.4, t);
        return {
          net: P,
          callout: startK
            ? { node: startK, text: 'lift', tone: 'cobalt', a: fadeInOut(t, 0.05, 0.12, 0.24, 0.3) }
            : null,
        };
      };
      break;
    }
    case 'unreachable':
    case 'done': {
      // an unreachable target shakes its head
      const tK = (s.kind === 'unreachable' || s.kind === 'done') && ctx.target != null ? nk(ctx.target) : null;
      pose = t => {
        const P = mixNet(A, B, easeInOut(t));
        const node = tK ? P.nodes.get(tK) : undefined;
        if (node) node.x += 0.09 * Math.sin(t * Math.PI * 7) * (1 - t);
        return {
          net: P,
          callout: tK ? { node: tK, text: 'unreachable', tone: 'red', a: fadeInOut(t, 0.1, 0.25, 0.85, 1) } : null,
        };
      };
      break;
    }
    case 'back':
      break; // the default blend retracts the thread along the string
  }
  const tr: NetTransition = { dur, pose, kind: s.kind };
  ctx.trs[i] = tr;
  return tr;
}

/** Race: one clock drives both plinths. Race step k plays tick k of each algorithm. */
function raceTr(prog: GraphProgram, k: number): Transition<ScenePose> {
  const parts = prog.nets.map(ctx => {
    const r = tickRange(ctx, k),
      list: { tr: NetTransition; D0: number; d: number }[] = [];
    let D = 0;
    if (r)
      for (let i = r[0]; i <= r[1]; i++) {
        const tr = netTr(ctx, i),
          d = tr.dur * RACE_PACE;
        list.push({ tr, D0: D, d });
        D += d;
      }
    return { ctx, list, D };
  });
  const dur = Math.max(0.4, Math.min(2.2, Math.max(...parts.map(p => p.D))));
  return {
    dur,
    pose(t) {
      const nets = parts.map(p => {
        if (!p.list.length) return netStatic(p.ctx, tickEnd(p.ctx, k));
        const Lp = Math.min(p.D, dur),
          tt = Math.min(1, (t * dur) / Lp) * p.D;
        const item = p.list.find(it => tt <= it.D0 + it.d) || p.list[p.list.length - 1];
        return item.tr.pose(clamp01((tt - item.D0) / item.d)).net;
      });
      return { nets, callout: null, focus: null };
    },
  };
}

/** The player's build hook: the transition for program step i. */
export function buildTransition(prog: GraphProgram, i: number): Transition<ScenePose> {
  if (prog.mode === 'race') return raceTr(prog, i);
  const tr = netTr(prog.nets[0], i);
  return {
    dur: tr.dur,
    pose(t) {
      const r = tr.pose(t);
      return {
        nets: [r.net],
        callout: r.callout ? { ...r.callout, j: 0 } : null,
        focus: r.focus ? { ...r.focus, j: 0 } : null,
      };
    },
  };
}

function netsByKey(P: ScenePose): Map<string, NetPose> {
  return new Map(P.nets.map(n => [n.key, n]));
}

/** A plain blend between any two scenes: seeking, replaying, loading a new graph. */
export function morph(P0: ScenePose, P1: ScenePose, dur = 0.6): Transition<ScenePose> {
  const A = netsByKey(P0),
    B = netsByKey(P1),
    keys = [...new Set([...A.keys(), ...B.keys()])].sort();
  return {
    dur,
    pose(t) {
      const k = easeInOut(t);
      return { nets: keys.map(key => mixNet(A.get(key), B.get(key), k)), callout: null, focus: null };
    },
  };
}

/** Opening move: the knots drop onto the plinth, then the strings are tied. */
export function dropIn(P1: ScenePose, reduced = false): Transition<ScenePose> {
  return {
    dur: 1.9,
    pose(t) {
      const nets = P1.nets.map(N => {
        const keys = [...N.nodes.keys()],
          n = keys.length;
        const P = mixNet(N, N, 1);
        keys.forEach((key, i) => {
          const d = n > 1 ? (i / (n - 1)) * 0.45 : 0,
            u = seg(t, d, d + 0.4);
          const node = P.nodes.get(key),
            rest = N.nodes.get(key);
          if (!node || !rest) return;
          node.h = rest.h + (1 - (reduced ? u : bounce(u))) * 3.4;
          node.s *= Math.min(1, u * 4);
        });
        for (const e of P.edges.values()) e.s *= smooth(0.55, 0.95, t);
        return P;
      });
      return { nets, callout: null, focus: null };
    },
  };
}
