// Poses. A pose says where every disc, bucket, pointer and label is at one
// instant. The rest pose after each step is laid out from that step's diagram;
// motion between two poses is a blend. Pointers name what they point at, and the
// scene finds those things each frame, so a pointer never comes loose from its key.
// No Three.js here, so it is unit-tested.

import { mix3, type RGB } from '../../core/color';
import { lerp } from '../../core/math';
import type { Program } from '../../core/player';
import type { Diagram, Recording, Step } from './diagram';
import * as Lay from './layout';
import { PAINT } from './palette';
import type { Strategy } from './table';

export interface ItemPose {
  key: string;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Scale; 0 means gone. */
  s: number;
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
}

/** A clock face of buckets. */
export interface RingPose {
  key: string;
  m: number;
  r: number;
  /** 0 while it rises or sinks, 1 standing. */
  a: number;
  /** 1 for the ring the hand works on; its hours are marked on the hub. */
  live: number;
  /** Per bucket: 1 if something is in it, for the shading of empty buckets. */
  used: number[];
}

export interface LinkPose {
  key: string;
  from: string;
  /** What it points at; while k < 1 it is turning from `was` to `to`. */
  to: string;
  was: string;
  k: number;
  /** 0 to 1: grows from its origin. */
  s: number;
  hot: number;
  trail: number;
}

export interface TombPose {
  key: string;
  ring: string;
  index: number;
  a: number;
}

export interface HandPose {
  /** Radians from twelve o'clock, clockwise seen from above. */
  ang: number;
  len: number;
}

export interface GaugePose {
  n: number;
  m: number;
  /** The level shown, n / m, blended. */
  load: number;
  /** A pulse when the table passes three quarters full. */
  flash: number;
}

/** A lit spoke from the hub to a bucket. */
export interface LitPose {
  key: string;
  ring: string;
  index: number;
  a: number;
}

/** A bead running along a pointer. */
export interface Bead {
  link: string;
  u: number;
  a: number;
  r: number;
  col: RGB;
}
export interface Ripple {
  at: string;
  r: number;
  a: number;
  col: RGB;
}
export interface Callout {
  at: string;
  text: string;
  tone?: 'cobalt' | 'red' | 'ink';
  a: number;
}
export interface Focus {
  at: string;
  w: number;
}

export interface Pose {
  strategy: Strategy;
  items: Map<string, ItemPose>;
  rings: Map<string, RingPose>;
  links: Map<string, LinkPose>;
  tombs: Map<string, TombPose>;
  lits: Map<string, LitPose>;
  hand: HandPose;
  gauge: GaugePose;
  plinthR: number;
  beads: Bead[];
  ripples: Ripple[];
  callout: Callout | null;
  focus: Focus | null;
}

/* ---------------- layout ---------------- */

