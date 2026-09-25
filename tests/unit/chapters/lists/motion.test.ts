// The step player's promise: every step starts exactly where the previous one
// came to rest and ends exactly on its own rest pose, so playing, stepping and
// rewinding never jump.

import { describe, expect, it } from 'vitest';
import * as arr from '@/chapters/lists/array';
import { bridgeSearch } from '@/chapters/lists/bridge';
import type { Recording } from '@/chapters/lists/diagram';
import * as list from '@/chapters/lists/listops';
import { buildTransition } from '@/chapters/lists/motion';
import { effTarget, makeProgram, restAt, type Pose } from '@/chapters/lists/poses';
import * as ring from '@/chapters/lists/queue';
import * as stack from '@/chapters/lists/stack';
import { fresh } from '@/chapters/lists/state';

const EPS = 1e-6;

/** What can be seen: where each disc is and how big, and what each pointer and label points at. */
function geometry(P: Pose): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, it] of P.items) {
    if (it.s < EPS) continue;
    Object.assign(out, {
      [`${k}.x`]: it.x,
      [`${k}.y`]: it.y,
      [`${k}.z`]: it.z,
      [`${k}.mx`]: it.mx,
      [`${k}.mz`]: it.mz,
      [`${k}.s`]: it.s,
    });
  }
  for (const [k, w] of P.wires) {
    if (w.s < EPS) continue;
    const nd = w.k >= 0.5 ? w.nd : w.wnd;
    Object.assign(out, { [`${k}.s`]: w.s, [`${k}.to`]: effTarget(w), [`${k}.nd`]: effTarget(w) == null ? nd : 0 });
  }
  for (const [k, f] of P.flags) {
    if (f.a < EPS) continue;
    Object.assign(out, { [`${k}.a`]: f.a, [`${k}.to`]: effTarget(f), [`${k}.lvl`]: f.lvl, [`${k}.off`]: f.off });
  }
  for (const [k, b] of P.blocks) {
    if (b.a < EPS) continue;
    out[`${k}.a`] = b.a;
    b.cells.forEach((c, i) =>
      Object.assign(out, { [`${k}.${i}.x`]: c.x, [`${k}.${i}.z`]: c.z, [`${k}.${i}.mx`]: c.mx }),
    );
  }
  if (P.net) for (const [k, n] of P.net.knots) out[`${k}.fill`] = n.fill.join(',');
  return out;
}

function expectSame(a: Pose, b: Pose, where: string): void {
  const A = geometry(a),
    B = geometry(b);
  expect(Object.keys(A).sort(), where).toEqual(Object.keys(B).sort());
  for (const k of Object.keys(A)) {
    const x = A[k],
      y = B[k];
    if (typeof x === 'number' && typeof y === 'number') expect(x, `${where}: ${k}`).toBeCloseTo(y, 5);
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
    for (const t of [0.25, 0.5, 0.75]) {
      const P = tr.pose(t);
      for (const it of P.items.values())
        expect(Number.isFinite(it.x + it.y + it.z + it.s), `${where} at ${t}`).toBe(true);
    }
  }
}

const recordings: [string, () => Recording][] = [
  ['singly insert at 2', () => list.insertAt(fresh('singly'), 7, 2)],
  ['singly insert at head', () => list.insertHead(fresh('singly'), 7)],
  ['singly insert at tail', () => list.insertTail(fresh('singly'), 7)],
  ['singly delete 3', () => list.deleteAt(fresh('singly'), 3)],
  ['singly delete head', () => list.deleteAt(fresh('singly'), 0)],
  ['singly delete tail', () => list.deleteAt(fresh('singly'), 5)],
  ['singly search hit', () => list.search(fresh('singly'), 23)],
  ['singly search miss', () => list.search(fresh('singly'), 99)],
  ['singly get', () => list.get(fresh('singly'), 4)],
  ['singly reverse', () => list.reverse(fresh('singly'))],
  ['doubly insert at 4', () => list.insertAt(fresh('doubly'), 7, 4)],
  ['doubly insert at head', () => list.insertHead(fresh('doubly'), 7)],
  ['doubly delete 1', () => list.deleteAt(fresh('doubly'), 1)],
  ['doubly delete tail', () => list.deleteAt(fresh('doubly'), 5)],
  ['doubly get', () => list.get(fresh('doubly'), 5)],
  ['doubly reverse', () => list.reverse(fresh('doubly'))],
  [
    'empty list',
    () => {
      const L = fresh('singly');
      L.clear();
      return list.deleteAt(L, 0);
    },
  ],
  [
    'one-node reverse',
    () => {
      const L = fresh('doubly');
      L.clear();
      L.quickAppend(5);
      return list.reverse(L);
    },
  ],
  ['array get', () => arr.get(fresh('array'), 3)],
  ['array search', () => arr.search(fresh('array'), 16)],
  ['array insert at 1', () => arr.insert(fresh('array'), 1, 9)],
  [
    'array insert that grows',
    () => {
      const A = fresh('array');
      A.quickAppend(1);
      A.quickAppend(2);
      return arr.insert(A, 0, 9);
    },
  ],
  ['array delete', () => arr.remove(fresh('array'), 2)],
  ['array reverse', () => arr.reverse(fresh('array'))],
  ['stack push', () => stack.push(fresh('stack'), 4)],
  ['stack pop', () => stack.pop(fresh('stack'))],
  ['stack peek', () => stack.peek(fresh('stack'))],
  [
    'stack fill and empty',
    () => {
      const S = fresh('stack');
      S.clear();
      return stack.fillAndEmpty(S, [1, 2, 3]);
    },
  ],
  [
    'stack underflow',
    () => {
      const S = fresh('stack');
      S.clear();
      return stack.pop(S);
    },
  ],
  ['queue enqueue', () => ring.enqueue(fresh('queue'), 4)],
  ['queue dequeue', () => ring.dequeue(fresh('queue'))],
  [
    'queue wrap',
    () => {
      const Q = fresh('queue');
      Q.reset(6);
      return ring.fillAndEmpty(Q, [1, 2, 3, 4]);
    },
  ],
  [
    'queue overflow',
    () => {
      const Q = fresh('queue');
      for (let v = 4; v <= 8; v++) Q.quickEnqueue(v);
      return ring.enqueue(Q, 9);
    },
  ],
  ['bridge DFS', () => bridgeSearch('dfs')],
  ['bridge BFS', () => bridgeSearch('bfs')],
];

describe('every step starts where the last one rested', () => {
  it.each(recordings)('%s', (_name, make) => checkRecording(make()));
});
