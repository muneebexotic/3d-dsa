// The step player's promise: every step starts exactly where the previous one
// came to rest and ends exactly on its own rest pose, so playing, stepping and
// rewinding never jump.

import { describe, expect, it } from 'vitest';
import type { Recording } from '@/chapters/hashing/diagram';
import { assemble, buildTransition, morph } from '@/chapters/hashing/motion';
import * as ops from '@/chapters/hashing/ops';
import { angDelta, effTarget, makeProgram, restAt, type Pose } from '@/chapters/hashing/poses';
import { fresh } from '@/chapters/hashing/state';
import { HashTable, type Strategy } from '@/chapters/hashing/table';

const EPS = 1e-6;

/** What can be seen: where each disc is and how big, what each pointer points at, the rings, the hand and the gauge. */
function geometry(P: Pose): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, it] of P.items) {
    if (it.s < EPS) continue;
    Object.assign(out, { [`${k}.x`]: it.x, [`${k}.y`]: it.y, [`${k}.z`]: it.z, [`${k}.s`]: it.s });
  }
  for (const [k, l] of P.links) if (l.s > EPS) Object.assign(out, { [`${k}.s`]: l.s, [`${k}.to`]: effTarget(l) });
  for (const [k, r] of P.rings)
    if (r.a > EPS) Object.assign(out, { [`${k}.a`]: r.a, [`${k}.r`]: r.r, [`${k}.live`]: r.live });
  for (const [k, t] of P.tombs) if (t.a > EPS) out[`${k}.a`] = t.a;
  for (const [k, l] of P.lits) if (l.a > EPS) out[`${k}.a`] = l.a;
  Object.assign(out, { handLen: P.hand.len, load: P.gauge.load, plinth: P.plinthR });
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
  expect(Math.abs(angDelta(a.hand.ang, b.hand.ang)), `${where}: the hand`).toBeLessThan(1e-6);
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
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const P = tr.pose(t);
      for (const it of P.items.values())
        expect(Number.isFinite(it.x + it.y + it.z + it.s), `${where} at ${t}`).toBe(true);
      expect(Number.isFinite(P.hand.ang + P.hand.len), `${where}: the hand at ${t}`).toBe(true);
    }
  }
}

const grow = { grow: true };
const both: Strategy[] = ['chain', 'probe'];

const recordings: [string, () => Recording][] = both.flatMap(s => {
  const T = () => fresh(s);
  const r: [string, () => Recording][] = [
    [`${s}: insert that grows`, () => ops.insert(T(), 41, grow)],
    [`${s}: insert without growing`, () => ops.insert(T(), 41, { grow: false })],
    [`${s}: insert into an empty bucket`, () => ops.insert(T(), 0, grow)],
    [`${s}: insert a duplicate`, () => ops.insert(T(), 33, grow)],
    [`${s}: search hit`, () => ops.search(T(), 33)],
    [`${s}: search hit at home`, () => ops.search(T(), 25)],
    [`${s}: search miss`, () => ops.search(T(), 17)],
    [`${s}: search an empty bucket`, () => ops.search(T(), 8)],
    [`${s}: delete the head of a chain`, () => ops.remove(T(), 25)],
    [`${s}: delete deeper`, () => ops.remove(T(), 33)],
    [`${s}: delete missing`, () => ops.remove(T(), 5)],
    [`${s}: insert many`, () => ops.insertMany(T(), [3, 50, 81, 94], grow, 'Add 4')],
    [`${s}: unlucky keys`, () => ops.unlucky(T(), grow)],
    [`${s}: unlucky keys, no growing`, () => ops.unlucky(T(), { grow: false })],
    [`${s}: scramble`, () => ops.switchHash(T(), 'scrambled')],
    [
      `${s}: grow to 32`,
      () => {
        const t = T();
        for (let k = 60; t.m < 16 || t.n < 12; k++) {
          t.quickInsert(k);
          if (t.overloaded) t.rebuild(t.m * 2);
        }
        return ops.insertMany(t, [1, 2, 3, 4, 5], grow, 'Fill');
      },
    ],
  ];
  return r;
});
recordings.push(
  [
    'probe: a tombstone reused',
    () => {
      const t = fresh('probe');
      t.quickRemove(33);
      return ops.insert(t, 17, { grow: false });
    },
  ],
  [
    'probe: full',
    () => {
      const t = new HashTable('probe');
      for (let k = 0; k < 8; k++) t.quickInsert(k);
      return ops.insert(t, 50, { grow: false });
    },
  ],
);

describe('every step starts where the last one rested', () => {
  it.each(recordings)('%s', (_name, make) => checkRecording(make()));
});

describe('openings and seeks', () => {
  it('assembles onto the rest pose', () => {
    const P = makeProgram(ops.search(fresh('chain'), 12)).startPose;
    expectSame(assemble(P).pose(1), P, 'assembly ends at rest');
  });
  it('morphs from one table to the other', () => {
    const A = makeProgram(ops.search(fresh('chain'), 12)).startPose,
      B = makeProgram(ops.search(fresh('probe'), 12)).startPose;
    expectSame(morph(A, B).pose(0), A, 'morph starts at A');
    expectSame(morph(A, B).pose(1), B, 'morph ends at B');
  });
});
