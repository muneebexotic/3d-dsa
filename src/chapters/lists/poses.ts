// Poses. A pose says where every disc, cell, pointer and label is at one instant.
// The rest pose after each step is laid out from that step's diagram; motion
// between two poses is a blend. Pointers and labels name what they point at, and
// the scene finds those things each frame, so a pointer never comes loose from
// its node. No Three.js here, so it is unit-tested.

import { mix3, type RGB } from '../../core/color';
import { lerp } from '../../core/math';
import type { Program } from '../../core/player';
import {
  type DBlock,
  type DFlag,
  type Diagram,
  type DItem,
  type Recording,
  type Step,
  type Structure,
  type WireRole,
} from './diagram';
import * as Lay from './layout';
import { addrText } from './memory';
import { KNOT_PAINT, PAINT } from './palette';

export interface ItemPose {
  key: string;
  label: string;
  /** Where it stands in the ordinary view. */
  x: number;
  y: number;
  z: number;
  /** Where it stands in memory view. */
  mx: number;
  my: number;
  mz: number;
  /** Scale; 0 means gone. */
  s: number;
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
  /** Stands on a peg (list nodes). */
  peg: number;
  addr: string;
  addrA: number;
}

export type WireShape = 'chain' | 'stack';
/** Which way a pointer turns when it changes target: the short way, or round through the front or back. */
export type Via = 'short' | 'front' | 'back';

export interface WirePose {
  key: string;
  from: string;
  role: WireRole;
  shape: WireShape;
  /** What it points at; while k < 1 it is turning from `was` to `to`. */
  to: string | null;
  was: string | null;
  k: number;
  via: Via;
  s: number;
  /** Which way a null pointer's stub leans (+1 right, -1 left), for `to` and for `was`. */
  nd: number;
  wnd: number;
  /** Being written: thick cobalt. */
  hot: number;
  /** Followed during this operation: cobalt. */
  trail: number;
}

/** A point in both views. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  mx: number;
  my: number;
  mz: number;
}

export type FlagSide = 'below' | 'above' | 'left' | 'radial';

export interface FlagPose {
  key: string;
  label: string;
  kind: 'field' | 'var';
  side: FlagSide;
  to: string | null;
  was: string | null;
  k: number;
  /** Where the arrow ends when it points at null. */
  nul: Spot | null;
  wnul: Spot | null;
  a: number;
  /** Stacking: labels on the same target sit one above another (lvl) or side by side (off). */
  lvl: number;
  off: number;
}

export interface BlockPose {
  key: string;
  kind: 'array' | 'ring';
  cap: number;
  len: number;
  base: number;
  /** The top centre of each cell, in both views. */
  cells: Spot[];
  a: number;
  /** Ring buffers: the centre of the ring, for labels that stand outside it. */
  centre: { x: number; z: number } | null;
}

export interface KnotPose {
  key: string;
  label: string;
  x: number;
  z: number;
  s: number;
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
}
export interface EdgePose {
  key: string;
  a: string;
  b: string;
  hl: number;
  s: number;
}
export interface NetPose {
  knots: Map<string, KnotPose>;
  edges: Map<string, EdgePose>;
  a: number;
}

