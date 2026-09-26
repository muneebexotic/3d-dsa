// The step player's promise: every step starts exactly where the previous one
// came to rest and ends exactly on its own rest pose, so playing, stepping and
// rewinding never jump.

import { describe, expect, it } from 'vitest';
import type { Recording } from '@/chapters/trie/diagram';
import { assemble, buildTransition, morph } from '@/chapters/trie/motion';
import * as ops from '@/chapters/trie/ops';
import { CHANNELS, makeProgram, restAt, type FanPose, type Pose } from '@/chapters/trie/poses';
import { dictOf, type Dict } from '@/chapters/trie/trie';
import { SIZES, WORDS, type Size } from '@/chapters/trie/words';

const EPS = 1e-6;
const DICTS = Object.fromEntries(SIZES.map(s => [s, dictOf(WORDS[s])])) as Record<Size, Dict>;

/** Everything that can be seen of a sunburst: each node that is there, and what is lit. */
function geometry(P: Pose): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  P.fans.forEach((F: FanPose) => {
    if (F.a < EPS) return;
    const k = F.key;
    Object.assign(out, { [`${k}.a`]: F.a, [`${k}.cx`]: F.cx, [`${k}.cy`]: F.cy });
    // a big sunburst is checked on a sample: every seventh node, and everything lit
    const big = F.uni.ids.length > 600;
    F.uni.ids.forEach((id, i) => {
      if (F.al[i] < EPS) return;
      if (big && i % 7 && F.uni.depth[i] > 1 && !(F.path[i] + F.glow[i] + F.lit[i] + F.fresh[i] + F.doom[i])) return;
      for (const c of CHANNELS) out[`${k}.${id}.${c}`] = F[c][i];
      out[`${k}.${id}.up`] = F.up[i] >= 0 ? F.uni.ids[F.up[i]] : '-';
    });
    if (F.wedge && F.wedge.a > EPS)
      Object.assign(out, { [`${k}.wedge0`]: F.wedge.th0, [`${k}.wedge1`]: F.wedge.th1, [`${k}.wedgeA`]: F.wedge.a });
    if (F.miss && F.miss.a > EPS)
      Object.assign(out, { [`${k}.miss`]: F.miss.ch, [`${k}.missTh`]: F.miss.th, [`${k}.missA`]: F.miss.a });
    for (const l of F.labels)
      if (l.a > EPS) Object.assign(out, { [`${k}.label.${l.key}`]: l.th, [`${k}.labelA.${l.key}`]: l.a });
    Object.assign(out, { [`${k}.fx`]: F.sparks.length + F.pulses.length + (F.ripple ? 1 : 0) });
  });
  if (P.callout && P.callout.al > EPS) Object.assign(out, { callout: P.callout.text, calloutA: P.callout.al });
  Object.assign(out, { x0: P.x0, x1: P.x1 });
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
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const P = tr.pose(t);
      for (const F of P.fans)
        for (let n = 0; n < F.th.length; n++)
          expect(Number.isFinite(F.th[n] + F.rr[n] + F.r[n] + F.al[n]), `${where} at ${t}`).toBe(true);
    }
  }
}

describe('every step starts where the last one rested', () => {
  it('sharing the beginnings', () => {
    checkRecording(ops.zip(DICTS[20], 20));
    checkRecording(ops.zip(DICTS[200], 200));
  });
  it('typing', () => {
    for (const w of ['CART', 'CARX', 'X', 'TOP', 'BEE']) checkRecording(ops.typeAhead(DICTS[20], 20, w));
    checkRecording(ops.typeAhead(DICTS[2000], 2000, 'STRONG'));
  });
  it('search', () => {
    for (const w of ['CART', 'CARTO', 'CARS', 'Q', 'AN']) checkRecording(ops.search(DICTS[20], 20, w));
  });
  it('insert and delete', () => {
    for (const w of ['CARS', 'ZOO', 'CARTO', 'CART', 'BEAR']) checkRecording(ops.insert(DICTS[20], 20, w));
    for (const w of ['CARTOON', 'CART', 'DOG', 'BEE', 'CARS', 'AN']) checkRecording(ops.remove(DICTS[20], 20, w));
    checkRecording(ops.insert(DICTS[200], 200, 'TRIE'));
  });
  it('spell check', () => {
    for (const w of ['DOE', 'CRAT', 'CART', 'ZZZ']) checkRecording(ops.spell(DICTS[20], 20, w));
    checkRecording(ops.spell(DICTS[200], 200, 'HOUES'));
  });
  it('three sizes', () => {
    checkRecording(ops.three(DICTS, 'CART'));
    checkRecording(ops.three(DICTS, 'HOUSE'));
  });
});

describe('openings and seeks', () => {
  it('assembles onto the rest pose', () => {
    const P = makeProgram(ops.zip(DICTS[20], 20)).startPose;
    expectSame(assemble(P).pose(1), P, 'assembly ends at rest');
  });
  it('morphs between recordings, and between sizes', () => {
    const a = makeProgram(ops.search(DICTS[20], 20, 'CART')),
      b = makeProgram(ops.three(DICTS, 'CART')),
      c = makeProgram(ops.typeAhead(DICTS[200], 200, 'CA'));
    const A = restAt(a, 3),
      B = b.startPose,
      C = restAt(c, 1);
    expectSame(morph(A, B).pose(0), A, 'morph starts at A');
    expectSame(morph(A, B).pose(1), B, 'morph ends at B');
    expectSame(morph(B, C).pose(1), C, 'and on to another size');
    for (const t of [0.25, 0.5, 0.75]) {
      const P = morph(A, C).pose(t);
      for (const F of P.fans)
        for (let n = 0; n < F.th.length; n++) expect(Number.isFinite(F.th[n] + F.rr[n])).toBe(true);
    }
  });
});
