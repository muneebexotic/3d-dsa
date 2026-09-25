// Poses. A pose says where every disc, slot, wire and label is at one instant.
// Every key has two places: its node in the tree and its cell in the array. The
// fold (0 = the array alone, 1 = the tree) says which one its disc is drawn at;
// in the tree, the array keeps a small copy of it in its cell. The rest pose after
// each step is laid out from that step's diagram; motion between two poses is a
// blend. No Three.js here, so it is unit-tested.

import { mix3, type RGB } from '../../core/color';
import { lerp } from '../../core/math';
import type { Program } from '../../core/player';
import type { DItem, Diagram, Recording, Step } from './diagram';
import { MAX_SIZE, outranks, type Order } from './heap';
import * as Lay from './layout';
import { COL, PAINT } from './palette';

export type P3 = Lay.P3;

export interface ItemPose {
  key: string;
  label: string;
  /** Dijkstra: the knot's letter, shown above the disc. */
  tag: string;
  /** Where it stands in the tree, and where it sits in the array. */
  t: P3;
  c: P3;
  /** 1 in the tree, 0 in the array. */
  f: number;
  /** Scale; 0 means gone. */
  s: number;
  /** 1 while it holds a cell in the array, where the tree view keeps a copy of it. */
  chip: number;
  /** The slot it rests in, or -1 on the out tray. */
  slot: number;
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
}

/** Slot i: a node of the tree and a cell of the array. */
export interface SlotPose {
  t: P3;
  c: P3;
  f: number;
  /** 0 while it appears or goes. */
  a: number;
  /** 1 if a key is in it. */
  used: number;
  /** 1 for the next free slot, where a push goes. */
  ghost: number;
  /** 1 while it glows as part of a group (the leaves). */
  lit: number;
}

/** The wire from a slot up to its parent, named by the child slot. */
export interface WirePose {
  c: number;
  /** 0 to 1: drawn from the parent down. */
  s: number;
  /** The child beats its parent: the order is broken here. */
  bad: number;
  /** Being checked. */
  hot: number;
  /** The wire to the next free slot. */
  ghost: number;
}

/** An arc over the array between two cells: the index arithmetic of a comparison. */
export interface ArcPose {
  key: string;
  a: number;
  b: number;
  s: number;
  col: RGB;
}

/** A thread from a node of the tree down to its cell in the array. */
export interface GuidePose {
  i: number;
  a: number;
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
  order: Order;
  items: Map<string, ItemPose>;
  slots: SlotPose[];
  wires: Map<number, WirePose>;
  /** Where the out tray starts, and how many places it shows. */
  trayX: number;
  tray: number;
  plinth: { x0: number; x1: number };
  arcs: Map<string, ArcPose>;
  guides: Map<number, GuidePose>;
  callout: Callout | null;
  ripples: Ripple[];
  focus: Focus | null;
}

export const PLINTH_Z0 = -1.4;
export const PLINTH_Z1 = Lay.OUT_Z + 0.8;

/* ---------------- layout ---------------- */