export interface Rect {
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export interface TrayPose {
  label: string;
  x: number;
  z: number;
  mx: number;
  mz: number;
  a: number;
}

/** A bead running along a pointer (wire) or leaping from one cell to another (jump). */
export interface Bead {
  kind: 'wire' | 'jump';
  wire?: string;
  from: string;
  to: string;
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
  structure: Structure;
  items: Map<string, ItemPose>;
  wires: Map<string, WirePose>;
  flags: Map<string, FlagPose>;
  blocks: Map<string, BlockPose>;
  net: NetPose | null;
  tray: TrayPose | null;
  /** The stack's upright rod. */
  stand: { h: number; a: number } | null;
  /** The memory floor applies to this structure (lists and stacks). */
  grid: number;
  plinth: Rect;
  mplinth: Rect;
  beads: Bead[];
  ripples: Ripple[];
  callout: Callout | null;
  focus: Focus | null;
}

/* ---------------- layout ---------------- */

const FIELD_ORDER = ['HEAD', 'TAIL', 'TOP', 'FRONT', 'BACK'];
const VAR_ORDER = ['CUR', 'GONE', 'PREV', 'NEXT', 'NODE', 'I', 'J', 'L', 'R'];
const rank = (id: string) => {
  const i = FIELD_ORDER.indexOf(id);
  return i >= 0 ? i : 10 + Math.max(0, VAR_ORDER.indexOf(id));
};

/** Where the stack's or queue's tray starts, in both views: in front of the column or the ring. */
function trayAnchor(structure: Structure): { x: number; z: number; mx: number; mz: number } {
  if (structure === 'stack') return { x: Lay.STACK_X + 0.4, z: 2.3, mx: -3.4, mz: Lay.MEM_D / 2 + 1.4 };
  const x = Lay.RING_X - 2.4;
  return { x, z: Lay.RING_R + 2.55, mx: x, mz: 2.9 };
}

function blockPose(b: DBlock): BlockPose {
  const cells: Spot[] = [];
  const line = (i: number) => (i - (b.cap - 1) / 2) * Lay.CW;
  if (b.kind === 'ring') {
    for (let i = 0; i < b.cap; i++) {
      const phi = (i / b.cap) * Math.PI * 2;
      cells.push({
        x: Lay.RING_X + Lay.RING_R * Math.sin(phi),
        y: Lay.CELL_H,
        z: -Lay.RING_R * Math.cos(phi),
        mx: Lay.RING_X + line(i),
        my: Lay.CELL_H,
        mz: 0,
      });
    }
  } else {
    const z = b.row ? Lay.ROW_Z : 0;
    for (let i = 0; i < b.cap; i++) cells.push({ x: line(i), y: Lay.CELL_H, z, mx: line(i), my: Lay.CELL_H, mz: z });
  }
  return {
    key: b.id,
    kind: b.kind,
    cap: b.cap,
    len: b.len,
    base: b.base,
    cells,
    a: 1,
    centre: b.kind === 'ring' ? { x: Lay.RING_X, z: 0 } : null,
  };
}

function paintItem(it: DItem, at: Spot, peg: number, s = 1): ItemPose {
  const P = PAINT[it.tone];
  return {
    key: it.id,
    label: it.label,
    x: at.x,
    y: at.y,
    z: at.z,
    mx: at.mx,
    my: at.my,
    mz: at.mz,
    s,
    fill: P.fill,
    glyph: P.glyph,
    rim: P.rim,
    rimW: P.rimW,
    halo: P.halo,
    peg,
    addr: it.addr != null ? addrText(it.addr) : '',
    addrA: it.addr != null ? 1 : 0,
  };
}

const extent = (xs: number[]) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0]);

