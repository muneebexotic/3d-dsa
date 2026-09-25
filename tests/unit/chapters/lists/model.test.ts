// Every structure against a plain JavaScript array doing the same thing, through
// thousands of random operations, plus the invariants the drawings rely on.

import { describe, expect, it } from 'vitest';
import { mulberry } from '@/core/random';
import * as arr from '@/chapters/lists/array';
import { bridgeSearch, neighbors, BRIDGE_LABELS } from '@/chapters/lists/bridge';
import { CODE } from '@/chapters/lists/code';
import type { Diagram, Recording } from '@/chapters/lists/diagram';
import { LinkedList } from '@/chapters/lists/linked';
import * as list from '@/chapters/lists/listops';
import * as ring from '@/chapters/lists/queue';
import * as stack from '@/chapters/lists/stack';

/** Pointers inside a list agree with each other, and every node is reachable. */
function checkList(L: LinkedList): void {
  const order = L.order();
  expect(order.length, 'every node is in the chain').toBe(L.nodes.size);
  expect(L.head).toBe(order[0] ?? null);
  expect(L.tail).toBe(order[order.length - 1] ?? null);
  if (L.tail != null) expect(L.node(L.tail).next).toBeNull();
  if (L.doubly) {
    if (L.head != null) expect(L.node(L.head).prev).toBeNull();
    for (let i = 1; i < order.length; i++) expect(L.node(order[i]).prev).toBe(order[i - 1]);
  }
  const addrs = order.map(id => L.node(id).addr);
  expect(new Set(addrs).size, 'addresses are unique').toBe(addrs.length);
  for (const a of addrs) expect(a).toBeGreaterThan(0); // 0 is null
}

/** Every step's diagram only points at things that are drawn. */
function checkDiagrams(rec: Recording): void {
  const check = (d: Diagram, where: string) => {
    const items = new Set(d.items.map(i => i.id));
    expect(items.size, `${where}: item ids are unique`).toBe(d.items.length);
    for (const w of d.wires) {
      expect(items.has(w.from), `${where}: wire ${w.id} starts on a drawn node`).toBe(true);
      if (w.to != null) expect(items.has(w.to), `${where}: wire ${w.id} ends on a drawn node`).toBe(true);
    }
    const cells = new Set(d.blocks.flatMap(b => Array.from({ length: b.cap }, (_, i) => `c:${b.id}:${i}`)));
    const knots = new Set(d.net?.knots.map(k => k.id) ?? []);
    for (const f of d.flags)
      if (f.to != null)
        expect(items.has(f.to) || cells.has(f.to) || knots.has(f.to), `${where}: flag ${f.id}`).toBe(true);
  };
  check(rec.start, `${rec.title}: start`);
  rec.steps.forEach((s, i) => {
    check(s.diag, `${rec.title}: step ${i} (${s.kind})`);
    expect(s.head.length, `${rec.title}: step ${i} has a headline`).toBeGreaterThan(0);
    expect(s.line, `${rec.title}: step ${i} lights a line of ${s.code}`).toBeLessThan(CODE[s.code].length);
  });
}

describe('code listings', () => {
  it('fit the code card: no line longer than 30 characters', () => {
    for (const [key, lines] of Object.entries(CODE))
      for (const l of lines) expect(l.length, `${key}: “${l}”`).toBeLessThanOrEqual(30);
  });
});