export function restPose(d: Diagram, s?: Step): Pose {
  const D = Lay.treeRows(d.n),
    f = d.view === 'tree' ? 1 : 0;
  const ghostAt = d.n < MAX_SIZE ? d.n : -1;
  const N = Math.max(Lay.room(D), ghostAt + 1);
  const bySlot = new Map<number, DItem>();
  for (const it of d.items) if (it.place.at === 'slot') bySlot.set(it.place.i, it);

  const slots: SlotPose[] = [];
  for (let i = 0; i < N; i++)
    slots.push({
      t: Lay.treeAt(i, D),
      c: Lay.cellAt(i, D),
      f,
      a: 1,
      used: i < d.n ? 1 : 0,
      ghost: i === ghostAt ? 1 : 0,
      lit: d.lit.includes(i) ? 1 : 0,
    });

  const items = new Map<string, ItemPose>();
  for (const it of d.items) {
    const P = PAINT[it.tone];
    const inSlot = it.place.at === 'slot';
    const t = it.place.at === 'slot' ? Lay.treeAt(it.place.i, D) : Lay.outAt(it.place.j, D);
    const c = it.place.at === 'slot' ? Lay.cellAt(it.place.i, D) : t;
    items.set(it.id, {
      key: it.id,
      label: String(it.key),
      tag: it.tag ?? '',
      t,
      c: { ...c },
      f: inSlot ? f : 0,
      s: 1,
      chip: inSlot ? 1 : 0,
      slot: it.place.at === 'slot' ? it.place.i : -1,
      fill: P.fill,
      glyph: P.glyph,
      rim: P.rim,
      rimW: P.rimW,
      halo: P.halo,
    });
  }

  const wires = new Map<number, WirePose>();
  if (d.wires)
    for (let c = 1; c < N; c++) {
      if (!(c < d.n || c === ghostAt)) continue;
      const kid = bySlot.get(c),
        par = bySlot.get((c - 1) >> 1);
      wires.set(c, {
        c,
        s: 1,
        bad: kid && par && outranks(d.order, kid, par) ? 1 : 0,
        hot: d.hot.includes(c) ? 1 : 0,
        ghost: c === ghostAt ? 1 : 0,
      });
    }

  // the comparison in hand: arcs over the array, threads from the tree, the sum
  const arcs = new Map<string, ArcPose>(),
    guides = new Map<number, GuidePose>();
  let callout: Callout | null = null;
  if (s && s.from != null && s.look?.length) {
    for (const j of s.look) {
      const key = `${Math.min(s.from, j)}-${Math.max(s.from, j)}`;
      arcs.set(key, { key, a: s.from, b: j, s: 1, col: COL.cobalt });
    }
    // one thread, from the moving key's node to its cell; the copies in the array carry the rest
    guides.set(s.from, { i: s.from, a: 1 });
    if (s.callout) {
      const far = s.look.reduce((m, j) => (Math.abs(j - (s.from ?? 0)) > Math.abs(m - (s.from ?? 0)) ? j : m));
      callout = { at: `arc:${s.from}:${far}`, text: s.callout.text, tone: s.callout.tone, a: 1 };
    }
  }

  const trayX = Lay.cellX(0, D) - Lay.CW / 2;
  const tray = Math.max(d.outN, 0);
  const W = Lay.treeWidth(D) / 2 + Lay.R + 0.4;
  const right = Math.max(Lay.cellX(N - 1, D) + Lay.CW / 2, trayX + tray * Lay.CW, W);
  const left = Math.min(trayX, -W);
  return {
    order: d.order,
    items,
    slots,
    wires,
    trayX,
    tray,
    plinth: { x0: left - 0.75, x1: right + 0.75 },
    arcs,
    guides,
    callout,
    ripples: [],
    focus: null,
  };
}

/* ---------------- blending ---------------- */

export const mixP = (a: P3, b: P3, k: number): P3 => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  z: lerp(a.z, b.z, k),
});

function mixItem(a: ItemPose, b: ItemPose, k: number): ItemPose {
  return {
    ...b,
    label: k < 0.5 ? a.label : b.label,
    t: mixP(a.t, b.t, k),
    c: mixP(a.c, b.c, k),
    f: lerp(a.f, b.f, k),
    s: lerp(a.s, b.s, k),
    chip: lerp(a.chip, b.chip, k),
    fill: mix3(a.fill, b.fill, k),
    glyph: mix3(a.glyph, b.glyph, k),
    rim: mix3(a.rim, b.rim, k),
    rimW: lerp(a.rimW, b.rimW, k),
    halo: lerp(a.halo, b.halo, k),
  };
}
const fadeItem = (b: ItemPose, k: number): ItemPose => ({ ...b, t: { ...b.t }, c: { ...b.c }, s: b.s * k });

function mixSlot(a: SlotPose, b: SlotPose, k: number): SlotPose {
  return {
    t: mixP(a.t, b.t, k),
    c: mixP(a.c, b.c, k),
    f: lerp(a.f, b.f, k),
    a: lerp(a.a, b.a, k),
    used: lerp(a.used, b.used, k),
    ghost: lerp(a.ghost, b.ghost, k),
    lit: lerp(a.lit, b.lit, k),
  };
}

/** Per-piece timing for a blend: each returns the blend amount for that piece. */
export interface Timing {
  item?: (key: string) => number;
  slot?: (i: number) => number;
  wire?: (c: number) => number;
  /** The comparison overlays: arcs, threads and the callout. */
  over?: number;
  tray?: number;
}

