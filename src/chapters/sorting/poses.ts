// Poses. A pose says, for every loom, how many rows of cloth it has woven, where
// each thread stands at the front, and what is lit or marked there. The cloth
// itself is not in the pose: it is the run's history, drawn from the rows woven so
// far. The rest pose after each step is laid out from that step; motion between
// two poses is a blend. No Three.js here, so it is unit-tested.

import { lerp } from '../../core/math';
import type { Program } from '../../core/player';
import { threadsSig, type LoomState, type Recording, type Step } from './diagram';
import * as Lay from './layout';
import type { Run, SortKey } from './sorts';

/** Everything about a run the drawing needs, worked out once. */
export interface Weave {
  run: Run;
  n: number;
  /** where[p][t]: the slot of thread t in states[p]. */
  where: Int16Array[];
  /** Pairs of twins (the same value). */
  twins: [number, number][];
  /** Knots in the cloth: twins a and b cross between rows r and r + 1. */
  knots: { r: number; a: number; b: number }[];
  /** The slots each pick compared, in the state before it: row r holds pick r - 1. */
  picks: Int16Array;
  /** The value that ends up in each slot. */
  sortedV: number[];
  /** The biggest value, for heights and shades. */
  top: number;
}

const WEAVES = new WeakMap<Run, Weave>();

export function weaveOf(run: Run): Weave {
  let w = WEAVES.get(run);
  if (w) return w;
  const th = run.threads,
    n = th.n;
  const where = run.states.map(arr => {
    const p = new Int16Array(n);
    arr.forEach((id, s) => (p[id] = s));
    return p;
  });
  const twins: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (th.list[a].v === th.list[b].v) twins.push([a, b]);
  const knots: Weave['knots'] = [];
  // row r (r >= 1) holds states[r - 1]; row 0, the start, holds states[0]
  for (let r = 1; r < where.length; r++)
    for (const [a, b] of twins) {
      const p = where[r - 1],
        q = where[r];
      if (p[a] < p[b] !== q[a] < q[b]) knots.push({ r, a, b });
    }
  const picks = new Int16Array(run.comps * 2);
  let q = 0;
  for (const ev of run.events)
    if (ev.kind === 'pick') {
      picks[2 * q] = ev.i;
      picks[2 * q + 1] = ev.j;
      q++;
    }
  w = {
    run,
    n,
    where,
    twins,
    knots,
    picks,
    sortedV: th.list.map(t => t.v).sort((x, y) => x - y),
    top: th.top,
  };
  WEAVES.set(run, w);
  return w;
}

/** The arrangement row r of the cloth holds. */
export const rowState = (w: Weave, r: number): Int16Array => w.where[Math.max(0, Math.min(w.where.length - 1, r - 1))];

/** Where thread t stands at the front when a race loom has woven R rows. */
export function fellX(w: Weave, R: number, t: number): number {
  const C = w.where.length - 1;
  if (R >= C) return w.where[C][t];
  const p = Math.floor(R),
    f = R - p;
  return lerp(w.where[p][t], w.where[p + 1][t], f);
}

export interface ThreadPose {
  /** Its slot at the front (continuous while it moves). */
  x: number;
  /** 1 when lifted forward out of the row. */
  lift: number;
  /** 1 while it is one of the two being compared. */
  glow: number;
  /** 1 when the sort has it marked: the smallest so far, the pivot, the key sinking. */
  ring: number;
}

export interface CellPose {
  /** 1 inside the part of the row being worked on. */
  live: number;
  /** 1 once its key is in its final place. */
  final: number;
}

export interface LoomPose {
  /** The sort and the threads it weaves: the same id is the same loom. */
  id: string;
  key: SortKey;
  weave: Weave;
  cx: number;
  px: number;
  /** Rows woven so far. */
  rows: number;
  threads: ThreadPose[];
  cells: CellPose[];
  /** The comparison in hand, laid at the front from thread a to thread b: s grows it, al fades it. */
  weft: { a: number; b: number; s: number; al: number } | null;
  /** Quick sort: a line at the pivot's height across the part being split. */
  pivot: { id: number; lo: number; hi: number; a: number } | null;
  /** Merge sort: merged so far [lo, k), the left run [k, m), the right run [m, hi). */
  merge: { lo: number; k: number; m: number; hi: number; a: number } | null;
  /** Heap sort: the heap's size, drawn as arcs from each parent to its children. */
  heap: { n: number; a: number };
  /** Insertion sort: the first k slots are in order among themselves. */
  sorted: { k: number; a: number };
  /** 1 once the sort is finished. */
  done: number;
  /** 0 lying on the plinth, 1 standing up. */
  stand: number;
  /** 0 flat, 1 with every heddle at its full height. */
  rise: number;
  /** The whole loom's presence. */
  a: number;
}

