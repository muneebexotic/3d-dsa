// Motion. Each recorded step becomes a transition pose(t), t in [0, 1], that
// starts exactly where the previous step came to rest. Stepping back plays the
// same function in reverse. No Three.js here, so it is unit-tested.

import { mix3 } from '../../core/color';
import { easeInOut, easeOut, fadeInOut, lerp, seg, smooth } from '../../core/math';
import type { Transition } from '../../core/player';
import { QUERY, bucketRef, ringId, type StepKind } from './diagram';
import * as Lay from './layout';
import { COL, PAINT } from './palette';
import { angDelta, mixPose, restAt, wrapAng, type HashProgram, type ItemPose, type Pose, type Timing } from './poses';

const TAU = Math.PI * 2;

/** Seconds per step kind at 1× speed. */
const DUR: Readonly<Record<StepKind, number>> = {
  hash: 1.8,
  jump: 0.95,
  compare: 0.85,
  hop: 0.75,
  link: 1.0,
  place: 0.95,
  found: 1.0,
  missing: 0.9,
  unlink: 1.1,
  free: 1.1,
  tomb: 1.15,
  full: 1.2,
  grow: 1.7,
  lift: 1.5,
  rehash: 2.0,
  fountain: 3.0,
  retire: 1.3,
  put: 2.0,
  refuse: 0.9,
  done: 1.0,
};

export const bounce = (t: number): number => {
  const n = 7.5625,
    d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

interface P3 {
  x: number;
  y: number;
  z: number;
}

function put(it: ItemPose | undefined, p: P3): void {
  if (!it) return;
  it.x = p.x;
  it.y = p.y;
  it.z = p.z;
}

/** A quick swell of an item's scale over [a, b]. */
function pop(P: Pose, key: string | null | undefined, t: number, a: number, b: number, amt = 0.2): void {
  const it = key ? P.items.get(key) : undefined;
  if (it) it.s *= 1 + amt * Math.sin(Math.PI * seg(t, a, b));
}

const onRing = (p: P3) => Math.hypot(p.x, p.z) > Lay.HUB_R + 0.6;

/**
 * A point on the way from a to b, u in [0, 1]. Between two buckets it goes round
 * the clock rather than across it; it rises by `h` in the middle.
 */
export function travel(a: P3, b: P3, u: number, h: number): P3 {
  const y = lerp(a.y, b.y, u) + h * Math.sin(Math.PI * u);
  if (onRing(a) && onRing(b)) {
    const aa = Math.atan2(a.x, -a.z),
      ab = Math.atan2(b.x, -b.z);
    const ang = aa + angDelta(aa, ab) * u,
      r = lerp(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z), u);
    return { x: r * Math.sin(ang), y, z: -r * Math.cos(ang) };
  }
  return { x: lerp(a.x, b.x, u), y, z: lerp(a.z, b.z, u) };
}

/** A quadratic Bézier from a through (near) c to b. */
const bez = (a: P3, c: P3, b: P3, u: number): P3 => {
  const v = 1 - u;
  return {
    x: v * v * a.x + 2 * v * u * c.x + u * u * b.x,
    y: v * v * a.y + 2 * v * u * c.y + u * u * b.y,
    z: v * v * a.z + 2 * v * u * c.z + u * u * b.z,
  };
};

const HUB: P3 = { x: 0, y: Lay.HUB_Y, z: 0 };
const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Items that change place between two poses and exist in both. */
function movers(A: Pose, B: Pose): string[] {
  const out: string[] = [];
  for (const [key, b] of B.items) {
    const a = A.items.get(key);
    if (a && dist(a, b) > 1e-6) out.push(key);
  }
  return out;
}

/** The hand swings back to twelve over [t0, t1], then winds `hours` round an m-hour clock over [t1, t2]. */
function windHand(P: Pose, A: Pose, t: number, hours: number, m: number, t0: number, t1: number, t2: number): void {
  if (t < t1) {
    const back = easeInOut(seg(t, t0, t1));
    P.hand.ang = wrapAng(A.hand.ang + angDelta(A.hand.ang, 0) * back);
  } else {
    // quick early on, then a long slow-down onto the hour, like a wheel coming to rest
    const e = Math.pow(easeInOut(seg(t, t1, t2)), 0.7);
    P.hand.ang = wrapAng((TAU * hours * e) / m);
  }
}

