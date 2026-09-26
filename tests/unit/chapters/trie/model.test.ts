// The trie against plain JavaScript doing the same thing: a Set of words, a
// filter for autocomplete, brute-force edit distance for spell check. Then the
// recordings: every step says what the trie really did, and the numbers the
// narration quotes are the true ones.

import { describe, expect, it } from 'vitest';
import { mulberry } from '@/core/random';
import * as Lay from '@/chapters/trie/layout';
import * as ops from '@/chapters/trie/ops';
import { memoryOf } from '@/chapters/trie/panels';
import { layoutOf } from '@/chapters/trie/poses';
import {
  ALPHABET,
  Trie,
  dictOf,
  editDistance,
  letterCount,
  nodeCount,
  shapeOf,
  zipShapeOf,
  type Dict,
} from '@/chapters/trie/trie';
import { MAX_LEN, SIZES, WORDS, type Size } from '@/chapters/trie/words';

const DICTS = Object.fromEntries(SIZES.map(s => [s, dictOf(WORDS[s])])) as Record<Size, Dict>;

/** Every distinct beginning of a set of words, the empty one included. */
const prefixes = (words: Iterable<string>): Set<string> => {
  const p = new Set<string>(['']);
  for (const w of words) for (let k = 1; k <= w.length; k++) p.add(w.slice(0, k));
  return p;
};

function randomWord(rnd: () => number, letters = 'ABCDEOST'): string {
  const n = 1 + Math.floor(rnd() * 5);
  let w = '';
  for (let k = 0; k < n; k++) w += letters[Math.floor(rnd() * letters.length)];
  return w;
}

describe('the word lists', () => {
  it('hold exactly 20, 200 and 2,000 words, each holding the one before', () => {
    for (const s of SIZES) {
      expect(WORDS[s]).toHaveLength(s);
      expect(new Set(WORDS[s]).size).toBe(s);
    }
    for (const w of WORDS[20]) expect(WORDS[200]).toContain(w);
    for (const w of WORDS[200]) expect(WORDS[2000]).toContain(w);
  });
  it('are capitals only, never longer than seven letters, and each reaches the seventh ring', () => {
    expect(Lay.RINGS).toBe(MAX_LEN);
    for (const s of SIZES) {
      for (const w of WORDS[s]) expect(w).toMatch(/^[A-Z]{1,7}$/);
      expect(Math.max(...WORDS[s].map(w => w.length))).toBe(MAX_LEN);
    }
  });
  it('share their beginnings: twenty words, 63 letters, 30 nodes', () => {
    expect(letterCount(DICTS[20])).toBe(63);
    expect(nodeCount(DICTS[20])).toBe(30);
    expect(nodeCount(DICTS[2000])).toBeLessThan(letterCount(DICTS[2000]) / 2 + 100);
  });
});

describe('the trie', () => {
  it('matches a Set through thousands of random inserts and deletes', () => {
    const rnd = mulberry(7);
    const t = new Trie(),
      ref = new Set<string>();
    for (let k = 0; k < 4000; k++) {
      const w = randomWord(rnd);
      if (rnd() < 0.6) {
        const made = t.insert(w);
        const before = prefixes(ref).size;
        ref.add(w);
        expect(made).toBe(prefixes(ref).size - before);
      } else {
        const before = prefixes(ref).size;
        const cut = t.remove(w);
        if (ref.has(w)) {
          ref.delete(w);
          expect(cut).toBe(before - prefixes(ref).size);
        } else expect(cut).toBe(-1);
      }
      if (k % 200 === 0) {
        expect(t.size).toBe(ref.size);
        expect(t.nodes).toBe(prefixes(ref).size);
        expect(t.list()).toEqual([...ref].sort());
        for (let q = 0; q < 20; q++) {
          const p = randomWord(rnd);
          expect(t.has(p)).toBe(ref.has(p));
        }
      }
    }
    for (const w of [...ref]) t.remove(w);
    expect(t.nodes).toBe(1);
    expect(t.size).toBe(0);
  });

  it('completes every prefix with exactly the words that start with it, A to Z', () => {
    const t = new Trie(WORDS[2000]);
    const sorted = [...WORDS[2000]].sort();
    for (const p of [...prefixes(WORDS[200])].slice(0, 400))
      expect(t.complete(p)).toEqual(sorted.filter(w => w.startsWith(p)));
    expect(t.complete('QZ')).toEqual([]);
  });

  it('suggests exactly the words one edit away, a swap counting as one', () => {
    const t = new Trie(WORDS[2000]);
    const rnd = mulberry(11);
    const typos: string[] = ['DOE', 'HOUES', 'CRAT', 'TEH', 'ZZZ', 'A'];
    for (let k = 0; k < 60; k++) {
      const w = WORDS[2000][Math.floor(rnd() * 2000)];
      const i = Math.floor(rnd() * w.length);
      const ch = ALPHABET[Math.floor(rnd() * 26)];
      typos.push(
        k % 3 === 0
          ? w.slice(0, i) + w.slice(i + 1)
          : k % 3 === 1
            ? w.slice(0, i) + ch + w.slice(i)
            : w.slice(0, i) + ch + w.slice(i + 1),
      );
    }
    for (const typo of typos) {
      const got = t
        .suggest(typo, 1)
        .map(s => s.word)
        .sort();
      const want = WORDS[2000].filter(w => editDistance(typo, w) <= 1).sort();
      expect(got, typo).toEqual(want);
    }
    expect(editDistance('HOUES', 'HOUSE')).toBe(1);
    expect(editDistance('CAT', 'ACT')).toBe(1);
    expect(editDistance('CAT', 'DOG')).toBe(3);
  });
});

