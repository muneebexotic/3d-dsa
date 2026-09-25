import { describe, expect, it } from 'vitest';
import {
  AVL,
  maxAvlHeight,
  opClear,
  opDelete,
  opDemo,
  opInsert,
  opSearch,
  type AvlStep,
  type Snap,
} from '@/chapters/avl/engine';
import { mulberry } from '@/core/random';

/** Checks every AVL invariant and returns the values in order. */
function checkTree(s: Snap): number[] {
  const out: number[] = [];
  const walk = (id: number | null, lo: number, hi: number): number => {
    if (id == null) return 0;
    const n = s.n[id];
    expect(n.v).toBeGreaterThan(lo);
    expect(n.v).toBeLessThan(hi);
    const hl = walk(n.l, lo, n.v);
    out.push(n.v);
    const hr = walk(n.r, n.v, hi);
    expect(n.h).toBe(1 + Math.max(hl, hr));
    expect(n.bf).toBe(hl - hr);
    expect(Math.abs(n.bf)).toBeLessThanOrEqual(1);
    return n.h;
  };
  walk(s.root, -Infinity, Infinity);
  expect(out.length).toBe(Object.keys(s.n).length);
  return out;
}

const kinds = (steps: AvlStep[]) => steps.map(s => s.kind);

describe('AVL', () => {
  it('stays a balanced search tree through thousands of random operations', () => {
    const rnd = mulberry(7);
    const t = new AVL(),
      model = new Set<number>();
    for (let k = 0; k < 3000; k++) {
      const v = Math.floor(rnd() * 120),
        r = rnd();
      if (r < 0.55) {
        opInsert(t, v);
        model.add(v);
      } else if (r < 0.9) {
        opDelete(t, v);
        model.delete(v);
      } else {
        const before = JSON.stringify(t.snap());
        const steps = opSearch(t, v);
        expect(JSON.stringify(t.snap())).toBe(before);
        expect(kinds(steps)).toContain(model.has(v) ? 'found' : 'missing');
      }
      expect(checkTree(t.snap())).toEqual([...model].sort((a, b) => a - b));
      expect(t.h(t.root)).toBeLessThanOrEqual(maxAvlHeight(t.count));
    }
  }, 30_000); // 3000 recorded operations can take longer than the 5 s default on a slow machine

  it('snapshots every step, and the last one is the tree as it stands', () => {
    const t = new AVL();
    for (const v of [41, 20, 65, 11, 29, 50, 91, 26]) t.quickInsert(v);
    for (const op of [(t: AVL) => opInsert(t, 27), (t: AVL) => opDelete(t, 41), (t: AVL) => opSearch(t, 50)]) {
      const steps = op(t);
      expect(steps.length).toBeGreaterThan(1);
      for (const s of steps) expect(s.snap.root === null || s.snap.n[s.snap.root] != null).toBe(true);
      expect(steps[steps.length - 1].snap).toEqual(t.snap());
    }
  });

  it('leaves the tree alone on a duplicate insert or a missing delete', () => {
    const t = new AVL();
    for (const v of [5, 3, 8]) t.quickInsert(v);
    const before = JSON.stringify(t.snap());
    expect(kinds(opInsert(t, 3))).toContain('duplicate');
    expect(kinds(opDelete(t, 4))).toContain('missing');
    expect(JSON.stringify(t.snap())).toBe(before);
  });

  it('the demo shows all four rotation cases', () => {
    const t = new AVL();
    t.quickInsert(99);
    const steps = opDemo(t);
    expect(steps[0].kind).toBe('clear');
    const cases = new Set(steps.filter(s => s.kind === 'rotate').map(s => s.kase));
    expect(cases).toEqual(new Set(['LL', 'RR', 'LR', 'RL']));
    expect(checkTree(t.snap())).toEqual([10, 15, 20, 30, 35, 40, 50]);
  });

  it('clears', () => {
    const t = new AVL();
    t.quickInsert(1);
    opClear(t);
    expect(t.count).toBe(0);
    expect(t.root).toBeNull();
  });

  it('knows the tallest possible AVL tree for n values', () => {
    expect([0, 1, 2, 3, 4, 7, 12, 20, 33].map(maxAvlHeight)).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 7]);
  });
});
