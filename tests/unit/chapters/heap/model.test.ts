// The heap against a plain sorted array doing the same thing, through thousands of
// random operations in both orders, plus the invariants the drawings rely on and
// Graph Net's Dijkstra run replayed on the heap.

import { describe, expect, it } from 'vitest';
import { mulberry } from '@/core/random';
import { runDijkstra } from '@/chapters/graphs/algorithms';
import { PRESETS } from '@/chapters/graphs/presets';
import { listing, type CodeKey } from '@/chapters/heap/code';
import type { Diagram, Recording } from '@/chapters/heap/diagram';
import { KNOTS, STRINGS, queueEvents } from '@/chapters/heap/dijkstra';
import {
  Heap,
  MAX_SIZE,
  heapifyBound,
  heightOf,
  leftOf,
  parentOf,
  pushBound,
  rightOf,
  rowOf,
  rowsFor,
  type Order,
} from '@/chapters/heap/heap';
import * as ops from '@/chapters/heap/ops';
import { START_KEYS, freshWorld } from '@/chapters/heap/state';

const better = (o: Order) => (a: number, b: number) => (o === 'min' ? a - b : b - a);

/** The heap holds exactly the reference's keys, and every parent beats its children. */
function checkHeap(H: Heap, ref: number[]): void {
  expect(H.isHeap(), 'every parent is at least as good as its children').toBe(true);
  expect([...H.keys()].sort((a, b) => a - b)).toEqual([...ref].sort((a, b) => a - b));
}

const CODE_KEYS: CodeKey[] = ['push', 'pop', 'heapify', 'lower', 'dijkstra', 'view'];

