// The six sorts against JavaScript's own sort, on every kind of input, plus the
// promises the loom relies on: every pick is a real comparison of the keys drawn,
// a slot marked final holds the key that ends there, stable sorts never tie a
// knot, and the known counts (n − 1 on sorted input, every pair for selection,
// O(n²) for quick sort on sorted input).

import { describe, expect, it } from 'vitest';
import { LISTINGS } from '@/chapters/sorting/code';
import { SORTS, STABLE, countSort, nlogn, pairs, runSort, type Run, type SortKey } from '@/chapters/sorting/sorts';
import { INPUTS, SIZES, inputValues, makeThreads, threadsOf } from '@/chapters/sorting/threads';

const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

/** The recording is consistent with itself and with the threads it sorts. */
function checkRun(run: Run): void {
  const th = run.threads,
    V = th.list.map(t => t.v),
    n = th.n;
  const where = `${run.key} on ${th.kind} ${n} (seed ${th.seed})`;
  const picks = run.events.filter(e => e.kind === 'pick');
  expect(picks.length, `${where}: one pick per comparison`).toBe(run.comps);
  expect(run.states.length, `${where}: a state before each pick, and the end`).toBe(run.comps + 1);
  // the arrangement before each pick is what the last event left
  let arr = th.list.map(t => t.id),
    p = 0;
  for (const ev of run.events) {
    expect(
      [...ev.arr].sort((a, b) => a - b),
      `${where}: a permutation`,
    ).toEqual([...Array(n).keys()]);
    if (ev.kind === 'pick') {
      expect(run.states[p], `${where}: state before pick ${p}`).toEqual(arr);
      expect(ev.i !== ev.j && ev.i >= 0 && ev.j >= 0 && ev.i < n && ev.j < n, `${where}: pick ${p} slots`).toBe(true);
      p++;
    }
    expect(ev.comps, `${where}: running count`).toBe(p);
    expect(ev.line, `${where}: code line`).toBeLessThan(LISTINGS[run.key].length);
    expect(ev.head.length, `${where}: a headline`).toBeGreaterThan(5);
    arr = ev.arr;
  }
  expect(run.states[run.comps], `${where}: last state`).toEqual(arr);
  // sorted at the end, and final marks tell the truth
  const want = sorted(V);
  expect(
    arr.map(id => V[id]),
    `${where}: sorted`,
  ).toEqual(want);
  for (const ev of run.events)
    ev.marks.final.forEach((f, s) => {
      if (f) expect(V[ev.arr[s]], `${where}: slot ${s} marked final`).toBe(want[s]);
    });
  const last = run.events[run.events.length - 1];
  expect(last.marks.final.every(Boolean), `${where}: all final at the end`).toBe(true);
}

describe('every sort sorts, on every input', () => {
  for (const key of SORTS)
    it(key, () => {
      for (const kind of INPUTS)
        for (const n of SIZES)
          for (let seed = 1; seed <= 6; seed++) {
            const th = makeThreads(kind, n, seed);
            checkRun(runSort(key, th));
            const c = countSort(key, th);
            expect(c.out).toEqual(sorted(th.list.map(t => t.v)));
          }
      // odd sizes and tiny rows too
      for (const vs of [
        [2, 1],
        [1, 2],
        [3, 1, 2],
        [5, 4, 3, 2, 1],
        [1, 1],
        [2, 1, 2, 1, 3],
      ])
        checkRun(runSort(key, threadsOf(vs)));
    });
});

describe('stability', () => {
  it('stable sorts keep twins in order and never tie a knot', () => {
    for (const key of SORTS.filter(k => STABLE[k]))
      for (const n of SIZES)
        for (let seed = 1; seed <= 20; seed++) {
          const th = makeThreads('twins', n, seed),
            run = runSort(key, th);
          expect(run.knots, `${key} ${n} ${seed}`).toBe(0);
          const out = run.states[run.comps].map(id => th.list[id]);
          for (let s = 1; s < n; s++)
            if (out[s].v === out[s - 1].v)
              expect(out[s - 1].twin < out[s].twin, `${key} keeps ${out[s].v}a first`).toBe(true);
        }
  });
  it('the unstable ones tie knots, and say so', () => {
    for (const key of SORTS.filter(k => !STABLE[k])) {
      let knots = 0,
        swapped = 0,
        said = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const th = makeThreads('twins', 12, seed),
          run = runSort(key, th);
        knots += run.knots;
        const out = run.states[run.comps].map(id => th.list[id]);
        if (out.some((t, s) => s > 0 && t.v === out[s - 1].v && out[s - 1].twin > t.twin)) swapped++;
        if (run.events.some(e => e.body.includes('not stable'))) said++;
      }
      expect(knots, key).toBeGreaterThan(0);
      expect(swapped, `${key} puts some b before its a`).toBeGreaterThan(0);
      expect(said, `${key} explains its first knot`).toBeGreaterThan(0);
    }
  });
  it('a knot is a pair of twins changing order', () => {
    for (const key of SORTS) {
      const th = makeThreads('twins', 16, 3),
        run = runSort(key, th);
      for (const ev of run.events)
        for (const [x, y] of ev.knots) expect(th.list[x].v, `${key}: twins`).toBe(th.list[y].v);
      expect(run.events.reduce((s, e) => s + e.knots.length, 0)).toBe(run.knots);
    }
  });
});