describe('shapes and layout', () => {
  it('a shape is every beginning, in alphabetical order, with its words marked', () => {
    for (const s of SIZES) {
      const S = shapeOf(DICTS[s]);
      expect(S.ids).toEqual([...prefixes(WORDS[s])].sort());
      expect(S.below[0]).toBe(s);
      S.ids.forEach((id, i) => expect(!!S.word[i]).toBe(DICTS[s].set.has(id)));
      expect(S.leaves).toBe(WORDS[s].filter(w => !WORDS[s].some(v => v !== w && v.startsWith(w))).length);
    }
  });
  it('before zipping, every letter is its own node; zipped, the words are the trie', () => {
    const d = DICTS[20];
    expect(zipShapeOf(d, 0).ids.length - 1).toBe(letterCount(d));
    expect(zipShapeOf(d, Lay.RINGS).ids).toEqual(shapeOf(d).ids);
    for (let s = 1; s < Lay.RINGS; s++)
      expect(zipShapeOf(d, s).ids.length).toBeGreaterThanOrEqual(shapeOf(d).ids.length);
  });
  it('lays words out A to Z from left to right, each node between its first and last child', () => {
    for (const focus of [null, 'CA', 'T']) {
      const S = shapeOf(DICTS[200]),
        L = layoutOf(S, focus);
      let last = Infinity;
      for (let i = 1; i < S.ids.length; i++) {
        expect(L.th[i]).toBeGreaterThanOrEqual(Lay.TH0 - 1e-6);
        expect(L.th[i]).toBeLessThanOrEqual(Lay.TH1 + 1e-6);
        const k = S.kids[i];
        if (!k.length) {
          expect(L.th[i]).toBeLessThan(last);
          last = L.th[i];
        } else {
          expect(L.th[i]).toBeLessThanOrEqual(L.th[k[0]] + 1e-6);
          expect(L.th[i]).toBeGreaterThanOrEqual(L.th[k[k.length - 1]] - 1e-6);
        }
        expect(L.r[i]).toBeGreaterThan(0);
        expect(L.r[i]).toBeLessThanOrEqual(Lay.DISC_MAX);
      }
    }
  });
  it('opens the fan round a focus, so its words get room', () => {
    const S = shapeOf(DICTS[2000]);
    const wide = (L: ReturnType<typeof layoutOf>) => L.hi[S.index.get('ST') ?? 0] - L.lo[S.index.get('ST') ?? 0];
    expect(wide(layoutOf(S, 'ST'))).toBeGreaterThan(5 * wide(layoutOf(S, null)));
  });
  it('counts the slots a trie holds, and the few in use', () => {
    const m = memoryOf(DICTS[20]);
    expect(m.nodes).toBe(30);
    expect(m.slots).toBe(31 * 26);
    expect(m.used).toBe(30);
    expect(m.bytes.array).toBeGreaterThan(50 * m.bytes.list);
  });
});