/** Every step's diagram only puts keys where they can be drawn, and every step can be read. */
function checkRecording(rec: Recording): void {
  const problems: string[] = [];
  const check = (d: Diagram, where: string, hole: boolean) => {
    const ids = d.items.map(i => i.id);
    if (new Set(ids).size !== ids.length) problems.push(`${where}: item ids are unique`);
    const slots = new Map<number, string>();
    const outs = new Set<number>();
    for (const it of d.items) {
      if (it.place.at === 'slot') {
        const i = it.place.i;
        if (!(i >= 0 && i < d.n)) problems.push(`${where}: ${it.id} is in slot ${i} of ${d.n}`);
        if (slots.has(i)) problems.push(`${where}: slot ${i} holds one key`);
        slots.set(i, it.id);
      } else {
        if (!(it.place.j >= 0 && it.place.j < d.outN)) problems.push(`${where}: ${it.id} is on the tray`);
        outs.add(it.place.j);
      }
    }
    // only a pop's first step leaves a hole, at the top
    const missing = [...Array(d.n).keys()].filter(i => !slots.has(i));
    if (missing.length && !(hole && missing.length === 1 && missing[0] === 0))
      problems.push(`${where}: no gaps in the array (${missing.join(',')})`);
    if (outs.size !== d.outN) problems.push(`${where}: the tray has no gaps`);
    for (const s of [...d.lit, ...d.hot]) if (!(s > 0 && s < d.n)) problems.push(`${where}: a lit wire has a parent`);
  };
  check(rec.start, `${rec.title}: start`, false);
  rec.steps.forEach((s, i) => {
    const where = `${rec.title}: step ${i} (${s.kind})`;
    check(s.diag, where, s.kind === 'take');
    if (!s.head) problems.push(`${where} has a headline`);
    if (/undefined|NaN|\[object|null/.test(`${s.head} ${s.body} ${s.callout?.text ?? ''}`))
      problems.push(`${where} reads cleanly: ${s.head} ${s.body}`);
    if (s.line < 0 || s.line >= listing(s.code, s.diag.order).length)
      problems.push(`${where} lights a line of ${s.code}`);
    for (const j of [...(s.look ?? []), ...(s.path ?? []), ...(s.from != null ? [s.from] : [])])
      if (!(j >= 0 && j < Math.max(s.diag.n, 1))) problems.push(`${where}: slot ${j} is in the heap`);
    if (s.mover && !s.diag.items.some(it => it.id === s.mover)) problems.push(`${where}: the mover is drawn`);
    if (s.path && s.mover) {
      const at = s.diag.items.find(it => it.id === s.mover)?.place;
      if (!(at?.at === 'slot' && at.i === s.path[s.path.length - 1]))
        problems.push(`${where}: the mover ends its path`);
      for (let k = 1; k < s.path.length; k++) {
        const a = s.path[k - 1],
          b = s.path[k];
        if (parentOf(a) !== b && parentOf(b) !== a) problems.push(`${where}: the path follows the wires`);
      }
    }
  });
  if (rec.steps.length && rec.steps[rec.steps.length - 1].ledger < rec.ledger)
    problems.push(`${rec.title}: the ledger only grows`);
  expect(problems).toEqual([]);
}

describe('the index arithmetic', () => {
  it('finds parents, children and rows with no pointers', () => {
    expect([parentOf(1), parentOf(2), parentOf(9), parentOf(10), parentOf(30)]).toEqual([0, 0, 4, 4, 14]);
    expect([leftOf(0), rightOf(0), leftOf(4), rightOf(4)]).toEqual([1, 2, 9, 10]);
    for (let i = 0; i < 64; i++) {
      expect(parentOf(leftOf(i))).toBe(i);
      expect(parentOf(rightOf(i))).toBe(i);
      expect(rowOf(i)).toBe(Math.floor(Math.log2(i + 1)));
    }
    expect([0, 1, 2, 3, 7, 8, 15, 16, 31].map(rowsFor)).toEqual([0, 1, 2, 2, 3, 4, 4, 5, 5]);
  });

  it('bounds heapify by the sum of heights, which stays under n', () => {
    expect(heightOf(0, 15)).toBe(3);
    expect(heightOf(6, 15)).toBe(1);
    expect(heightOf(7, 15)).toBe(0);
    expect(heapifyBound(15)).toBe(11);
    expect(pushBound(15)).toBe(34);
    for (let n = 1; n <= 200; n++) {
      const ones = n.toString(2).replace(/0/g, '').length;
      expect(heapifyBound(n)).toBe(n - ones);
      expect(heapifyBound(n)).toBeLessThan(n);
    }
  });
});

describe('the code card', () => {
  it('keeps every line short, and a max-heap flips only the key comparisons', () => {
    for (const k of CODE_KEYS)
      for (const o of ['min', 'max'] as const) for (const l of listing(k, o)) expect(l.length).toBeLessThanOrEqual(30);
    expect(listing('push', 'max')).toContain('  if a[p] >= a[i]: break');
    expect(listing('pop', 'max')).toContain('  if c+1 < n and a[c+1]>a[c]:');
    expect(listing('pop', 'max')).toContain('while 2*i + 1 < n:');
  });
});

describe('the heap', () => {
  it('starts as a valid min-heap of ten keys', () => {
    const W = freshWorld();
    expect(W.H.keys()).toEqual([...START_KEYS]);
    expect(W.H.isHeap()).toBe(true);
  });

  for (const order of ['min', 'max'] as const)
    it(`matches a sorted array through 5000 random operations (${order})`, () => {
      const rnd = mulberry(order === 'min' ? 11 : 12);
      const H = new Heap(order),
        ref: number[] = [];
      const cmp = better(order);
      for (let step = 0; step < 5000; step++) {
        const r = rnd();
        if (r < 0.5 && H.n < MAX_SIZE) {
          const k = Math.floor(rnd() * 100);
          H.push(k);
          ref.push(k);
        } else if (r < 0.85) {
          const top = H.pop();
          ref.sort(cmp);
          const want = ref.shift();
          expect(top?.key).toBe(want);
        } else if (r < 0.93 && H.n) {
          const i = Math.floor(rnd() * H.n),
            it = H.a[i];
          const k = order === 'min' ? Math.max(0, it.key - Math.floor(rnd() * 20)) : Math.min(99, it.key + 5);
          ref[ref.indexOf(it.key)] = k;
          H.lower(it.id, k);
        } else {
          const keys = Array.from({ length: Math.floor(rnd() * 20) }, () => Math.floor(rnd() * 100));
          H.a = keys.map(k => H.make(k));
          const c = H.heapify();
          expect(c.swaps).toBeLessThanOrEqual(heapifyBound(keys.length));
          ref.length = 0;
          ref.push(...keys);
        }
        checkHeap(H, ref);
      }
    });

  it('every recorded operation leaves the same heap as the quick one, through 400 random operations', () => {
    const rnd = mulberry(5);
    const W = freshWorld(),
      ref: number[] = [...START_KEYS];
    const recs: Recording[] = [];
    for (let step = 0; step < 400; step++) {
      const r = rnd(),
        order = W.H.order;
      let rec: Recording;
      if (r < 0.35) {
        const k = Math.floor(rnd() * 100);
        rec = ops.push(W, k);
        if (ref.length < MAX_SIZE) ref.push(k);
      } else if (r < 0.65) {
        rec = ops.pop(W);
        ref.sort(better(order));
        const want = ref.shift();
        if (want != null) expect(W.H.out[W.H.out.length - 1].key).toBe(want);
      } else if (r < 0.75) {
        const keys = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Math.floor(rnd() * 100));
        rec = ops.pushMany(W, keys);
        for (const k of keys) if (ref.length < MAX_SIZE) ref.push(k);
      } else if (r < 0.85) {
        const keys = Array.from({ length: 2 + Math.floor(rnd() * 20) }, () => Math.floor(rnd() * 100));
        rec = ops.heapify(W, keys);
        ref.length = 0;
        ref.push(...keys);
      } else if (r < 0.9) {
        rec = ops.flip(W, order === 'min' ? 'max' : 'min');
      } else if (r < 0.95) {
        rec = ops.setView(W, W.view === 'tree' ? 'array' : 'tree');
      } else {
        const n = ref.length;
        rec = ops.drain(W);
        const got = W.H.out.slice(W.H.out.length - n).map(it => it.key);
        expect(got).toEqual([...ref].sort(better(order)));
        ref.length = 0;
      }
      checkHeap(W.H, ref);
      recs.push(rec);
    }
    for (const rec of recs) checkRecording(rec);
  });
});