/** The motion of step i. */
export function buildTransition(prog: HashProgram, i: number): Transition<Pose> {
  const s = prog.steps[i],
    A = restAt(prog, i - 1),
    B = restAt(prog, i);
  const dur = DUR[s.kind];
  const m = s.diag.m;
  const focusOf = (t: number, w = 0.5) => (s.focus ? { at: s.focus, w: w * Math.sin(Math.PI * t) } : null);
  const finish = (P: Pose, t: number, calloutAt: [number, number] = [0.25, 0.4], until = 0.88): Pose => {
    P.callout =
      s.callout && s.focus
        ? {
            at: s.focus,
            text: s.callout.text,
            tone: s.callout.tone,
            a: fadeInOut(t, calloutAt[0], calloutAt[1], until, 1),
          }
        : null;
    if (!P.focus) P.focus = focusOf(t);
    return P;
  };
  const moving = movers(A, B);
  /** Send every moving item along its path with blend u, rising by h × its distance. */
  const glide = (P: Pose, u: number, h = 0.25, only?: (key: string) => boolean) => {
    for (const key of moving) {
      if (only && !only(key)) continue;
      const a = A.items.get(key),
        b = B.items.get(key);
      if (a && b) put(P.items.get(key), travel(a, b, u, Math.min(1.6, h * dist(a, b))));
    }
  };
  let pose: (t: number) => Pose = t => {
    const u = easeInOut(t),
      P = mixPose(A, B, u);
    glide(P, u);
    return finish(P, t);
  };

  switch (s.kind) {
    case 'hash': {
      const id = s.focus ?? '';
      const born = !A.items.has(id);
      pose = t => {
        const kQ = easeInOut(seg(t, 0, 0.3));
        const P = mixPose(A, B, kQ, {
          item: key => (key === id && born ? Math.min(1, seg(t, 0, 0.22) * 5) : kQ),
          lit: smooth(0.86, 1, t),
          hand: 1,
        });
        const it = P.items.get(id);
        if (it && born) it.y += (1 - bounce(seg(t, 0, 0.3))) * 2.4;
        windHand(P, A, t, s.wind ?? 0, m, 0.04, 0.3, 0.94);
        pop(P, id, t, 0.88, 1, 0.12);
        return finish(P, t, [0.5, 0.64], 0.97);
      };
      break;
    }
    case 'jump':
    case 'hop':
    case 'found':
    case 'missing':
    case 'compare': {
      // the key (or the key looked for) flies to its bucket or on to the next slot;
      // in a chain, a bead follows the pointer to the key being compared
      const link = s.link;
      const bad = s.kind === 'missing';
      pose = t => {
        const u = easeInOut(seg(t, 0, 0.7)),
          kQ = easeInOut(seg(t, 0, 0.45));
        const P = mixPose(A, B, kQ, {
          item: key => (key === s.focus && !moving.includes(key) ? easeInOut(seg(t, 0.55, 0.85)) : kQ),
          link: key => (key === link ? smooth(0.05, 0.7, t) : kQ),
        });
        glide(P, u, s.kind === 'hop' ? 0.35 : 0.22);
        if (link)
          P.beads.push({ link, u: smooth(0.05, 0.7, t), a: fadeInOut(t, 0, 0.06, 0.7, 0.8), r: 0.11, col: COL.cobalt });
        if (s.kind === 'found' || s.kind === 'compare')
          pop(P, s.focus, t, 0.62, 0.95, s.kind === 'found' ? 0.24 : 0.12);
        if (s.kind === 'found' && s.focus)
          P.ripples.push({
            at: s.focus,
            r: 0.5 + 1.3 * seg(t, 0.55, 1),
            a: (1 - seg(t, 0.55, 1)) * 0.55,
            col: COL.cobalt,
          });
        if (bad) {
          // the key looked for shakes its head
          const it = (s.focus ? P.items.get(s.focus) : undefined) ?? P.items.get(QUERY);
          if (it) it.x += 0.09 * Math.sin(t * Math.PI * 7) * (1 - t);
          if (s.focus)
            P.ripples.push({ at: s.focus, r: 0.5 + 1 * seg(t, 0.2, 1), a: (1 - seg(t, 0.2, 1)) * 0.5, col: COL.red });
        }
        return finish(P, t, s.kind === 'compare' ? [0.55, 0.68] : [0.3, 0.45]);
      };
      break;
    }
    case 'link':
    case 'place': {
      // the key settles into its place, and the pointer to it is written
      const id = s.focus ?? '';
      pose = t => {
        const u = easeInOut(seg(t, 0, 0.5)),
          kQ = easeInOut(seg(t, 0, 0.4));
        const P = mixPose(A, B, kQ, {
          link: key => (A.links.has(key) ? kQ : smooth(0.35, 0.9, t)),
          item: key => (key === id ? smooth(0.4, 0.8, t) : kQ),
          tomb: () => smooth(0.3, 0.55, t),
        });
        const a = A.items.get(id),
          b = B.items.get(id);
        if (a && b) {
          const p = travel(a, b, u, Math.min(0.9, 0.3 * dist(a, b)));
          p.y -= 0.12 * Math.sin(Math.PI * seg(t, 0.45, 0.62));
          put(P.items.get(id), p);
        }
        glide(P, kQ, 0.2, key => key !== id);
        return finish(P, t);
      };
      break;
    }
    case 'unlink': {
      pose = t => {
        const k = easeInOut(seg(t, 0.08, 0.85));
        return finish(mixPose(A, B, k, { item: () => easeInOut(seg(t, 0, 0.4)) }), t);
      };
      break;
    }
    case 'free':
    case 'tomb': {
      // the key nothing points at drops out (or lifts out of its slot); the rest close up
      const gone = [...A.items.keys()].filter(k => !B.items.has(k));
      const up = s.kind === 'tomb';
      pose = t => {
        const P = mixPose(A, B, easeInOut(seg(t, 0.3, 1)), {
          item: key => (gone.includes(key) ? smooth(0.5, 1, t) : easeInOut(seg(t, 0.35, 1))),
          link: key => (B.links.has(key) ? easeInOut(seg(t, 0.3, 1)) : smooth(0, 0.3, t)),
          tomb: () => smooth(0.45, 0.9, t),
        });
        for (const key of gone) {
          const it = P.items.get(key);
          if (!it) continue;
          if (up) it.y += 1.3 * easeOut(t);
          else it.y -= 2.4 * t * t;
          it.fill = mix3(it.fill, COL.red, 1 - seg(t, 0.7, 1));
        }
        glide(P, easeInOut(seg(t, 0.35, 1)), 0.1);
        return finish(P, t, [0.15, 0.3]);
      };
      break;
    }
    case 'full':
    case 'refuse':
      pose = t => {
        const P = mixPose(A, B, easeInOut(t));
        P.gauge.flash = Math.pow(Math.sin(Math.PI * seg(t, 0, 1) * 2), 2) * (1 - seg(t, 0.8, 1));
        P.ripples.push({ at: 'gauge', r: 0.6 + 1.4 * seg(t, 0.1, 0.9), a: (1 - seg(t, 0.1, 0.9)) * 0.6, col: COL.red });
        return finish(P, t, [0.15, 0.3]);
      };
      break;
    case 'grow': {
      // a clock of twice the hours rises around the old one, and the hand reaches out to it
      const fresh = [...B.rings.keys()].filter(k => !A.rings.has(k));
      const inner = Math.min(...[...A.rings.values()].map(r => r.r));
      pose = t => {
        const e = easeInOut(seg(t, 0.1, 0.8));
        const P = mixPose(A, B, easeInOut(seg(t, 0, 0.5)), {
          ring: key => (fresh.includes(key) ? e : easeInOut(seg(t, 0, 0.5))),
          plinth: easeInOut(seg(t, 0, 0.55)),
          hand: easeInOut(seg(t, 0.45, 0.95)),
        });
        for (const key of fresh) {
          const r = P.rings.get(key),
            b = B.rings.get(key);
          if (r && b) r.r = lerp(inner, b.r, easeOut(seg(t, 0.05, 0.85)));
        }
        return finish(P, t);
      };
      break;
    }
    case 'lift': {
      // every key rises out of the table, one bucket after another
      const keys = [...B.items.keys()];
      const order = new Map(keys.map((k, j) => [k, j / Math.max(1, keys.length)]));
      pose = t => {
        const P = mixPose(A, B, easeInOut(t), {
          item: key => easeInOut(seg(t, (order.get(key) ?? 0) * 0.45, (order.get(key) ?? 0) * 0.45 + 0.5)),
          link: key => (A.links.has(key) ? smooth(0, 0.25, t) : smooth(0.75, 1, t)),
        });
        for (const key of moving) {
          const a = A.items.get(key),
            b = B.items.get(key),
            d = order.get(key) ?? 0;
          if (a && b) put(P.items.get(key), travel(a, b, easeInOut(seg(t, d * 0.45, d * 0.45 + 0.5)), 0));
        }
        return finish(P, t);
      };
      break;
    }
    case 'rehash': {
      // back through the hub: the key flies in, the hand winds for the new table, and out it goes
      const id = s.focus ?? '';
      pose = t => {
        const kQ = easeInOut(seg(t, 0, 0.3));
        const P = mixPose(A, B, kQ, {
          item: key => (key === id ? smooth(0.7, 1, t) : kQ),
          link: key => (A.links.has(key) ? kQ : smooth(0.8, 1, t)),
          lit: smooth(0.62, 0.72, t),
          hand: 1,
        });
        const a = A.items.get(id),
          b = B.items.get(id);
        if (a && b) {
          const p =
            t < 0.3
              ? travel(a, HUB, easeInOut(seg(t, 0, 0.3)), 0.9)
              : t < 0.66
                ? { ...HUB }
                : travel(HUB, b, easeInOut(seg(t, 0.66, 1)), 1.1);
          put(P.items.get(id), p);
          const it = P.items.get(id);
          if (it) {
            const lit = fadeInOut(t, 0.22, 0.3, 0.66, 0.8);
            it.fill = mix3(it.fill, PAINT.new.fill, lit);
            it.glyph = mix3(it.glyph, PAINT.new.glyph, lit);
          }
        }
        windHand(P, A, t, s.wind ?? 0, m, 0.26, 0.34, 0.64);
        return finish(P, t, [0.4, 0.5], 0.9);
      };
      break;
    }
    case 'fountain': {
      // the rest of the keys, all at once: up over the hub and out to their new buckets
      const wave = s.wave ?? [];
      const n = Math.max(1, wave.length - 1);
      const start = (key: string) => (wave.indexOf(key) / n) * 0.55;
      pose = t => {
        const P = mixPose(A, B, easeInOut(t), {
          item: key => (wave.includes(key) ? 1 : easeInOut(t)),
          link: key => (A.links.has(key) ? smooth(0, 0.18, t) : smooth(0.82, 1, t)),
          ring: () => easeInOut(t),
          hand: 1,
        });
        for (const key of wave) {
          const a = A.items.get(key),
            b = B.items.get(key),
            it = P.items.get(key);
          if (!a || !b || !it) continue;
          const d = start(key),
            u = easeInOut(seg(t, d, d + 0.4));
          const top: P3 = { x: (a.x + b.x) * 0.12, y: Math.max(a.y, b.y) + 5.2, z: (a.z + b.z) * 0.12 };
          put(it, bez(a, top, b, u));
          const air = Math.min(1, 2 * Math.sin(Math.PI * u));
          it.fill = mix3(it.fill, PAINT.new.fill, air);
          it.glyph = mix3(it.glyph, PAINT.new.glyph, air);
        }
        // the hand spins while the keys pour through the hub
        const spin = easeInOut(seg(t, 0.02, 0.96));
        P.hand.ang = wrapAng(A.hand.ang + (angDelta(A.hand.ang, B.hand.ang) + 3 * TAU) * spin);
        return finish(P, t);
      };
      break;
    }
    case 'retire': {
      pose = t => {
        const e = easeInOut(t);
        return finish(mixPose(A, B, e, { ring: () => easeInOut(seg(t, 0, 0.85)) }), t);
      };
      break;
    }
    case 'put': {
      // a whole insert in one: onto the hub, wind, out to the bucket, along the slots, down
      const id = s.focus ?? '';
      const b = B.items.get(id);
      const chain = B.strategy === 'chain';
      const path = (s.path ?? []).map(j => {
        const c = Lay.bucketAt(m, j);
        return { x: c.x, y: Lay.SLOT_Y + Lay.HOVER_SLOT, z: c.z };
      });
      const home: P3 | null = chain ? (b ? { x: b.x, y: b.y + Lay.HOVER_CHAIN, z: b.z } : null) : (path[0] ?? null);
      const where = s.diag.items.find(it => it.id === id)?.place;
      const bucket = s.path?.[0] ?? (where?.at === 'bucket' ? where.index : -1);
      const lit = bucketRef(ringId(m), bucket);
      pose = t => {
        const kQ = easeInOut(seg(t, 0, 0.3));
        const P = mixPose(A, B, kQ, {
          item: key => (key === id ? Math.min(1, seg(t, 0, 0.12) * 6) : kQ),
          link: key => (A.links.has(key) ? kQ : smooth(0.8, 0.96, t)),
          tomb: () => smooth(0.85, 1, t),
          lit: 1,
          hand: 1,
        });
        const it = P.items.get(id);
        if (it && b && home) {
          let p: P3;
          if (t < 0.46) p = { ...HUB, y: HUB.y + (1 - bounce(seg(t, 0, 0.2))) * 2.2 };
          else if (t < 0.66) p = travel(HUB, home, easeInOut(seg(t, 0.46, 0.66)), 1.0);
          else if (!chain && path.length > 1 && t < 0.9) {
            const f = seg(t, 0.66, 0.9) * (path.length - 1),
              j = Math.min(path.length - 2, Math.floor(f));
            p = travel(path[j], path[j + 1], easeInOut(f - j), 0.3);
          } else {
            const from = chain ? home : path[path.length - 1];
            p = travel(from, b, easeOut(seg(t, chain ? 0.66 : 0.9, chain ? 0.84 : 1)), 0);
          }
          put(it, p);
          const y = 1 - smooth(0.84, 1, t);
          it.fill = mix3(it.fill, PAINT.new.fill, y);
          it.glyph = mix3(it.glyph, PAINT.new.glyph, y);
          it.rim = mix3(it.rim, PAINT.new.rim, y);
        }
        windHand(P, A, t, s.wind ?? 0, m, 0.1, 0.18, 0.46);
        // the spoke to its bucket lights while it flies out
        if (bucket >= 0)
          P.lits.set(lit, { key: lit, ring: ringId(m), index: bucket, a: fadeInOut(t, 0.44, 0.5, 0.7, 0.8) });
        pop(P, id, t, 0.86, 1, 0.12);
        return finish(P, t, [0.3, 0.42], 0.8);
      };
      break;
    }
    default:
      break;
  }
  return { dur, pose };
}