describe('recordings', () => {
  const d = DICTS[20];

  it('a search takes one step per letter, whatever the number of words', () => {
    for (const s of SIZES) {
      const rec = ops.search(DICTS[s], s, 'CART');
      expect(rec.steps.filter(st => st.kind === 'walk')).toHaveLength(4);
      expect(rec.steps[rec.steps.length - 1].kind).toBe('found');
      rec.steps.slice(0, 4).forEach((st, k) => expect(st.fans[0].at).toBe('CART'.slice(0, k + 1)));
    }
    expect(ops.search(d, 20, 'CARTO').steps.at(-1)?.kind).toBe('prefix');
    const miss = ops.search(d, 20, 'CARS').steps.at(-1);
    expect(miss?.kind).toBe('miss');
    expect(miss?.fans[0].miss).toEqual({ at: 'CAR', ch: 'S' });
  });

  it('an insert grows exactly the nodes the trie needed', () => {
    for (const w of ['CARS', 'ZOO', 'CARTO', 'BEAR', 'CART']) {
      const rec = ops.insert(d, 20, w);
      const made = new Trie(d.words).insert(w);
      expect(
        rec.steps.filter(st => st.kind === 'grow'),
        w,
      ).toHaveLength(made);
      const last = rec.steps[rec.steps.length - 1].fans[0].dict;
      expect(last.set.has(w)).toBe(true);
      expect(nodeCount(last)).toBe(nodeCount(d) + made);
    }
  });

  it('a delete takes away exactly the nodes that led only to the word', () => {
    for (const w of ['CARTOON', 'CART', 'DOG', 'BEE', 'AN', 'TRY']) {
      const rec = ops.remove(d, 20, w);
      const cut = new Trie(d.words).remove(w);
      expect(
        rec.steps.filter(st => st.kind === 'prune'),
        w,
      ).toHaveLength(cut);
      const last = rec.steps[rec.steps.length - 1].fans[0].dict;
      expect(last.set.has(w)).toBe(false);
      expect(nodeCount(last)).toBe(nodeCount(d) - cut);
    }
    expect(ops.remove(d, 20, 'CARS').steps.at(-1)?.kind).toBe('none');
  });

  it('typing lights every word under the prefix, and one more letter only adds a step', () => {
    const car = ops.typeAhead(d, 20, 'CAR'),
      cart = ops.typeAhead(d, 20, 'CART');
    expect(car.steps.map(s => s.fans[0].lit)).toEqual([
      ['CAR', 'CARD', 'CARE', 'CART', 'CARTOON', 'CAT'],
      ['CAR', 'CARD', 'CARE', 'CART', 'CARTOON', 'CAT'],
      ['CAR', 'CARD', 'CARE', 'CART', 'CARTOON'],
    ]);
    expect(cart.steps.slice(0, 3).map(s => [s.head, s.body, s.fans[0]])).toEqual(
      car.steps.map(s => [s.head, s.body, s.fans[0]]),
    );
    const miss = ops.typeAhead(d, 20, 'CARX');
    expect(miss.steps.at(-1)?.kind).toBe('miss');
    expect(miss.steps.at(-1)?.list?.words).toEqual(['CAR', 'CARD', 'CARE', 'CART']);
    expect(ops.typeAhead(d, 20, '').steps).toHaveLength(0);
  });

  it('spell check finds the words one edit away, visiting only part of the trie', () => {
    for (const [s, typo] of [
      [20, 'DOE'],
      [200, 'HOUES'],
      [2000, 'TEH'],
    ] as const) {
      const rec = ops.spell(DICTS[s], s, typo);
      const want = WORDS[s].filter(w => editDistance(typo, w) <= 1).sort();
      const end = rec.steps.at(-1);
      expect(end?.kind).toBe('suggest');
      expect([...(end?.list?.words ?? [])].sort(), typo).toEqual(want);
      const spells = rec.steps.filter(st => st.kind === 'spell');
      let seen = 0;
      for (const st of spells) {
        const sp = st.fans[0].spell;
        expect(sp).not.toBeNull();
        expect(sp?.seen.size).toBeGreaterThanOrEqual(seen);
        seen = sp?.seen.size ?? 0;
        for (const id of sp?.cut ?? []) expect(sp?.seen.get(id)).toBeGreaterThan(1);
      }
      expect(seen - 1).toBeLessThan(nodeCount(DICTS[s]));
    }
    expect(ops.spell(d, 20, 'DOE').steps.at(-1)?.list?.words).toEqual(['DO', 'DOG', 'DOT', 'TOE']);
    expect(ops.spell(d, 20, 'CART').steps.at(-1)?.kind).toBe('found');
  });

  it('zipping shares one ring at a time, and ends on the whole trie', () => {
    const rec = ops.zip(d, 20);
    expect(rec.start[0].zip).toBe(0);
    const stages = rec.steps.map(s => s.fans[0].zip);
    expect(stages.at(-1)).toBeNull();
    expect(rec.steps.at(-1)?.head).toBe('63 letters became 30 nodes.');
    expect(rec.steps[0].head).toBe('The first letters: 20 become 5.');
  });

  it('three sizes: the same four steps in each', () => {
    const rec = ops.three(DICTS, 'CART');
    expect(rec.start.map(f => f.key)).toEqual(['f20', 'f200', 'f2000']);
    const walks = rec.steps.filter(st => st.kind === 'walk');
    expect(walks).toHaveLength(4);
    for (const st of walks) expect(new Set(st.fans.map(f => f.at)).size).toBe(1);
    expect(rec.steps.at(-1)?.head).toBe('CART: 4 steps in each.');
  });
});