describe('push and pop, step by step', () => {
  it('a push goes in at the end and climbs while it beats its parent', () => {
    const W = freshWorld();
    const rec = ops.push(W, 5);
    expect(rec.steps.map(s => s.kind)).toEqual(['append', 'up', 'swap', 'up', 'swap', 'stay']);
    expect(rec.steps[0].head).toBe('Put 5 in the next free slot: 10.');
    expect(rec.steps[1].callout?.text).toBe('(10 − 1) / 2 = 4');
    expect(W.H.indexOf(rec.steps[0].focus ?? '')).toBe(1);
    expect(W.H.ledger.at(-1)).toMatchObject({ kind: 'push', key: 5, swaps: 2, bound: 3 });
  });

  it('a pop takes the top, moves the last key up, and sinks it past the better child', () => {
    const W = freshWorld();
    const rec = ops.pop(W);
    expect(rec.steps.map(s => s.kind)).toEqual(['take', 'last', 'down', 'swap', 'down', 'swap', 'stay']);
    expect(W.H.out.map(it => it.key)).toEqual([4]);
    expect(W.H.keys()[0]).toBe(9);
    expect(rec.steps[2].look).toEqual([1, 2]);
    expect(rec.steps[2].callout?.text).toBe('2·0 + 1 = 1, 2·0 + 2 = 2');
    expect(rec.steps[1].diag.items.find(it => it.place.at === 'slot' && it.place.i === 0)?.key).toBe(21);
    checkRecording(rec);
  });

  it('refuses a push when full and a pop when empty', () => {
    const W = freshWorld();
    ops.drain(W);
    expect(ops.pop(W).steps.map(s => s.kind)).toEqual(['empty']);
    ops.pushMany(
      W,
      Array.from({ length: MAX_SIZE }, (_, i) => i),
    );
    expect(W.H.n).toBe(MAX_SIZE);
    expect(ops.push(W, 50).steps.map(s => s.kind)).toEqual(['full']);
    expect(W.H.n).toBe(MAX_SIZE);
  });

  it('draining hands every key back in order', () => {
    const W = freshWorld();
    const rec = ops.drain(W);
    expect(W.H.out.map(it => it.key)).toEqual([...START_KEYS].sort((a, b) => a - b));
    expect(rec.steps.filter(s => s.kind === 'pop')).toHaveLength(START_KEYS.length);
    expect(rec.steps.at(-1)?.head).toBe('Out in order: 4 9 12 17 18 21 23 26 31 40.');
  });
});