describe('the counts that tell the sorts apart', () => {
  it('on sorted input, bubble and insertion sort make n − 1 comparisons', () => {
    for (const n of [8, 16, 24, 40]) {
      const th = threadsOf(Array.from({ length: n }, (_, i) => i + 1));
      expect(countSort('bubble', th).comps).toBe(n - 1);
      expect(countSort('insertion', th).comps).toBe(n - 1);
      expect(countSort('insertion', th).writes).toBe(n - 1);
      // Lomuto's partition round the last key: every split is lopsided
      expect(countSort('quick', th).comps).toBe(pairs(n));
    }
  });
  it('selection sort compares every pair, always, and swaps at most n − 1 times', () => {
    for (const kind of INPUTS)
      for (const n of SIZES) {
        const c = countSort('selection', makeThreads(kind, n, 2));
        expect(c.comps).toBe(pairs(n));
        expect(c.writes).toBeLessThanOrEqual(2 * (n - 1));
      }
  });
  it('reversed input is the worst case for bubble and insertion sort', () => {
    for (const n of SIZES) {
      const th = makeThreads('reversed', n, 1);
      expect(countSort('bubble', th).comps).toBe(pairs(n));
      expect(countSort('insertion', th).comps).toBe(pairs(n));
    }
  });
  it('merge and heap sort stay O(n log n) on every input', () => {
    for (const kind of INPUTS)
      for (const n of [8, 16, 24, 64, 128]) {
        const th = makeThreads(kind === 'twins' ? 'twins' : kind, n, 5);
        expect(countSort('merge', th).comps).toBeLessThanOrEqual(Math.ceil(nlogn(n)));
        expect(countSort('heap', th).comps).toBeLessThanOrEqual(Math.ceil(2 * nlogn(n)));
      }
  });
  it('on random input the fast sorts pull away as n grows', () => {
    const avg = (key: SortKey, n: number) => {
      let s = 0;
      for (let seed = 1; seed <= 8; seed++) s += countSort(key, makeThreads('random', n, seed)).comps;
      return s / 8;
    };
    for (const fast of ['merge', 'quick', 'heap'] as const)
      for (const slow of ['bubble', 'insertion', 'selection'] as const)
        expect(avg(fast, 64)).toBeLessThan(avg(slow, 64));
  });
});

describe('inputs', () => {
  it('are what they say, and repeat from a seed', () => {
    for (const n of SIZES) {
      expect(inputValues('reversed', n, 1)).toEqual(Array.from({ length: n }, (_, i) => n - i));
      for (let seed = 1; seed <= 10; seed++) {
        const r = inputValues('random', n, seed),
          t = inputValues('twins', n, seed),
          ne = inputValues('nearly', n, seed);
        expect(sorted(r)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(sorted(ne)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(sorted(t)).toEqual(Array.from({ length: n }, (_, i) => (i >> 1) + 1));
        expect(r).toEqual(inputValues('random', n, seed));
        // nearly sorted: few keys out of place, and none far
        expect(ne.filter((v, i) => v !== i + 1).length).toBeLessThanOrEqual(2 * Math.max(2, Math.round(n / 6)));
        ne.forEach((v, i) => expect(Math.abs(v - (i + 1))).toBeLessThanOrEqual(2 * Math.max(2, Math.round(n / 6))));
      }
    }
    const tw = makeThreads('twins', 8, 3);
    for (let v = 1; v <= 4; v++)
      expect(
        tw.list
          .filter(t => t.v === v)
          .map(t => t.twin)
          .join(''),
      ).toBe('ab');
  });
  it('code listings fit the card', () => {
    for (const key of SORTS) for (const l of LISTINGS[key]) expect(l.length, l).toBeLessThanOrEqual(30);
  });
});