/** The rest pose for a diagram. */
export function restPose(d: Diagram): Pose {
  const items = new Map<string, ItemPose>(),
    wires = new Map<string, WirePose>(),
    flags = new Map<string, FlagPose>(),
    blocks = new Map<string, BlockPose>();
  for (const b of d.blocks) blocks.set(b.id, blockPose(b));

  // the chain is centred on the nodes that are in line
  const chain = d.items.filter(i => i.place.at === 'chain');
  const slotOf = (i: DItem) => (i.place.at === 'chain' ? i.place.slot : 0);
  const inline = chain.filter(i => i.place.at === 'chain' && !i.place.loose);
  const [s0, s1] = extent((inline.length ? inline : chain).map(slotOf));
  const [a0, a1] = extent(chain.map(slotOf));
  const c = (s0 + s1) / 2;
  const tray = trayAnchor(d.structure);

  for (const it of d.items) {
    const p = it.place;
    const mem = it.addr != null ? Lay.memPos(it.addr) : null;
    if (p.at === 'chain') {
      const x = (p.slot - c) * Lay.SX,
        z = p.loose ? Lay.LOOSE_Z : 0;
      items.set(it.id, paintItem(it, { x, y: Lay.DISC_Y, z, mx: mem?.x ?? x, my: Lay.DISC_Y, mz: mem?.z ?? z }, 1));
    } else if (p.at === 'stack') {
      const y = Lay.STACK_Y0 + p.level * Lay.LV + (p.hover ? Lay.HOVER : 0);
      items.set(
        it.id,
        paintItem(
          it,
          {
            x: Lay.STACK_X,
            y,
            z: 0,
            mx: mem?.x ?? Lay.STACK_X,
            my: Lay.DISC_Y + (p.hover ? Lay.HOVER : 0),
            mz: mem?.z ?? 0,
          },
          0,
        ),
      );
    } else if (p.at === 'cell') {
      const cell = blocks.get(p.block)?.cells[p.index];
      if (!cell) continue;
      const y = cell.y + Lay.R + 0.04;
      items.set(
        it.id,
        paintItem(it, { x: cell.x, y, z: cell.z, mx: cell.mx, my: cell.my + Lay.R + 0.04, mz: cell.mz }, 0),
      );
    } else {
      const x = tray.x + p.index * Lay.TRAY_PITCH,
        mx = tray.mx + p.index * Lay.TRAY_PITCH;
      items.set(it.id, paintItem(it, { x, y: Lay.TRAY_Y, z: tray.z, mx, my: Lay.TRAY_Y, mz: tray.mz }, 0, Lay.TRAY_S));
    }
  }

  const shape: WireShape = d.structure === 'stack' ? 'stack' : 'chain';
  // a null pointer's stub leans away from the neighbour on that side, if there is one
  const taken = new Set(inline.map(slotOf));
  const itemOf = new Map(d.items.map(i => [i.id, i]));
  const nullDir = (from: string, role: WireRole): number => {
    const it = itemOf.get(from);
    if (!it || it.place.at !== 'chain') return 1;
    const s = it.place.slot;
    return role === 'next' ? (taken.has(s + 1) ? -1 : 1) : taken.has(s - 1) ? 1 : -1;
  };
  for (const w of d.wires) {
    const nd = nullDir(w.from, w.role);
    wires.set(w.id, {
      key: w.id,
      from: w.from,
      role: w.role,
      shape,
      to: w.to,
      was: w.to,
      k: 1,
      via: 'short',
      s: 1,
      nd,
      wnd: nd,
      hot: w.hot ? 1 : 0,
      trail: w.trail ? 1 : 0,
    });
  }

  // null spots for named pointers
  const memL = -Lay.MEM_W / 2 - 0.9,
    memR = Lay.MEM_W / 2 + 0.9;
  const nullSpot = (f: DFlag): Spot | null => {
    if (f.to != null) return null;
    if (f.nullAt === 'base')
      return { x: Lay.STACK_X, y: Lay.STACK_Y0 - Lay.R - 0.1, z: 0, mx: memL, my: Lay.DISC_Y, mz: 0 };
    const left = f.nullAt === 'left';
    const x = ((left ? a0 : a1) - c + (left ? -0.9 : 0.9)) * Lay.SX;
    const y = sideOf() === 'above' ? Lay.DISC_Y + Lay.R : Lay.DISC_Y - Lay.R;
    return { x: chain.length ? x : left ? -1.1 : 1.1, y, z: 0, mx: left ? memL : memR, my: y, mz: 0 };
  };
  // list pointers stand in front of the chain, so the space above each node is free for its wire to swing
  const sideOf = (): FlagSide =>
    d.structure === 'stack' ? 'left' : d.structure === 'queue' ? 'radial' : d.structure === 'array' ? 'above' : 'below';
  // flags that share a target stack up (vars) or stand side by side (fields)
  const groups = new Map<string, DFlag[]>();
  for (const f of [...d.flags].sort((p, q) => rank(p.id) - rank(q.id))) {
    const g = `${sideOf()}|${f.to ?? `null:${f.nullAt}`}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)?.push(f);
  }
  for (const g of groups.values())
    g.forEach((f, i) => {
      const side = sideOf();
      flags.set(f.id, {
        key: f.id,
        label: f.label,
        kind: f.kind,
        side,
        to: f.to,
        was: f.to,
        k: 1,
        nul: nullSpot(f),
        wnul: nullSpot(f),
        a: 1,
        lvl: side === 'above' ? i : 0,
        off: side === 'above' ? 0 : (i - (g.length - 1) / 2) * 1.12,
      });
    });

  let net: NetPose | null = null;
  if (d.net) {
    const knots = new Map<string, KnotPose>(),
      edges = new Map<string, EdgePose>();
    d.net.knots.forEach((k, i) => {
      const P = KNOT_PAINT[k.st],
        [x, z] = Lay.NET_LAYOUT[i];
      const nx = d.structure === 'queue' ? Lay.NET_X_RING : Lay.NET_X;
      knots.set(k.id, { key: k.id, label: k.label, x: nx + x * Lay.NET_SCALE, z: z * Lay.NET_SCALE, s: 1, ...P });
    });
    for (const e of d.net.edges) {
      const key = `${e.a}-${e.b}`;
      edges.set(key, { key, a: e.a, b: e.b, hl: e.hot ? 1 : 0, s: 1 });
    }
    net = { knots, edges, a: 1 };
  }

  const pose: Pose = {
    structure: d.structure,
    items,
    wires,
    flags,
    blocks,
    net,
    tray: d.tray ? { label: d.tray, ...tray, a: 1 } : null,
    stand: d.structure === 'stack' ? { h: Lay.STACK_Y0 + Math.max(3, stackHeight(d)) * Lay.LV, a: 1 } : null,
    grid: d.structure === 'singly' || d.structure === 'doubly' || d.structure === 'stack' ? 1 : 0,
    plinth: { cx: 0, cz: 0, w: 8, d: 5 },
    mplinth: { cx: 0, cz: 0, w: 8, d: 5 },
    beads: [],
    ripples: [],
    callout: null,
    focus: null,
  };
  pose.plinth = plinthFor(pose, false);
  pose.mplinth = plinthFor(pose, true);
  return pose;
}

function stackHeight(d: Diagram): number {
  let h = 0;
  for (const i of d.items) if (i.place.at === 'stack') h = Math.max(h, i.place.level + 1);
  return h;
}

/** The plinth under everything, in one view. */
function plinthFor(P: Pose, mem: boolean): Rect {
  const xs: number[] = [],
    zs: number[] = [];
  const add = (x: number, z: number, m = 0.9) => {
    xs.push(x - m, x + m);
    zs.push(z - m, z + m);
  };
  for (const it of P.items.values()) add(mem ? it.mx : it.x, mem ? it.mz : it.z);
  for (const b of P.blocks.values())
    for (const c of b.cells) add(mem ? c.mx : c.x, mem ? c.mz : c.z, b.kind === 'ring' && !mem ? 1.6 : 0.9);
  if (P.tray) {
    const x = mem ? P.tray.mx : P.tray.x,
      z = mem ? P.tray.mz : P.tray.z;
    add(x - 1, z);
    add(x + (Lay.TRAY_SLOTS - 1) * Lay.TRAY_PITCH, z);
  }
  if (P.net) for (const k of P.net.knots.values()) add(k.x, k.z, 1.3);
  if (P.stand) add(Lay.STACK_X, 0, 1.8);
  if (mem && P.grid) {
    add(-Lay.MEM_W / 2, -Lay.MEM_D / 2, 0.4);
    add(Lay.MEM_W / 2, Lay.MEM_D / 2, 0.4);
  }
  // room for HEAD and TAIL in front, and for null ends
  const [x0, x1] = extent(xs),
    [z0, z1] = extent(zs);
  const front = P.structure === 'singly' || P.structure === 'doubly' ? 1.4 : P.structure === 'queue' ? 1.3 : 0.6;
  const w = Math.max(8, x1 - x0 + 1.4),
    d = Math.max(5, z1 - z0 + front + 0.6);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1 + front) / 2, w, d };
}

/* ---------------- blending ---------------- */

/** Where a wire or flag points while it turns from `was` to `to`. */
export const effTarget = (w: { to: string | null; was: string | null; k: number }): string | null =>
  w.k >= 0.5 ? w.to : w.was;

function mixItem(a: ItemPose, b: ItemPose, k: number): ItemPose {
  return {
    ...b,
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    z: lerp(a.z, b.z, k),
    mx: lerp(a.mx, b.mx, k),
    my: lerp(a.my, b.my, k),
    mz: lerp(a.mz, b.mz, k),
    s: lerp(a.s, b.s, k),
    fill: mix3(a.fill, b.fill, k),
    glyph: mix3(a.glyph, b.glyph, k),
    rim: mix3(a.rim, b.rim, k),
    rimW: lerp(a.rimW, b.rimW, k),
    halo: lerp(a.halo, b.halo, k),
    peg: lerp(a.peg, b.peg, k),
    label: k < 0.5 ? a.label : b.label,
    addr: b.addr || a.addr,
    addrA: lerp(a.addrA, b.addrA, k),
  };
}
const appearItem = (b: ItemPose, k: number): ItemPose => ({ ...b, s: b.s * k, addrA: b.addrA * k });

function mixWire(a: WirePose, b: WirePose, k: number, via: Via): WirePose {
  const from = effTarget(a),
    fromNd = a.k >= 0.5 ? a.nd : a.wnd;
  const turning = from !== b.to || (from == null && fromNd !== b.nd);
  return {
    ...b,
    was: turning ? from : b.to,
    wnd: turning ? fromNd : b.nd,
    k: turning ? k : 1,
    via: turning ? via : 'short',
    s: lerp(a.s, b.s, k),
    hot: lerp(a.hot, b.hot, k),
    trail: lerp(a.trail, b.trail, k),
  };
}

function mixFlag(a: FlagPose, b: FlagPose, k: number): FlagPose {
  const from = effTarget(a);
  const wasNul = a.k >= 0.5 ? a.nul : a.wnul;
  const turning = from !== b.to || (from == null && !sameSpot(wasNul, b.nul));
  return {
    ...b,
    was: turning ? from : b.to,
    wnul: turning ? wasNul : b.nul,
    k: turning ? k : 1,
    a: lerp(a.a, b.a, k),
    lvl: lerp(a.lvl, b.lvl, k),
    off: lerp(a.off, b.off, k),
  };
}
const sameSpot = (p: Spot | null, q: Spot | null) =>
  !!p && !!q && p.x === q.x && p.y === q.y && p.z === q.z && p.mx === q.mx && p.mz === q.mz;

function mixBlock(a: BlockPose, b: BlockPose, k: number): BlockPose {
  return {
    ...b,
    cells: b.cells.map((c, i) => {
      const o = a.cells[i] ?? c;
      return {
        x: lerp(o.x, c.x, k),
        y: lerp(o.y, c.y, k),
        z: lerp(o.z, c.z, k),
        mx: lerp(o.mx, c.mx, k),
        my: lerp(o.my, c.my, k),
        mz: lerp(o.mz, c.mz, k),
      };
    }),
    a: lerp(a.a, b.a, k),
    len: k < 0.5 ? a.len : b.len,
  };
}

function mixNetPose(A: NetPose | null, B: NetPose | null, k: number): NetPose | null {
  if (!A && !B) return null;
  if (!A || !B) {
    const N = (A ?? B) as NetPose,
      a = A ? 1 - k : k;
    return { ...N, a: N.a * a };
  }
  const knots = new Map<string, KnotPose>();
  for (const [key, b] of B.knots) {
    const a = A.knots.get(key) ?? b;
    knots.set(key, {
      ...b,
      x: lerp(a.x, b.x, k),
      z: lerp(a.z, b.z, k),
      s: lerp(a.s, b.s, k),
      fill: mix3(a.fill, b.fill, k),
      glyph: mix3(a.glyph, b.glyph, k),
      rim: mix3(a.rim, b.rim, k),
      rimW: lerp(a.rimW, b.rimW, k),
      halo: lerp(a.halo, b.halo, k),
    });
  }
  const edges = new Map<string, EdgePose>();
  for (const [key, b] of B.edges) {
    const a = A.edges.get(key) ?? b;
    edges.set(key, { ...b, hl: lerp(a.hl, b.hl, k), s: lerp(a.s, b.s, k) });
  }
  return { knots, edges, a: lerp(A.a, B.a, k) };
}

const mixRect = (a: Rect, b: Rect, k: number): Rect => ({
  cx: lerp(a.cx, b.cx, k),
  cz: lerp(a.cz, b.cz, k),
  w: lerp(a.w, b.w, k),
  d: lerp(a.d, b.d, k),
});

/** Per-piece timing for a blend: each returns the blend amount for that piece. */
export interface Timing {
  item?: (key: string) => number;
  wire?: (key: string) => number;
  flag?: (key: string) => number;
  block?: (key: string) => number;
  /** Which way turning wires go. */
  via?: (w: WirePose) => Via;
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

  const wires = new Map<string, WirePose>();
  for (const [key, b] of B.wires) {
    const a = A.wires.get(key),
      kk = T.wire ? T.wire(key) : k;
    wires.set(key, a ? mixWire(a, b, kk, T.via ? T.via(b) : 'short') : { ...b, s: b.s * kk });
  }
  for (const [key, a] of A.wires)
    if (!B.wires.has(key)) wires.set(key, { ...a, s: a.s * (1 - (T.wire ? T.wire(key) : k)) });

  const flags = new Map<string, FlagPose>();
  for (const [key, b] of B.flags) {
    const a = A.flags.get(key),
      kk = T.flag ? T.flag(key) : k;
    flags.set(key, a ? mixFlag(a, b, kk) : { ...b, a: b.a * kk });
  }
  for (const [key, a] of A.flags)
    if (!B.flags.has(key)) flags.set(key, { ...a, a: a.a * (1 - (T.flag ? T.flag(key) : k)) });

  const blocks = new Map<string, BlockPose>();
  for (const [key, b] of B.blocks) {
    const a = A.blocks.get(key),
      kk = T.block ? T.block(key) : k;
    blocks.set(key, a ? mixBlock(a, b, kk) : { ...b, a: b.a * kk });
  }
  for (const [key, a] of A.blocks)
    if (!B.blocks.has(key)) blocks.set(key, { ...a, a: a.a * (1 - (T.block ? T.block(key) : k)) });

  const tray =
    A.tray && B.tray
      ? { ...B.tray, x: lerp(A.tray.x, B.tray.x, k), z: lerp(A.tray.z, B.tray.z, k), a: lerp(A.tray.a, B.tray.a, k) }
      : B.tray
        ? { ...B.tray, a: B.tray.a * k }
        : A.tray
          ? { ...A.tray, a: A.tray.a * (1 - k) }
          : null;
  const stand =
    A.stand && B.stand
      ? { h: lerp(A.stand.h, B.stand.h, k), a: lerp(A.stand.a, B.stand.a, k) }
      : B.stand
        ? { ...B.stand, a: B.stand.a * k }
        : A.stand
          ? { ...A.stand, a: A.stand.a * (1 - k) }
          : null;
  return {
    structure: k < 0.5 ? A.structure : B.structure,
    items,
    wires,
    flags,
    blocks,
    net: mixNetPose(A.net, B.net, k),
    tray,
    stand,
    grid: lerp(A.grid, B.grid, k),
    plinth: mixRect(A.plinth, B.plinth, k),
    mplinth: mixRect(A.mplinth, B.mplinth, k),
    beads: [],
    ripples: [],
    callout: null,
    focus: null,
  };
}

/* ---------------- programs ---------------- */

export interface ListProgram extends Program<Step, Pose> {
  title: string;
  start: Diagram;
  intro?: { head: string; body: string };
  /** Rest poses, cached: rests[i + 1] is the pose after step i. */
  rests: Pose[];
}

export function makeProgram(rec: Recording): ListProgram {
  const startPose = restPose(rec.start);
  return { title: rec.title, steps: rec.steps, start: rec.start, intro: rec.intro, startPose, rests: [startPose] };
}

/** The rest pose after step i (i = -1: before the first step). */
export function restAt(prog: ListProgram, i: number): Pose {
  let P = prog.rests[i + 1];
  if (!P) {
    P = restPose(prog.steps[i].diag);
    prog.rests[i + 1] = P;
  }
  return P;
}