/** Blend two poses. Pieces in only one of them grow in or fade away. */
export function mixPose(A: Pose, B: Pose, k: number, T: Timing = {}): Pose {
  const items = new Map<string, ItemPose>();
  for (const [key, b] of B.items) {
    const a = A.items.get(key),
      kk = T.item ? T.item(key) : k;
    items.set(key, a ? mixItem(a, b, kk) : fadeItem(b, kk));
  }
  for (const [key, a] of A.items) if (!B.items.has(key)) items.set(key, fadeItem(a, 1 - (T.item ? T.item(key) : k)));

  const slots: SlotPose[] = [];
  for (let i = 0; i < Math.max(A.slots.length, B.slots.length); i++) {
    const a = A.slots[i],
      b = B.slots[i],
      kk = T.slot ? T.slot(i) : k;
    if (a && b) slots.push(mixSlot(a, b, kk));
    else if (b) slots.push({ ...b, a: b.a * kk });
    else slots.push({ ...a, a: a.a * (1 - kk) });
  }

  const wires = new Map<number, WirePose>();
  for (const [c, b] of B.wires) {
    const a = A.wires.get(c),
      kk = T.wire ? T.wire(c) : k;
    wires.set(
      c,
      a
        ? {
            c,
            s: lerp(a.s, b.s, kk),
            bad: lerp(a.bad, b.bad, kk),
            hot: lerp(a.hot, b.hot, kk),
            ghost: lerp(a.ghost, b.ghost, kk),
          }
        : { ...b, s: b.s * kk },
    );
  }
  for (const [c, a] of A.wires) if (!B.wires.has(c)) wires.set(c, { ...a, s: a.s * (1 - (T.wire ? T.wire(c) : k)) });

  const ko = T.over ?? k;
  const arcs = new Map<string, ArcPose>();
  for (const [key, b] of B.arcs) {
    const a = A.arcs.get(key);
    arcs.set(key, { ...b, s: a ? lerp(a.s, b.s, ko) : b.s * ko });
  }
  for (const [key, a] of A.arcs) if (!B.arcs.has(key)) arcs.set(key, { ...a, s: a.s * (1 - ko) });
  const guides = new Map<number, GuidePose>();
  for (const [i, b] of B.guides) {
    const a = A.guides.get(i);
    guides.set(i, { i, a: a ? lerp(a.a, b.a, ko) : b.a * ko });
  }
  for (const [i, a] of A.guides) if (!B.guides.has(i)) guides.set(i, { i, a: a.a * (1 - ko) });
  // the same sum stays put; a new one fades in after the old one fades out
  const ca = A.callout,
    cb = B.callout;
  const callout: Callout | null =
    ca && cb && ca.text === cb.text && ca.at === cb.at
      ? { ...cb, a: lerp(ca.a, cb.a, ko) }
      : ko < 0.5
        ? ca && { ...ca, a: ca.a * (1 - 2 * ko) }
        : cb && { ...cb, a: cb.a * (2 * ko - 1) };

  const kt = T.tray ?? k;
  return {
    order: k < 0.5 ? A.order : B.order,
    items,
    slots,
    wires,
    trayX: lerp(A.trayX, B.trayX, kt),
    tray: lerp(A.tray, B.tray, kt),
    plinth: { x0: lerp(A.plinth.x0, B.plinth.x0, kt), x1: lerp(A.plinth.x1, B.plinth.x1, kt) },
    arcs,
    guides,
    callout,
    ripples: [],
    focus: null,
  };
}

/* ---------------- programs ---------------- */

export interface HeapProgram extends Program<Step, Pose> {
  title: string;
  start: Diagram;
  ledger: number;
  intro?: { head: string; body: string };
  /** Rest poses, cached: rests[i + 1] is the pose after step i. */
  rests: Pose[];
}

export function makeProgram(rec: Recording): HeapProgram {
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
export function restAt(prog: HeapProgram, i: number): Pose {
  let P = prog.rests[i + 1];
  if (!P) {
    P = restPose(prog.steps[i].diag, prog.steps[i]);
    prog.rests[i + 1] = P;
  }
  return P;
}

/** Where a disc is drawn: between its cell and its node, by the fold. */
export const itemAt = (it: ItemPose): P3 => mixP(it.c, it.t, it.f);
