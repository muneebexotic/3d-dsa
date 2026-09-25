// Both hash tables against a plain JavaScript Set doing the same thing, through
// thousands of random operations, plus the invariants the drawings rely on.

import { describe, expect, it } from 'vitest';
import { mulberry } from '@/core/random';
import { CODE } from '@/chapters/hashing/code';
import { parseBucket, type Diagram, type Recording } from '@/chapters/hashing/diagram';
import { SCRAMBLE, bucketOf, hashCode, hashSum, windWords } from '@/chapters/hashing/hash';
import * as ops from '@/chapters/hashing/ops';
import { START_KEYS, fresh } from '@/chapters/hashing/state';
import { HashTable, MAX_KEYS, MAX_LOAD, MAX_SIZE, TOMB, type Strategy } from '@/chapters/hashing/table';

/** Every key sits where its hash says it should, once. */
function checkTable(T: HashTable, ref: Set<number>): void {
  expect(new Set(T.keys()), 'the same keys as the reference').toEqual(ref);
  expect(T.keys().length, 'no key is stored twice').toBe(ref.size);
  const problems: string[] = [];
  if (T.strategy === 'chain')
    T.chains.forEach((c, i) => {
      for (const k of c) if (T.home(k) !== i) problems.push(`${k} is in bucket ${i}, not its own`);
    });
  else {
    if (T.slots.length !== T.m) problems.push('one slot per bucket');
    for (const k of ref) {
      const w = T.probe(k);
      if (w.found < 0) problems.push(`${k} is not found by probing`);
      // no empty slot between a key's home and where it sits
      if (w.path.some(s => T.slots[s] == null)) problems.push(`the walk to ${k} crosses an empty slot`);
    }
  }
  expect(problems).toEqual([]);
}

