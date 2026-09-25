// The step player's promise: every step starts exactly where the previous one
// came to rest and ends exactly on its own rest pose, so playing, stepping and
// rewinding never jump.

import { describe, expect, it } from 'vitest';
import type { Recording } from '@/chapters/heap/diagram';
import { MAX_SIZE } from '@/chapters/heap/heap';
import { assemble, buildTransition, morph } from '@/chapters/heap/motion';
import * as ops from '@/chapters/heap/ops';
import { itemAt, makeProgram, restAt, type Pose } from '@/chapters/heap/poses';
import { freshWorld } from '@/chapters/heap/state';

const EPS = 1e-6;

/** What can be seen: where each disc is drawn and how big, its label and chip, the slots, the wires, the overlays. */
function geometry(P: Pose): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, it] of P.items) {
    if (it.s < EPS) continue;
    const p = itemAt(it);
    Object.assign(out, {
      [`${k}.x`]: p.x,
      [`${k}.y`]: p.y,
      [`${k}.z`]: p.z,
      [`${k}.s`]: it.s,
      [`${k}.f`]: it.f,
      [`${k}.chip`]: it.chip,
      [`${k}.cx`]: it.c.x,
      [`${k}.label`]: it.label,
      [`${k}.fill`]: it.fill.join(','),
    });
  }
  P.slots.forEach((sl, i) => {
    if (sl.a > EPS)
      Object.assign(out, {
        [`s${i}.a`]: sl.a,
        [`s${i}.x`]: sl.t.x,
        [`s${i}.y`]: sl.t.y,
        [`s${i}.cx`]: sl.c.x,
        [`s${i}.f`]: sl.f,
        [`s${i}.used`]: sl.used,
        [`s${i}.ghost`]: sl.ghost,
        [`s${i}.lit`]: sl.lit,
      });
  });
  for (const [c, w] of P.wires)
    if (w.s > EPS) Object.assign(out, { [`w${c}.s`]: w.s, [`w${c}.bad`]: w.bad, [`w${c}.hot`]: w.hot });
  for (const [k, a] of P.arcs) if (a.s > EPS) out[`arc${k}`] = a.s;
  for (const [i, g] of P.guides) if (g.a > EPS) out[`guide${i}`] = g.a;
  if (P.callout && P.callout.a > EPS) Object.assign(out, { callout: P.callout.text, calloutA: P.callout.a });
  Object.assign(out, { tray: P.tray, trayX: P.trayX, x0: P.plinth.x0, x1: P.plinth.x1 });
  return out;
}

function expectSame(a: Pose, b: Pose, where: string): void {
  const A = geometry(a),
    B = geometry(b);
  expect(Object.keys(A).sort(), where).toEqual(Object.keys(B).sort());
  for (const k of Object.keys(A)) {
    const x = A[k],
      y = B[k];
    if (k.endsWith('.fill') && typeof x === 'string' && typeof y === 'string') {
      const xs = x.split(',').map(Number),
        ys = y.split(',').map(Number);
      xs.forEach((v, j) => expect(v, `${where}: ${k}`).toBeCloseTo(ys[j], 5));
    } else if (typeof x === 'number' && typeof y === 'number') expect(x, `${where}: ${k}`).toBeCloseTo(y, 5);
    else expect(x, `${where}: ${k}`).toBe(y);
  }
}

function checkRecording(rec: Recording): void {
  const prog = makeProgram(rec);
  expect(prog.steps.length, rec.title).toBeGreaterThan(0);
  for (let i = 0; i < prog.steps.length; i++) {
    const tr = buildTransition(prog, i),
      where = `${rec.title}, step ${i} (${prog.steps[i].kind})`;
    expect(tr.dur).toBeGreaterThan(0);
    expectSame(tr.pose(0), restAt(prog, i - 1), `${where} starts where the last step rested`);
    expectSame(tr.pose(1), restAt(prog, i), `${where} ends on its own rest`);
    for (const t of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const P = tr.pose(t);
      for (const it of P.items.values()) {
        const p = itemAt(it);
        expect(Number.isFinite(p.x + p.y + p.z + it.s + it.f), `${where} at ${t}`).toBe(true);
      }
    }
  }
}

const W = () => freshWorld();
const full = () => {
  const w = W();
  ops.pushMany(
    w,
    Array.from({ length: MAX_SIZE - w.H.n }, (_, i) => 50 + i),
  );
  return w;
};
const flat = () => {
  const w = W();
  ops.setView(w, 'array');
  return w;
};

const recordings: [string, () => Recording][] = [
  ['the opening', () => ops.opening(W())],
  ['push that climbs', () => ops.push(W(), 5)],
  ['push to the top', () => ops.push(W(), 1)],
  ['push that stays', () => ops.push(W(), 90)],
  [
    'push into an empty heap',
    () => {
      const w = W();
      ops.drain(w);
      return ops.push(w, 7);
    },
  ],
  [
    'push that opens a row',
    () => {
      const w = W();
      ops.pushMany(w, [60, 61, 62, 63, 64]);
      return ops.push(w, 2);
    },
  ],
  ['push when full', () => ops.push(full(), 3)],
  ['pop', () => ops.pop(W())],
  [
    'pop the last key',
    () => {
      const w = W();
      w.H.a = [w.H.a[0]];
      return ops.pop(w);
    },
  ],
  [
    'pop two keys',
    () => {
      const w = W();
      w.H.a = w.H.a.slice(0, 2);
      return ops.pop(w);
    },
  ],
  [
    'pop that closes a row',
    () => {
      const w = W();
      ops.pushMany(w, [60, 61, 62, 63, 64]);
      return ops.pop(w);
    },
  ],
  [
    'pop when empty',
    () => {
      const w = W();
      ops.drain(w);
      return ops.pop(w);
    },
  ],
  ['pop in the array view', () => ops.pop(flat())],
  ['push in the array view', () => ops.push(flat(), 5)],
  ['push many', () => ops.pushMany(W(), [3, 95, 1, 44])],
  ['push many into a new row', () => ops.pushMany(W(), [60, 61, 62, 63, 64, 1, 2])],
  ['drain', () => ops.drain(W())],
  ['heapify', () => ops.heapify(W(), [44, 12, 87, 5, 63, 29, 71, 38, 9, 56, 20, 91, 3, 47, 15])],
  [
    'heapify a big heap',
    () =>
      ops.heapify(
        W(),
        Array.from({ length: 31 }, (_, i) => (i * 37) % 97),
      ),
  ],
  ['heapify in the array view', () => ops.heapify(flat(), [9, 8, 7, 6, 5, 4, 3])],
  ['flip to max', () => ops.flip(W(), 'max')],
  ['unfold', () => ops.setView(W(), 'array')],
  ['fold', () => ops.setView(flat(), 'tree')],
  ['Dijkstra', () => ops.dijkstra(W())],
  ['Dijkstra in the array view', () => ops.dijkstra(flat())],
];

describe('every step starts where the last one rested', () => {
  it.each(recordings)('%s', (_name, make) => checkRecording(make()));
});

describe('openings and seeks', () => {
  it('assembles onto the rest pose', () => {
    const P = makeProgram(ops.opening(W())).startPose;
    expectSame(assemble(P).pose(1), P, 'assembly ends at rest');
  });
  it('morphs from one heap to another', () => {
    const A = makeProgram(ops.push(W(), 5)).startPose,
      B = makeProgram(ops.heapify(W(), [5, 4, 3, 2, 1])).startPose;
    expectSame(morph(A, B).pose(0), A, 'morph starts at A');
    expectSame(morph(A, B).pose(1), B, 'morph ends at B');
  });
});
