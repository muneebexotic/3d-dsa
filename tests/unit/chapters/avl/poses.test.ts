// The step player's promise: every step starts exactly where the previous one
// came to rest, so playing, stepping and rewinding never jump.

import { expect, it } from 'vitest';
import { AVL, opDelete, opDemo, opInsert, opSearch, type AvlStep } from '@/chapters/avl/engine';
import { R, VR } from '@/chapters/avl/layout';
import {
  buildTransition,
  staticPose,
  type AvlPose,
  type AvlProgram,
  type PoseNode,
  type VisitorPose,
} from '@/chapters/avl/poses';

const EPS = 1e-9;
const shown = (n: { a: number; s: number } | null | undefined): n is PoseNode | VisitorPose =>
  !!n && n.a > EPS && n.s > EPS;

function expectSamePlace(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  where: string,
): void {
  expect(a.x, `${where} x`).toBeCloseTo(b.x, 6);
  expect(a.y, `${where} y`).toBeCloseTo(b.y, 6);
  expect(a.z, `${where} z`).toBeCloseTo(b.z, 6);
}

/** Nothing on screen moves, resizes or pops between the end of one step and the start of the next. */
function expectContinuous(p0: AvlPose, rest: AvlPose, where: string): void {
  for (const id of new Set([...p0.nodes.keys(), ...rest.nodes.keys()])) {
    const a = p0.nodes.get(id),
      b = rest.nodes.get(id),
      at = `${where}, disc ${id}`;
    if (shown(a) && shown(b)) {
      expectSamePlace(a, b, at);
      expect(a.s, `${at} scale`).toBeCloseTo(b.s, 6);
      expect(a.a, `${at} opacity`).toBeCloseTo(b.a, 6);
    } else if (shown(a)) {
      // a new disc takes over from the value in hand, at its size and in its place
      expect(rest.visitor?.v, `${at} appears from nowhere`).toBe(a.v);
      if (rest.visitor) {
        expectSamePlace(a, rest.visitor, at);
        expect(a.s * R, `${at} size`).toBeCloseTo(rest.visitor.s * VR, 6);
      }
    } else if (shown(b)) {
      // a disc leaving becomes the value in hand
      expect(p0.visitor?.v, `${at} vanishes`).toBe(b.v);
    }
  }
  const hand = `${where}, value in hand`;
  if (shown(p0.visitor) && shown(rest.visitor)) {
    expectSamePlace(p0.visitor, rest.visitor, hand);
    expect(p0.visitor.s, hand).toBeCloseTo(rest.visitor.s, 6);
  } else if (shown(p0.visitor)) {
    const from = [...rest.nodes.values()].find(n => shown(n) && n.v === p0.visitor?.v);
    expect(from, `${hand} appears from nowhere`).toBeDefined();
  }
  const arms = new Map(rest.links.map(L => [`${L.p}>${L.c}`, L.ext]));
  for (const L of p0.links) {
    const ext = arms.get(`${L.p}>${L.c}`);
    if (ext != null) expect(L.ext, `${where}, arm ${L.p}>${L.c}`).toBeCloseTo(ext, 6);
  }
}

function program(t: AVL, title: string, run: (t: AVL) => AvlStep[]): AvlProgram {
  const startSnap = t.snap();
  return { title, steps: run(t), startSnap, startPose: staticPose(startSnap) };
}

it('every AVL step starts where the last one rested', () => {
  const t = new AVL();
  for (const v of [41, 20, 65, 11, 29, 50, 91, 26, 33, 72]) t.quickInsert(v);
  const programs = [
    program(t, 'Insert 27', t => opInsert(t, 27)),
    program(t, 'Insert 27 again', t => opInsert(t, 27)),
    program(t, 'Delete 41', t => opDelete(t, 41)),
    program(t, 'Delete 11', t => opDelete(t, 11)),
    program(t, 'Delete 4', t => opDelete(t, 4)),
    program(t, 'Search 72', t => opSearch(t, 72)),
    program(t, 'Search 5', t => opSearch(t, 5)),
    program(t, 'Demo', opDemo),
  ];
  for (const prog of programs) {
    let rest = prog.startPose;
    prog.steps.forEach((step, i) => {
      const tr = buildTransition(prog, i);
      expect(tr.dur).toBeGreaterThan(0);
      expectContinuous(tr.pose(0), rest, `${prog.title}, step ${i} (${step.kind})`);
      rest = tr.pose(1);
    });
    // and the last step comes to rest on the finished tree
    const end = staticPose(prog.steps[prog.steps.length - 1].snap);
    for (const [id, n] of end.nodes) {
      const got = rest.nodes.get(id);
      expect(got, `${prog.title}: disc ${id} at rest`).toBeDefined();
      if (got) expectSamePlace(got, n, `${prog.title}: disc ${id} at rest`);
    }
  }
});