/** Every step's diagram only refers to things that are drawn, and every step can be read. */
function checkRecording(rec: Recording): void {
  const problems: string[] = [];
  const check = (d: Diagram, where: string) => {
    const rings = new Map(d.rings.map(r => [r.id, r.m]));
    if (d.rings.filter(r => r.role === 'live').length !== 1) problems.push(`${where}: one live ring`);
    const ids = d.items.map(i => i.id);
    const items = new Set(ids);
    if (items.size !== ids.length) problems.push(`${where}: item ids are unique`);
    for (const it of d.items)
      if (it.place.at === 'bucket' && !(it.place.index < (rings.get(it.place.ring) ?? 0)))
        problems.push(`${where}: ${it.id} is in a bucket of a drawn ring`);
    for (const l of d.links) {
      const b = parseBucket(l.from);
      if (!items.has(l.from) && !(b && rings.has(b.ring))) problems.push(`${where}: link ${l.id} starts on nothing`);
      if (!items.has(l.to)) problems.push(`${where}: link ${l.id} ends on nothing`);
    }
    for (const t of d.tombs) if (!rings.has(t.ring)) problems.push(`${where}: tomb ${t.id} is on a drawn ring`);
    if (d.hand < 0 || d.hand >= d.m) problems.push(`${where}: the hand points at an hour`);
  };
  check(rec.start, `${rec.title}: start`);
  rec.steps.forEach((s, i) => {
    const where = `${rec.title}: step ${i} (${s.kind})`;
    check(s.diag, where);
    if (!s.head) problems.push(`${where} has a headline`);
    if (/undefined|NaN|\[object/.test(`${s.head} ${s.body}`)) problems.push(`${where} reads cleanly`);
    if (s.line >= CODE[s.code].length) problems.push(`${where} lights a line of ${s.code}`);
    if (s.wind != null && s.wind % s.diag.m !== s.diag.hand)
      problems.push(`${where}: the hand stops where it winds to`);
  });
  expect(problems).toEqual([]);
}

describe('hash functions', () => {
  it('plain hashing is the key itself; the clock takes it mod m', () => {
    expect(hashCode(57, 'plain')).toBe(57);
    expect(bucketOf(57, 8, 'plain')).toBe(1);
    expect(hashSum(57, 8, 'plain')).toBe('57 mod 8 = 1');
    expect(windWords(57, 8)).toBe('seven full turns and 1 more');
    expect(windWords(16, 8)).toBe('exactly two full turns');
    expect(windWords(5, 8)).toBe('less than one full turn');
  });

  it('the scrambled hash is (37k + 11) mod 101, and spreads multiples of 8', () => {
    for (let k = 0; k <= 99; k++) expect(hashCode(k, 'scrambled')).toBe((SCRAMBLE.a * k + SCRAMBLE.b) % SCRAMBLE.p);
    const plain = new Set(ops.UNLUCKY.map(k => bucketOf(k, 8, 'plain')));
    const mixed = new Set(ops.UNLUCKY.map(k => bucketOf(k, 8, 'scrambled')));
    expect(plain.size).toBe(1);
    expect(mixed.size).toBeGreaterThanOrEqual(5);
  });
});

describe('code listings', () => {
  it('fit the code card: no line longer than 30 characters', () => {
    for (const [key, lines] of Object.entries(CODE))
      for (const l of lines) expect(l.length, `${key}: “${l}”`).toBeLessThanOrEqual(30);
  });
});

describe('the opening table', () => {
  it('holds six keys in eight buckets, with a collision in each style', () => {
    const C = fresh('chain'),
      P = fresh('probe');
    expect(C.n).toBe(START_KEYS.length);
    expect(C.m).toBe(8);
    expect(C.load).toBe(MAX_LOAD);
    expect(C.chains[1]).toEqual([25, 33]);
    expect(C.chains[6]).toEqual([46, 70]);
    expect(P.slots).toEqual([null, 25, 33, 59, 12, null, 46, 70]);
    expect(C.ledger).toHaveLength(START_KEYS.length);
  });
});

describe.each(['chain', 'probe'] as Strategy[])('%s', strategy => {
  it('matches a Set through 3000 random quick operations, growing as it fills', () => {
    const rnd = mulberry(strategy === 'chain' ? 5 : 6);
    const T = new HashTable(strategy);
    const ref = new Set<number>();
    for (let t = 0; t < 3000; t++) {
      const k = Math.floor(rnd() * 100),
        r = rnd();
      if (r < 0.5 && ref.size < MAX_KEYS) {
        T.quickInsert(k);
        ref.add(k);
        if (T.overloaded && T.canGrow) T.rebuild(T.m * 2);
      } else if (r < 0.8) {
        expect(T.quickRemove(k)).toBe(ref.delete(k));
      } else if (r < 0.83) {
        T.rebuild(T.m, T.hash === 'plain' ? 'scrambled' : 'plain');
        expect(T.tombs).toBe(0);
      } else expect(T.has(k)).toBe(ref.has(k));
      checkTable(T, ref);
    }
  });

  it('records operations that leave it matching a Set, with a ledger entry for each', () => {
    const rnd = mulberry(strategy === 'chain' ? 21 : 22);
    const T = fresh(strategy);
    const ref = new Set<number>(START_KEYS);
    for (let t = 0; t < 400; t++) {
      const k = Math.floor(rnd() * 100),
        r = rnd(),
        grow = rnd() < 0.8;
      const before = T.ledger.length;
      let rec: Recording;
      if (r < 0.4) {
        const room = strategy === 'chain' ? ref.size < MAX_KEYS : ref.size < T.m;
        rec = ops.insert(T, k, { grow });
        if (room || ref.has(k)) ref.add(k);
        expect(T.ledger.length, 'an insert costs one entry, plus one for a rehash').toBeGreaterThanOrEqual(
          before + (rec.steps[0].kind === 'refuse' ? 0 : 1),
        );
      } else if (r < 0.65) {
        rec = ops.search(T, k);
        expect(rec.steps.at(-1)?.kind).toBe(ref.has(k) ? 'found' : 'missing');
        expect(T.ledger.length).toBe(before + 1);
      } else if (r < 0.9) {
        rec = ops.remove(T, k);
        expect(rec.steps.at(-1)?.kind).toBe(ref.has(k) ? (strategy === 'chain' ? 'free' : 'tomb') : 'missing');
        ref.delete(k);
      } else if (r < 0.95) {
        const keys = [k, (k + 37) % 100, (k + 71) % 100];
        rec = ops.insertMany(T, keys, { grow }, 'batch');
        for (const x of keys) if (T.has(x)) ref.add(x);
      } else {
        rec = ops.switchHash(T, T.hash === 'plain' ? 'scrambled' : 'plain');
        expect(rec.steps.map(s => s.kind)).toContain('lift');
      }
      checkTable(T, ref);
      checkRecording(rec);
      for (const e of T.ledger) expect(e.work).toBeGreaterThanOrEqual(1);
      // the table never stays over-full while it could grow
      if (grow && rec.steps.some(s => s.kind === 'full')) expect(T.load).toBeLessThanOrEqual(MAX_LOAD);
    }
  });

  it('doubles when it passes three quarters full, rehashing every key', () => {
    const T = fresh(strategy);
    const rec = ops.insert(T, 41, { grow: true });
    const kinds = rec.steps.map(s => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['full', 'grow', 'rehash', 'fountain', 'retire']));
    expect(T.m).toBe(16);
    expect(T.n).toBe(7);
    expect(T.ledger.at(-1)).toMatchObject({ kind: 'rehash', work: 7 });
    expect(rec.steps.at(-1)?.cost.moves).toBe(7);
    // with twice the buckets, a key either keeps its number or moves up by 8
    for (const k of T.keys()) expect([bucketOf(k, 8, 'plain'), bucketOf(k, 8, 'plain') + 8]).toContain(T.home(k));
  });

  it('does not grow when growing is off, or past the biggest clock', () => {
    const T = fresh(strategy);
    ops.insert(T, 41, { grow: false });
    expect(T.m).toBe(8);
    const U = new HashTable(strategy, MAX_SIZE);
    for (let k = 0; k < 25; k++) U.quickInsert(k * 3);
    const rec = ops.insert(U, 98, { grow: true });
    expect(U.m).toBe(MAX_SIZE);
    expect(rec.steps.map(s => s.kind)).not.toContain('grow');
  });

  it('shows the worst case with unlucky keys, and spreads them with the scrambled hash', () => {
    const T = fresh(strategy);
    const rec = ops.unlucky(T, { grow: false });
    expect(rec.steps.at(-1)?.kind).toBe('done');
    expect(T.ledger.filter(e => e.kind === 'insert').map(e => e.work)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    if (strategy === 'chain') expect(T.chains[0]).toEqual([...ops.UNLUCKY]);
    else expect(T.longest()).toBe(7);
    ops.switchHash(T, 'scrambled');
    expect(new Set(T.keys().map(k => T.home(k))).size, 'the same keys now land in many buckets').toBeGreaterThanOrEqual(
      6,
    );
    if (strategy === 'chain') expect(T.longest()).toBeLessThanOrEqual(2);
  });
});

describe('linear probing', () => {
  it('leaves a tombstone, so a key further along is still found', () => {
    const T = fresh('probe'); // slots: _ 25 33 59 12 _ 46 70
    const rec = ops.remove(T, 25);
    expect(T.slots[1]).toBe(TOMB);
    expect(rec.steps.at(-1)?.body).toContain('33');
    expect(ops.search(T, 33).steps.at(-1)?.kind).toBe('found');
  });

  it('reuses the first tombstone once the key is known to be missing', () => {
    const T = fresh('probe');
    T.quickRemove(33);
    ops.insert(T, 17, { grow: false });
    expect(T.slots[2]).toBe(17);
    expect(T.tombs).toBe(0);
  });

  it('refuses a key when every slot is full', () => {
    const T = new HashTable('probe');
    for (let k = 0; k < 8; k++) T.quickInsert(k);
    const rec = ops.insert(T, 50, { grow: false });
    expect(rec.steps.map(s => s.kind)).toEqual(['refuse']);
    expect(T.has(50)).toBe(false);
  });

  it('counts runs that wrap round past the last slot', () => {
    const T = new HashTable('probe');
    for (const k of [7, 15, 0]) T.quickInsert(k); // slots 7, 0, 1
    expect(T.longest()).toBe(3);
  });
});

describe('chaining', () => {
  it('unlinks a key from the middle of a chain, and the pointer skips it', () => {
    const T = fresh('chain');
    T.quickInsert(41); // bucket 1: 25, 33, 41
    const rec = ops.remove(T, 33);
    const unlink = rec.steps.find(s => s.kind === 'unlink');
    expect(unlink?.head).toBe('25 now points past 33, at 41.');
    expect(unlink?.diag.links.find(l => l.from === 'k25')?.to).toBe('k41');
    expect(T.chains[1]).toEqual([25, 41]);
  });
});