export interface Callout {
  loom: string;
  a: number;
  b: number;
  text: string;
  al: number;
}

export interface Pose {
  looms: LoomPose[];
  /** Row pitch. */
  dz: number;
  plinth: { x0: number; x1: number; z0: number; z1: number };
  callout: Callout | null;
}

/* ---------------- layout ---------------- */

export function restPose(rec: Recording, states: readonly LoomState[], s?: Step): Pose {
  const race = rec.mode === 'race',
    th = rec.threads,
    n = th.n,
    sig = threadsSig(th);
  const px = Lay.pitch(n, race),
    dz = Lay.rowPitch(n, race);
  const stand = s?.stand ?? 0;
  const looms = rec.looms.map((spec, k): LoomPose => {
    const st = states[k],
      w = weaveOf(spec.run),
      m = st.marks;
    const pos = new Array<number>(n);
    st.arr.forEach((id, slot) => (pos[id] = slot));
    const threads = th.list.map((t): ThreadPose => ({
      x: pos[t.id],
      lift: m && m.held === t.id ? 1 : 0,
      glow: st.glow.includes(t.id) ? 1 : 0,
      ring: m && (m.min === t.id || m.pivot === t.id || m.sink === t.id) ? 1 : 0,
    }));
    const cells = Array.from({ length: n }, (_, slot): CellPose => ({
      live: m?.range ? (slot >= m.range[0] && slot < m.range[1] ? 1 : 0) : 1,
      final: m ? (m.final[slot] ? 1 : 0) : st.done ? 1 : 0,
    }));
    return {
      id: `${spec.key}@${sig}`,
      key: spec.key,
      weave: w,
      cx: race ? Lay.raceX(k) : 0,
      px,
      rows: st.rows,
      threads,
      cells,
      weft: null,
      pivot: m && m.pivot >= 0 && m.range ? { id: m.pivot, lo: m.range[0], hi: m.range[1], a: 1 } : null,
      merge: m?.merge ? { ...m.merge, a: 1 } : null,
      heap: { n: m?.heap ?? 0, a: m?.heap ? 1 : 0 },
      sorted: { k: m?.sorted ?? 0, a: spec.key === 'insertion' && m && !st.done && m.sorted > 0 ? 1 : 0 },
      done: st.done ? 1 : 0,
      stand,
      rise: 1,
      a: 1,
    };
  });
  const most = Math.max(...rec.looms.map(l => l.run.comps));
  const half = race ? Lay.raceX(5) + Lay.RACE_W / 2 + 0.8 : (n * px) / 2 + 1.35;
  const back = (most + 1.5) * dz + 0.8;
  const callout: Callout | null =
    s?.callout && states[0].glow.length === 2
      ? { loom: looms[0].id, a: states[0].glow[0], b: states[0].glow[1], text: s.callout, al: 1 }
      : null;
  return {
    looms,
    dz,
    plinth: { x0: -half, x1: half, z0: -lerp(back, 1.2, stand), z1: Lay.PLATE_Z },
    callout,
  };
}

/* ---------------- blending ---------------- */

/** Per-part timing for a blend: each is the blend amount for that part (default: k). */
export interface Timing {
  rows?: number;
  x?: number;
  lift?: number;
  glow?: number;
  ring?: number;
  /** Cells, pivot line, merge runs, heap arcs, the sorted part. */
  marks?: number;
  /** Per cell, for a wave across the row. */
  cell?: (slot: number) => number;
  callout?: number;
  stand?: number;
  place?: number;
}