/** A plain blend between any two poses: seeking, replaying, switching table. */
export function morph(P0: Pose, P1: Pose, dur = 0.6): Transition<Pose> {
  return {
    dur,
    pose: t => {
      const e = easeInOut(t);
      const P = mixPose(P0, P1, e);
      for (const [key, b] of P1.items) {
        const a = P0.items.get(key);
        if (a && dist(a, b) > 1e-6) put(P.items.get(key), travel(a, b, e, Math.min(1.2, 0.2 * dist(a, b))));
      }
      return P;
    },
  };
}

/** Opening move: the buckets rise, the keys drop into them one by one, the pointers are tied, and the hand sweeps round. */
export function assemble(P1: Pose, reduced = false): Transition<Pose> {
  const keys = [...P1.items.keys()];
  const order = new Map(keys.map((k, i) => [k, i]));
  const n = Math.max(1, keys.length);
  const empty: Pose = {
    ...P1,
    items: new Map(),
    links: new Map(),
    tombs: new Map(),
    lits: new Map(),
    hand: { ang: 0, len: P1.hand.len },
    gauge: { ...P1.gauge, load: 0 },
  };
  const T: Timing = {
    item: key => Math.min(1, drop(key) * 4),
    link: key => {
      const to = P1.links.get(key)?.to ?? '';
      const d = ((order.get(to) ?? 0) / n) * 0.45 + 0.34;
      return smooth(d, d + 0.18, tNow);
    },
    ring: () => smooth(0, 0.3, tNow),
    tomb: () => smooth(0.7, 0.9, tNow),
    gauge: 1,
  };
  let tNow = 0;
  const drop = (key: string) => {
    const d = 0.15 + ((order.get(key) ?? 0) / n) * 0.45;
    return seg(tNow, d, d + 0.3);
  };
  return {
    dur: reduced ? 0.8 : 2.6,
    pose(t) {
      tNow = t;
      const P = mixPose(empty, P1, 1, T);
      for (const [key, r] of P.rings) {
        const a = seg(t, 0, 0.35);
        r.a = (P1.rings.get(key)?.a ?? 1) * a;
      }
      P.gauge.load = P1.gauge.load * easeInOut(seg(t, 0.2, 0.95));
      P.hand.ang = wrapAng(P1.hand.ang + TAU * (1 - easeInOut(seg(t, 0.1, 1))));
      for (const key of keys) {
        const it = P.items.get(key);
        if (it) it.y += (1 - (reduced ? drop(key) : bounce(drop(key)))) * 3;
      }
      return P;
    },
  };
}

/** How long each kind holds for reading while playing. */
export const HOLD: Readonly<Partial<Record<StepKind, number>>> = {
  hash: 0.45,
  jump: 0.3,
  compare: 0.15,
  hop: 0.1,
  link: 0.6,
  place: 0.6,
  found: 0.8,
  missing: 0.8,
  unlink: 0.4,
  free: 0.7,
  tomb: 0.9,
  full: 0.7,
  grow: 0.5,
  lift: 0.4,
  rehash: 0.35,
  fountain: 0.4,
  retire: 1.0,
  put: 0.1,
  refuse: 0.8,
  done: 1.2,
};

/** Reading time per character, by kind: quick steps are read at a glance. */
export const RATE: Readonly<Partial<Record<StepKind, number>>> = {
  compare: 0.003,
  hop: 0.003,
  put: 0.002,
  rehash: 0.004,
};