describe.each(['singly', 'doubly'] as const)('%s linked list', kind => {
  it('matches an array through 2000 random operations', () => {
    const rnd = mulberry(kind === 'singly' ? 11 : 12);
    const L = new LinkedList(kind, 3);
    const ref: number[] = [];
    for (let t = 0; t < 2000; t++) {
      const r = rnd(),
        v = Math.floor(rnd() * 100),
        n = ref.length;
      let rec: Recording;
      if (r < 0.3 && n < list.MAX_NODES) {
        const i = Math.floor(rnd() * (n + 1));
        rec = list.insertAt(L, v, i);
        ref.splice(i, 0, v);
      } else if (r < 0.4 && n < list.MAX_NODES) {
        rec = list.insertHead(L, v);
        ref.unshift(v);
      } else if (r < 0.5 && n < list.MAX_NODES) {
        rec = list.insertTail(L, v);
        ref.push(v);
      } else if (r < 0.75) {
        const i = Math.floor(rnd() * (n + 1)) - (rnd() < 0.1 ? 0 : 1); // sometimes out of range
        rec = list.deleteAt(L, i);
        if (i >= 0 && i < n) ref.splice(i, 1);
      } else if (r < 0.85) {
        rec = list.search(L, v);
        const last = rec.steps[rec.steps.length - 1];
        if (n) expect(last.kind).toBe(ref.includes(v) ? 'found' : 'missing');
      } else if (r < 0.93) {
        const i = Math.floor(rnd() * Math.max(1, n));
        rec = list.get(L, i);
        if (n) expect(rec.steps.at(-1)?.head).toContain(`holds ${ref[i]}`);
      } else {
        rec = list.reverse(L);
        ref.reverse();
      }
      expect(L.values(), `after ${rec.title}`).toEqual(ref);
      checkList(L);
      if (t % 25 === 0) checkDiagrams(rec);
    }
  });

  it('counts the walk and the splice separately', () => {
    const L = new LinkedList(kind, 3);
    for (const v of [4, 8, 15, 16, 23, 42]) L.quickAppend(v);
    const rec = list.insertAt(L, 99, 2);
    const cost = rec.steps.at(-1)?.cost;
    expect(cost?.hops).toBe(1);
    expect(cost?.writes).toBe(kind === 'singly' ? 2 : 4);
    // a doubly linked list walks from the nearer end
    const far = list.insertAt(L, 77, 6);
    expect(far.steps.at(-1)?.cost.hops).toBe(kind === 'singly' ? 5 : 1);
  });

  it('reverses by turning pointers, not by moving nodes', () => {
    const L = new LinkedList(kind, 3);
    for (const v of [4, 8, 15, 16, 23, 42]) L.quickAppend(v);
    const addrs = new Map([...L.nodes.values()].map(n => [n.id, n.addr]));
    const rec = list.reverse(L);
    expect(L.values()).toEqual([42, 23, 16, 15, 8, 4]);
    for (const n of L.nodes.values()) expect(n.addr).toBe(addrs.get(n.id));
    expect(rec.steps.filter(s => s.kind === (kind === 'singly' ? 'swing' : 'swap'))).toHaveLength(6);
    expect(rec.steps.at(-1)?.kind).toBe('turn');
    checkDiagrams(rec);
  });

  it('handles the empty list, a single node and bad indexes without changing anything', () => {
    const L = new LinkedList(kind, 3);
    for (const rec of [list.deleteAt(L, 0), list.search(L, 5), list.get(L, 0), list.reverse(L)]) {
      expect(rec.steps).toHaveLength(1);
      expect(rec.steps[0].kind).toBe('empty');
    }
    list.insertHead(L, 7);
    expect(list.reverse(L).steps.length).toBeGreaterThan(1);
    expect(L.values()).toEqual([7]);
    for (const rec of [list.insertAt(L, 1, 5), list.deleteAt(L, 1), list.get(L, -1), list.deleteAt(L, 0.5)])
      expect(rec.steps.map(s => s.kind)).toEqual(['empty']);
    expect(L.values()).toEqual([7]);
    list.deleteAt(L, 0);
    expect(L.values()).toEqual([]);
    expect(L.head).toBeNull();
    expect(L.tail).toBeNull();
  });
});

describe('dynamic array', () => {
  it('matches an array through 2000 random operations, growing by doubling', () => {
    const rnd = mulberry(5);
    const A = new arr.DynArray(4);
    const ref: number[] = [];
    for (let t = 0; t < 2000; t++) {
      const r = rnd(),
        v = Math.floor(rnd() * 100),
        n = ref.length;
      let rec: Recording;
      if (r < 0.45 && n < arr.MAX_ARRAY) {
        const i = Math.floor(rnd() * (n + 1));
        rec = arr.insert(A, i, v);
        ref.splice(i, 0, v);
      } else if (r < 0.75) {
        const i = Math.floor(rnd() * Math.max(1, n));
        rec = arr.remove(A, i);
        if (n) ref.splice(i, 1);
      } else if (r < 0.85) rec = arr.search(A, v);
      else if (r < 0.93) rec = arr.get(A, Math.floor(rnd() * Math.max(1, n)));
      else {
        rec = arr.reverse(A);
        ref.reverse();
      }
      expect(A.values(), `after ${rec.title}`).toEqual(ref);
      expect(A.cap).toBeGreaterThanOrEqual(A.len);
      expect(Math.log2(A.cap) % 1).toBe(0);
      for (let i = A.len; i < A.cap; i++) expect(A.cells[i]).toBeNull();
      if (t % 25 === 0) checkDiagrams(rec);
    }
  });

  it('jumps straight to an index, but shifts to open a gap', () => {
    const A = new arr.DynArray(8);
    for (const v of [4, 8, 15, 16, 23, 42]) A.quickAppend(v);
    const get = arr.get(A, 4);
    expect(get.steps.map(s => s.kind)).toEqual(['jump']);
    expect(get.steps[0].cost).toMatchObject({ jumps: 1, hops: 0 });
    const ins = arr.insert(A, 1, 99);
    expect(ins.steps.filter(s => s.kind === 'shift')).toHaveLength(5);
    expect(A.values()).toEqual([4, 99, 8, 15, 16, 23, 42]);
  });

  it('copies everything into a block twice the size when full', () => {
    const A = new arr.DynArray(4);
    for (const v of [1, 2, 3, 4]) A.quickAppend(v);
    const rec = arr.insert(A, 4, 5);
    expect(rec.steps.map(s => s.kind)).toEqual(['grow', 'copy', 'copy', 'copy', 'copy', 'retire', 'write', 'done']);
    expect(A.cap).toBe(8);
    const during = rec.steps[1].diag.blocks;
    expect(during.map(b => b.row)).toEqual([0, 1]);
    expect(during[1].cap).toBe(8);
    checkDiagrams(rec);
  });
});