function mixLoom(A: LoomPose, B: LoomPose, k: number, T: Timing): LoomPose {
  const kx = T.x ?? k,
    kl = T.lift ?? k,
    kg = T.glow ?? k,
    kr = T.ring ?? k,
    km = T.marks ?? k,
    kp = T.place ?? k;
  const threads = B.threads.map((b, t): ThreadPose => {
    const a = A.threads[t];
    return {
      x: lerp(a.x, b.x, kx),
      lift: lerp(a.lift, b.lift, kl),
      glow: lerp(a.glow, b.glow, kg),
      ring: lerp(a.ring, b.ring, kr),
    };
  });
  const cells = B.cells.map((b, s): CellPose => {
    const a = A.cells[s],
      kc = T.cell ? T.cell(s) : km;
    return { live: lerp(a.live, b.live, km), final: lerp(a.final, b.final, kc) };
  });
  // marks that change shape swap over halfway; the same one slides
  const pivot =
    A.pivot && B.pivot && A.pivot.id === B.pivot.id
      ? {
          ...B.pivot,
          lo: lerp(A.pivot.lo, B.pivot.lo, km),
          hi: lerp(A.pivot.hi, B.pivot.hi, km),
          a: lerp(A.pivot.a, B.pivot.a, km),
        }
      : km < 0.5
        ? A.pivot && { ...A.pivot, a: A.pivot.a * (1 - 2 * km) }
        : B.pivot && { ...B.pivot, a: B.pivot.a * (2 * km - 1) };
  const merge =
    A.merge && B.merge && A.merge.lo === B.merge.lo && A.merge.hi === B.merge.hi
      ? {
          lo: B.merge.lo,
          hi: B.merge.hi,
          k: lerp(A.merge.k, B.merge.k, km),
          m: lerp(A.merge.m, B.merge.m, km),
          a: lerp(A.merge.a, B.merge.a, km),
        }
      : km < 0.5
        ? A.merge && { ...A.merge, a: A.merge.a * (1 - 2 * km) }
        : B.merge && { ...B.merge, a: B.merge.a * (2 * km - 1) };
  return {
    ...B,
    cx: lerp(A.cx, B.cx, kp),
    px: lerp(A.px, B.px, kp),
    rows: lerp(A.rows, B.rows, T.rows ?? k),
    threads,
    cells,
    weft: null,
    pivot,
    merge,
    heap: { n: km < 0.5 ? A.heap.n : B.heap.n, a: lerp(A.heap.a, B.heap.a, km) },
    sorted: { k: lerp(A.sorted.k, B.sorted.k, km), a: lerp(A.sorted.a, B.sorted.a, km) },
    done: lerp(A.done, B.done, km),
    stand: lerp(A.stand, B.stand, T.stand ?? k),
    rise: lerp(A.rise, B.rise, k),
    a: lerp(A.a, B.a, k),
  };
}

const fadeLoom = (L: LoomPose, a: number): LoomPose => ({ ...L, a: L.a * a });

/** Blend two poses. Looms in only one of them fade in or out. */
export function mixPose(A: Pose, B: Pose, k: number, T: Timing = {}): Pose {
  const byId = new Map(A.looms.map(l => [l.id, l]));
  const looms: LoomPose[] = [];
  for (const b of B.looms) {
    const a = byId.get(b.id);
    looms.push(a ? mixLoom(a, b, k, T) : fadeLoom(b, k));
  }
  const inB = new Set(B.looms.map(l => l.id));
  for (const a of A.looms) if (!inB.has(a.id)) looms.push(fadeLoom(a, 1 - k));
  const ko = T.callout ?? k,
    ca = A.callout,
    cb = B.callout;
  const same = ca && cb && ca.text === cb.text && ca.a === cb.a && ca.b === cb.b;
  const callout: Callout | null = same
    ? { ...cb, al: lerp(ca.al, cb.al, ko) }
    : ko < 0.5
      ? ca && { ...ca, al: ca.al * (1 - 2 * ko) }
      : cb && { ...cb, al: cb.al * (2 * ko - 1) };
  const kp = T.place ?? k;
  return {
    looms,
    dz: lerp(A.dz, B.dz, kp),
    plinth: {
      x0: lerp(A.plinth.x0, B.plinth.x0, kp),
      x1: lerp(A.plinth.x1, B.plinth.x1, kp),
      z0: lerp(A.plinth.z0, B.plinth.z0, T.stand ?? kp),
      z1: lerp(A.plinth.z1, B.plinth.z1, kp),
    },
    callout,
  };
}

/* ---------------- programs ---------------- */

export interface LoomProgram extends Program<Step, Pose> {
  rec: Recording;
  title: string;
  /** Rest poses, cached: rests[i + 1] is the pose after step i. */
  rests: Pose[];
}

export function makeProgram(rec: Recording): LoomProgram {
  const startPose = restPose(rec, rec.start);
  return { rec, title: rec.title, steps: rec.steps, startPose, rests: [startPose] };
}

/** The rest pose after step i (i = -1: before the first step). */
export function restAt(prog: LoomProgram, i: number): Pose {
  let P = prog.rests[i + 1];
  if (!P) {
    const s = prog.steps[i];
    P = restPose(prog.rec, s.looms, s);
    prog.rests[i + 1] = P;
  }
  return P;
}

/** The loom state a step leaves, or the start. */
export const statesAt = (prog: LoomProgram, i: number): readonly LoomState[] =>
  i >= 0 ? prog.steps[i].looms : prog.rec.start;
