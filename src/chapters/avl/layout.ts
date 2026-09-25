// Where everything hangs: one column per value in sorted order, one row per level.
// Sizes are in world units.

import type { Side, Snap } from './engine';

export const R = 0.5; // disc radius
export const COL = 0.68; // horizontal spacing: one column per value, in sorted order
export const ROW = 2.1; // vertical spacing per level
export const STEM = 0.22; // disc bottom to arm pivot
export const STUB = 0.34; // length of an empty arm (a missing child)
export const BEAD = 1.0; // where the value in hand rests above a disc
export const VR = 0.36; // radius of the value in hand
export const SAG = 0.32; // how far the heavy side of a ±2 node drops
export const WALL_Z = -1.7;
export const CEIL = 60;
export const MAX_VALUES = 60;

export interface Slot2 {
  x: number;
  y: number;
  /** Depth in the tree. */
  d: number;
  /** Column in sorted order. */
  col: number;
}
export interface Point3 {
  x: number;
  y: number;
  z: number;
}
/** A parent-to-child link; the root's link comes from the ceiling (p = null, side 'c'). */
export interface Link {
  p: number | null;
  c: number;
  side: Side | 'c';
}

export function layoutSnap(snap: Snap): Map<number, Slot2> {
  const pos = new Map<number, Slot2>();
  if (snap.root == null) return pos;
  const order: [number, number][] = [];
  const walk = (id: number | null, d: number): void => {
    if (id == null) return;
    const n = snap.n[id];
    walk(n.l, d + 1);
    order.push([id, d]);
    walk(n.r, d + 1);
  };
  walk(snap.root, 0);
  const cnt = order.length;
  order.forEach(([id, d], k) => pos.set(id, { x: (k - (cnt - 1) / 2) * COL, y: -d * ROW, d, col: k }));
  // the heavy side of a ±2 node sags, so the imbalance shows before it is fixed
  const sag = (id: number | null, dy: number): void => {
    if (id == null) return;
    const p = pos.get(id);
    if (p) p.y -= dy;
    const n = snap.n[id];
    sag(n.l, dy);
    sag(n.r, dy);
  };
  for (const [id] of order) {
    const n = snap.n[id];
    if (Math.abs(n.bf) >= 2) sag(n.bf > 0 ? n.l : n.r, SAG);
  }
  return pos;
}

export function linksOf(snap: Snap): Map<string, Link> {
  const L = new Map<string, Link>();
  if (snap.root != null) L.set(`^>${snap.root}`, { p: null, c: snap.root, side: 'c' });
  for (const k in snap.n) {
    const n = snap.n[k],
      id = Number(k);
    if (n.l != null) L.set(`${id}>${n.l}`, { p: id, c: n.l, side: 'l' });
    if (n.r != null) L.set(`${id}>${n.r}`, { p: id, c: n.r, side: 'r' });
  }
  return L;
}
export const linkKey = (L: { p: number | null; c: number }): string => `${L.p ?? '^'}>${L.c}`;

export function subtreeIds(snap: Snap, id: number | null, out = new Set<number>()): Set<number> {
  if (id == null) return out;
  out.add(id);
  const n = snap.n[id];
  subtreeIds(snap, n.l, out);
  subtreeIds(snap, n.r, out);
  return out;
}

/** Where the value in hand rests above a disc. */
export const bead = (p: { x: number; y: number }): Point3 => ({ x: p.x, y: p.y + BEAD, z: 0 });
/** An empty hook under a disc. */
export const hookPoint = (p: { x: number; y: number }, side: Side): Point3 => ({
  x: p.x + (side === 'l' ? -STUB : STUB),
  y: p.y - R - STEM - 0.18 - VR,
  z: 0,
});