describe('heapify', () => {
  it('lights the leaves, sinks every parent from the last back to the top, and stays within its bound', () => {
    const W = freshWorld();
    const keys = [44, 12, 87, 5, 63, 29, 71, 38, 9, 56, 20, 91, 3, 47, 15];
    const rec = ops.heapify(W, keys);
    checkRecording(rec);
    const kinds = rec.steps.map(s => s.kind);
    expect(kinds[0]).toBe('scatter');
    expect(kinds[1]).toBe('leaves');
    expect(kinds.at(-1)).toBe('done');
    expect(rec.steps[1].diag.lit).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
    expect(rec.steps[1].head).toBe('8 of the 15 keys are leaves.');
    // each parent's first check is about that parent, from slot 6 back to slot 0
    const firsts = rec.steps
      .filter(
        (s, i) =>
          (s.kind === 'down' || s.kind === 'stay') &&
          rec.steps[i - 1]?.kind !== 'swap' &&
          rec.steps[i - 1]?.kind !== 'down',
      )
      .map(s => /^Slot (\d+)/.exec(s.head)?.[1]);
    expect(firsts).toEqual(['6', '5', '4', '3', '2', '1', '0']);
    expect(W.H.isHeap()).toBe(true);
    const e = W.H.ledger.at(-1);
    expect(e?.kind).toBe('build');
    expect(e?.swaps).toBeLessThanOrEqual(11);
    expect(e?.bound).toBe(11);
  });

  it('flipping the order heapifies the same array under the new rule', () => {
    const W = freshWorld();
    const rec = ops.flip(W, 'max');
    checkRecording(rec);
    expect(W.H.order).toBe('max');
    expect(W.H.isHeap()).toBe(true);
    expect(W.H.keys()[0]).toBe(40);
    expect(rec.steps[0].head).toBe('Flip the rule: the largest key goes on top.');
  });
});

describe('the opening and the views', () => {
  it('draws the arcs, then folds the array into the pyramid', () => {
    const W = freshWorld();
    const rec = ops.opening(W);
    expect(rec.start.view).toBe('array');
    expect(rec.start.wires).toBe(false);
    expect(rec.steps.map(s => [s.kind, s.diag.view, s.diag.wires])).toEqual([
      ['arcs', 'array', true],
      ['fold', 'tree', true],
    ]);
    expect(W.view).toBe('tree');
    const un = ops.setView(W, 'array');
    expect(un.steps[0].diag.view).toBe('array');
    expect(W.view).toBe('array');
  });
});

describe('Dijkstra’s queue', () => {
  it('is Graph Net’s Textbook graph', () => {
    const g = PRESETS.textbook.make();
    const label = (id: number) => g.label(id);
    expect(KNOTS.map(k => k.label)).toEqual(g.sortedIds().map(label));
    const edges = [...g.edges.values()].map(e => [label(e.a), label(e.b), e.w]);
    expect(edges).toEqual(STRINGS.map(s => [...s]));
  });

  it('hands out tickets in exactly Graph Net’s order, lowering tickets in place', () => {
    const W = freshWorld();
    const rec = ops.dijkstra(W);
    checkRecording(rec);
    const got = W.H.out.map(it => `${it.tag}${it.key}`);
    expect(got).toEqual(['A0', 'C2', 'B3', 'D8', 'E10', 'G13', 'F14', 'H18']);
    const g = PRESETS.textbook.make();
    const id = (l: string) => g.sortedIds().find(i => g.label(i) === l) as number;
    const steps = runDijkstra(g, id('A'), id('H'));
    const settled = steps
      .filter(s => s.kind === 'extract')
      .map(s => `${g.label(s.focus as number)}${s.tag[s.focus as number]}`);
    expect(got).toEqual(settled);
    const kinds = rec.steps.map(s => s.kind);
    expect(kinds.filter(k => k === 'relower')).toHaveLength(queueEvents().filter(e => e.ev.kind === 'lower').length);
    expect(kinds.filter(k => k === 'relower').length).toBeGreaterThan(0);
    expect(kinds.filter(k => k === 'keep').length).toBeGreaterThan(0);
    expect(rec.steps.at(-1)?.head).toBe('H is settled at 18: the cheapest route.');
  });
});