const TAU = Math.PI * 2;
/** An angle folded into [0, 2π). */
export const wrapAng = (a: number): number => ((a % TAU) + TAU) % TAU;
/** The short way from angle a to angle b. */
export const angDelta = (a: number, b: number): number => {
  let d = wrapAng(b) - wrapAng(a);
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** The rest pose for a diagram. */
export function restPose(d: Diagram): Pose {
  const chain = d.strategy === 'chain';
  const mOf = new Map(d.rings.map(r => [r.id, r.m]));
  const rings = new Map<string, RingPose>();
  for (const r of d.rings)
    rings.set(r.id, {
      key: r.id,
      m: r.m,
      r: Lay.ringRadius(r.m),
      a: 1,
      live: r.role === 'live' ? 1 : 0,
      used: Array.from({ length: r.m }, () => 0),
    });

  const items = new Map<string, ItemPose>();
  for (const it of d.items) {
    const P = PAINT[it.tone];
    let x = 0,
      y = Lay.HUB_Y,
      z = 0;
    const p = it.place;
    if (p.at === 'bucket') {
      const b = Lay.bucketAt(mOf.get(p.ring) ?? d.m, p.index);
      x = b.x;
      z = b.z;
      y = Lay.levelY(chain, p.level);
      if (p.hover) y += chain ? Lay.HOVER_CHAIN : Lay.HOVER_SLOT;
      if (p.lifted) y += Lay.LIFT;
      const ring = rings.get(p.ring);
      if (ring && !p.hover && !p.lifted) ring.used[p.index] = 1;
    }
    items.set(it.id, {
      key: it.id,
      label: String(it.key),
      x,
      y,
      z,
      s: 1,
      fill: P.fill,
      glyph: P.glyph,
      rim: P.rim,
      rimW: P.rimW,
      halo: P.halo,
    });
  }

  const links = new Map<string, LinkPose>();
  for (const l of d.links)
    links.set(l.id, {
      key: l.id,
      from: l.from,
      to: l.to,
      was: l.to,
      k: 1,
      s: 1,
      hot: l.hot ? 1 : 0,
      trail: l.trail ? 1 : 0,
    });

  const tombs = new Map<string, TombPose>();
  for (const t of d.tombs) {
    tombs.set(t.id, { key: t.id, ring: t.ring, index: t.index, a: 1 });
    const ring = rings.get(t.ring);
    if (ring) ring.used[t.index] = 1;
  }

  const lits = new Map<string, LitPose>();
  if (d.lit) {
    const [, ring, idx] = d.lit.split(':');
    lits.set(d.lit, { key: d.lit, ring, index: Number(idx), a: 1 });
  }

  const outer = Math.max(...[...rings.values()].map(r => r.r));
  return {
    strategy: d.strategy,
    items,
    rings,
    links,
    tombs,
    lits,
    hand: { ang: (d.hand / d.m) * TAU, len: Lay.handLength(d.m) },
    gauge: { n: d.n, m: d.m, load: d.n / d.m, flash: 0 },
    plinthR: Lay.plinthRadius(outer),
    beads: [],
    ripples: [],
    callout: null,
    focus: null,
  };
}

/* ---------------- blending ---------------- */

/** Where a pointer points while it turns from `was` to `to`. */
export const effTarget = (l: { to: string; was: string; k: number }): string => (l.k >= 0.5 ? l.to : l.was);

function mixItem(a: ItemPose, b: ItemPose, k: number): ItemPose {
  return {
    ...b,
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    z: lerp(a.z, b.z, k),
    s: lerp(a.s, b.s, k),
    fill: mix3(a.fill, b.fill, k),
    glyph: mix3(a.glyph, b.glyph, k),
    rim: mix3(a.rim, b.rim, k),
    rimW: lerp(a.rimW, b.rimW, k),
    halo: lerp(a.halo, b.halo, k),
  };
}
const appearItem = (b: ItemPose, k: number): ItemPose => ({ ...b, s: b.s * k });

function mixRing(a: RingPose, b: RingPose, k: number): RingPose {
  return {
    ...b,
    r: lerp(a.r, b.r, k),
    a: lerp(a.a, b.a, k),
    live: lerp(a.live, b.live, k),
    used: b.used.map((u, i) => lerp(a.used[i] ?? u, u, k)),
  };
}

function mixLink(a: LinkPose, b: LinkPose, k: number): LinkPose {
  const from = effTarget(a);
  const turning = from !== b.to;
  return {
    ...b,
    was: turning ? from : b.to,
    k: turning ? k : 1,
    s: lerp(a.s, b.s, k),
    hot: lerp(a.hot, b.hot, k),
    trail: lerp(a.trail, b.trail, k),
  };
}

/** Per-piece timing for a blend: each returns the blend amount for that piece. */
export interface Timing {
  item?: (key: string) => number;
  link?: (key: string) => number;
  ring?: (key: string) => number;
  tomb?: (key: string) => number;
  lit?: number;
  hand?: number;
  gauge?: number;
  plinth?: number;
}

/**
 * Blend two poses. Pieces in only one of them grow in or shrink away. Overlays
 * (beads, ripples, callout, focus) are never blended: each motion adds its own.
 */
export function mixPose(A: Pose, B: Pose, k: number, T: Timing = {}): Pose {
  const items = new Map<string, ItemPose>();
  for (const [key, b] of B.items) {
    const a = A.items.get(key),
      kk = T.item ? T.item(key) : k;
    items.set(key, a ? mixItem(a, b, kk) : appearItem(b, kk));
  }
  for (const [key, a] of A.items) if (!B.items.has(key)) items.set(key, appearItem(a, 1 - (T.item ? T.item(key) : k)));

  const rings = new Map<string, RingPose>();
  for (const [key, b] of B.rings) {
    const a = A.rings.get(key),
      kk = T.ring ? T.ring(key) : k;
    rings.set(key, a ? mixRing(a, b, kk) : { ...b, a: b.a * kk, live: b.live * kk });
  }
  for (const [key, a] of A.rings)
    if (!B.rings.has(key)) {
      const kk = 1 - (T.ring ? T.ring(key) : k);
      rings.set(key, { ...a, a: a.a * kk, live: a.live * kk });
    }

  const links = new Map<string, LinkPose>();
  for (const [key, b] of B.links) {
    const a = A.links.get(key),
      kk = T.link ? T.link(key) : k;
    links.set(key, a ? mixLink(a, b, kk) : { ...b, s: b.s * kk });
  }
  for (const [key, a] of A.links)
    if (!B.links.has(key)) links.set(key, { ...a, s: a.s * (1 - (T.link ? T.link(key) : k)) });

  const tombs = new Map<string, TombPose>();
  for (const [key, b] of B.tombs) {
    const a = A.tombs.get(key),
      kk = T.tomb ? T.tomb(key) : k;
    tombs.set(key, { ...b, a: a ? lerp(a.a, b.a, kk) : b.a * kk });
  }
  for (const [key, a] of A.tombs)
    if (!B.tombs.has(key)) tombs.set(key, { ...a, a: a.a * (1 - (T.tomb ? T.tomb(key) : k)) });

  const kl = T.lit ?? k;
  const lits = new Map<string, LitPose>();
  for (const [key, b] of B.lits) {
    const a = A.lits.get(key);
    lits.set(key, { ...b, a: a ? lerp(a.a, b.a, kl) : b.a * kl });
  }
  for (const [key, a] of A.lits) if (!B.lits.has(key)) lits.set(key, { ...a, a: a.a * (1 - kl) });

  const kh = T.hand ?? k,
    kg = T.gauge ?? k;
  return {
    strategy: k < 0.5 ? A.strategy : B.strategy,
    items,
    rings,
    links,
    tombs,
    lits,
    hand: { ang: wrapAng(A.hand.ang + angDelta(A.hand.ang, B.hand.ang) * kh), len: lerp(A.hand.len, B.hand.len, kh) },
    gauge: {
      n: kg < 0.5 ? A.gauge.n : B.gauge.n,
      m: kg < 0.5 ? A.gauge.m : B.gauge.m,
      load: lerp(A.gauge.load, B.gauge.load, kg),
      flash: lerp(A.gauge.flash, B.gauge.flash, kg),
    },
    plinthR: lerp(A.plinthR, B.plinthR, T.plinth ?? k),
    beads: [],
    ripples: [],
    callout: null,
    focus: null,
  };
}

/* ---------------- programs ---------------- */

export interface HashProgram extends Program<Step, Pose> {
  title: string;
  start: Diagram;
  ledger: number;
  intro?: { head: string; body: string };
  /** Rest poses, cached: rests[i + 1] is the pose after step i. */
  rests: Pose[];
}

export function makeProgram(rec: Recording): HashProgram {
  const startPose = restPose(rec.start);
  return {
    title: rec.title,
    steps: rec.steps,
    start: rec.start,
    ledger: rec.ledger,
    intro: rec.intro,
    startPose,
    rests: [startPose],
  };
}

/** The rest pose after step i (i = -1: before the first step). */
export function restAt(prog: HashProgram, i: number): Pose {
  let P = prog.rests[i + 1];
  if (!P) {
    P = restPose(prog.steps[i].diag);
    prog.rests[i + 1] = P;
  }
  return P;
}
