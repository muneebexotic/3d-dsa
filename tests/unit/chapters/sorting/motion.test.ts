// The step player's promise: every step starts exactly where the previous one
// came to rest and ends exactly on its own rest pose, so playing, stepping and
// rewinding never jump.

import { describe, expect, it } from 'vitest';
import type { Recording } from '@/chapters/sorting/diagram';
import { assemble, buildTransition, morph } from '@/chapters/sorting/motion';
import * as ops from '@/chapters/sorting/ops';
import { fellX, makeProgram, restAt, type Pose } from '@/chapters/sorting/poses';
import { SORTS } from '@/chapters/sorting/sorts';
import { makeThreads, type InputKind } from '@/chapters/sorting/threads';

const EPS = 1e-6;

/** What can be seen: every loom's rows and front, its marks, the callout. */
function geometry(P: Pose): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const L of P.looms) {
    if (L.a < EPS) continue;
    const k = L.id;
    Object.assign(out, {
      [`${k}.a`]: L.a,
      [`${k}.rows`]: L.rows,
      [`${k}.cx`]: L.cx,
      [`${k}.px`]: L.px,
      [`${k}.stand`]: L.stand,
      [`${k}.rise`]: L.rise,
      [`${k}.done`]: L.done,
      [`${k}.heap`]: L.heap.a > EPS ? `${L.heap.n}:${L.heap.a.toFixed(6)}` : 'none',
      [`${k}.sorted`]: L.sorted.a > EPS ? L.sorted.k * L.sorted.a : 0,
      [`${k}.weft`]: L.weft && L.weft.al * L.weft.s > EPS ? 'on' : 'off',
    });
    L.threads.forEach((t, j) =>
      Object.assign(out, {
        [`${k}.t${j}.x`]: t.x,
        [`${k}.t${j}.lift`]: t.lift,
        [`${k}.t${j}.glow`]: t.glow,
        [`${k}.t${j}.ring`]: t.ring,
      }),
    );
    L.cells.forEach((c, s) => Object.assign(out, { [`${k}.c${s}.live`]: c.live, [`${k}.c${s}.final`]: c.final }));
    if (L.pivot && L.pivot.a > EPS)
      Object.assign(out, { [`${k}.pivot`]: `${L.pivot.id}:${L.pivot.lo}:${L.pivot.hi}`, [`${k}.pivotA`]: L.pivot.a });
    if (L.merge && L.merge.a > EPS)
      Object.assign(out, {
        [`${k}.merge`]: `${L.merge.lo}:${L.merge.hi}`,
        [`${k}.mk`]: L.merge.k,
        [`${k}.mm`]: L.merge.m,
        [`${k}.mA`]: L.merge.a,
      });
  }
  if (P.callout && P.callout.al > EPS) Object.assign(out, { callout: P.callout.text, calloutA: P.callout.al });
  Object.assign(out, { dz: P.dz, x0: P.plinth.x0, x1: P.plinth.x1, z0: P.plinth.z0, z1: P.plinth.z1 });
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
    for (const t of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const P = tr.pose(t);
      for (const L of P.looms) {
        expect(L.rows, `${where} at ${t}: rows`).toBeGreaterThanOrEqual(0);
        expect(L.rows, `${where} at ${t}: rows`).toBeLessThanOrEqual(L.weave.run.comps + EPS);
        for (const th of L.threads)
          expect(Number.isFinite(th.x + th.lift + th.glow + L.rows), `${where} at ${t}`).toBe(true);
      }
    }
  }
}

const th = (kind: InputKind, n: number, seed = 3) => makeThreads(kind, n, seed);

describe('every step starts where the last one rested', () => {
  for (const key of SORTS)
    it(key, () => {
      for (const [kind, n] of [
        ['random', 12],
        ['nearly', 16],
        ['reversed', 8],
        ['twins', 8],
      ] as const)
        checkRecording(ops.solo(key, th(kind, n)));
    });
  it('all six at once', () => {
    for (const [kind, n] of [
      ['random', 16],
      ['twins', 12],
      ['nearly', 8],
    ] as const)
      checkRecording(ops.race(th(kind, n)));
  });
});

describe('race looms', () => {
  it('stand at the front exactly where their rows put them', () => {
    const rec = ops.race(th('random', 12));
    const prog = makeProgram(rec);
    for (let i = 0; i < prog.steps.length; i++) {
      const P = restAt(prog, i);
      for (const L of P.looms) L.threads.forEach((t, j) => expect(t.x).toBeCloseTo(fellX(L.weave, L.rows, j), 9));
    }
  });
  it('weave at one pace, so the first to stop did the least work', () => {
    const rec = ops.race(th('random', 16));
    const prog = makeProgram(rec);
    const tr = buildTransition(prog, 0);
    const P = tr.pose(0.5);
    const A = restAt(prog, -1),
      B = restAt(prog, 0);
    const woven = P.looms.map((L, k) => L.rows - A.looms[k].rows);
    const most = Math.max(...B.looms.map((L, k) => L.rows - A.looms[k].rows));
    for (const w of woven) expect(w).toBeLessThanOrEqual(most / 2 + EPS);
  });
});

describe('openings and seeks', () => {
  it('assembles onto the rest pose', () => {
    const P = makeProgram(ops.race(th('random', 16))).startPose;
    expectSame(assemble(P).pose(1), P, 'assembly ends at rest');
  });
  it('morphs from six looms to one, and back', () => {
    const A = restAt(makeProgram(ops.race(th('random', 12))), 3),
      B = makeProgram(ops.solo('quick', th('random', 12))).startPose;
    expectSame(morph(A, B).pose(0), A, 'morph starts at A');
    expectSame(morph(A, B).pose(1), B, 'morph ends at B');
    expectSame(morph(B, A).pose(1), A, 'and back');
  });
});