describe('stack', () => {
  it('is last in, first out', () => {
    const S = new LinkedList('stack', 5);
    const rec = stack.fillAndEmpty(S, [1, 2, 3, 4, 5]);
    expect(S.out.map(e => e.val)).toEqual([5, 4, 3, 2, 1]);
    expect(S.size).toBe(0);
    checkDiagrams(rec);
  });

  it('matches an array used as a stack', () => {
    const rnd = mulberry(9);
    const S = new LinkedList('stack', 5);
    const ref: number[] = [];
    for (let t = 0; t < 1500; t++) {
      if (rnd() < 0.55) {
        const v = Math.floor(rnd() * 100);
        stack.push(S, v);
        if (ref.length < stack.MAX_STACK) ref.push(v);
      } else {
        const rec = stack.pop(S);
        const v = ref.pop();
        if (v == null) expect(rec.steps.map(s => s.kind)).toEqual(['underflow']);
        else expect(S.out.at(-1)?.val).toBe(v);
      }
      expect(S.values()).toEqual([...ref].reverse());
      checkList(S);
    }
  });

  it('peeks without removing', () => {
    const S = new LinkedList('stack', 5);
    expect(stack.peek(S).steps[0].kind).toBe('underflow');
    stack.push(S, 3);
    expect(stack.peek(S).steps[0].head).toContain('3');
    expect(S.values()).toEqual([3]);
  });
});

describe('ring buffer queue', () => {
  it('is first in, first out, and wraps round', () => {
    const Q = new ring.RingQueue();
    Q.reset(5);
    const rec = ring.fillAndEmpty(Q, [1, 2, 3, 4, 5]);
    expect(Q.out.map(e => e.val)).toEqual([1, 2, 3, 4, 5]);
    expect(rec.steps.some(s => s.kind === 'move' && s.head.includes('wraps'))).toBe(true);
    checkDiagrams(rec);
  });

  it('matches an array used as a queue, and refuses a ninth value', () => {
    const rnd = mulberry(21);
    const Q = new ring.RingQueue();
    const ref: number[] = [];
    for (let t = 0; t < 1500; t++) {
      if (rnd() < 0.55) {
        const v = Math.floor(rnd() * 100);
        const rec = ring.enqueue(Q, v);
        if (ref.length < ring.RING_CAP) ref.push(v);
        else expect(rec.steps.map(s => s.kind)).toEqual(['overflow']);
      } else {
        const rec = ring.dequeue(Q);
        const v = ref.shift();
        if (v == null) expect(rec.steps.map(s => s.kind)).toEqual(['underflow']);
        else expect(Q.out.at(-1)?.val).toBe(v);
      }
      expect(Q.values()).toEqual(ref);
      expect(Q.size).toBe(ref.length);
      expect((Q.front + Q.size) % Q.cap).toBe(Q.back);
    }
  });
});

describe('bridge to Graph Net', () => {
  /** Reference BFS layers from A. */
  function layers(): number[] {
    const d = BRIDGE_LABELS.map(() => -1);
    d[0] = 0;
    const q = [0];
    while (q.length) {
      const x = q.shift() as number;
      for (const y of neighbors(x))
        if (d[y] < 0) {
          d[y] = d[x] + 1;
          q.push(y);
        }
    }
    return d;
  }

  it('with a queue, visits knots in rings (BFS)', () => {
    const rec = bridgeSearch('bfs');
    const d = layers();
    const seen = rec.order.map(l => d[BRIDGE_LABELS.indexOf(l as (typeof BRIDGE_LABELS)[number])]);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(rec.order).toHaveLength(BRIDGE_LABELS.length);
    checkDiagrams(rec);
  });

  it('with a stack, dives before it backs up (DFS)', () => {
    const rec = bridgeSearch('dfs');
    expect(rec.order).toEqual(['A', 'C', 'F', 'G', 'E', 'B', 'D']);
    // each visited knot after the first is a neighbor of some earlier one on the current path
    for (let i = 1; i < rec.order.length; i++) {
      const k = BRIDGE_LABELS.indexOf(rec.order[i] as (typeof BRIDGE_LABELS)[number]);
      const earlier = rec.order.slice(0, i).map(l => BRIDGE_LABELS.indexOf(l as (typeof BRIDGE_LABELS)[number]));
      expect(neighbors(k).some(n => earlier.includes(n))).toBe(true);
    }
    expect(rec.steps.filter(s => s.kind === 'skip')).toHaveLength(1);
    checkDiagrams(rec);
  });

  it('never overfills the ring', () => {
    for (const s of bridgeSearch('bfs').steps) expect(s.diag.blocks[0].len).toBeLessThanOrEqual(ring.RING_CAP);
  });
});
