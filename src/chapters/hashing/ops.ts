// Operations on the hash table. Each runs instantly and records every hash, jump,
// comparison and probe, with the line of code and a plain-English reason. The
// recordings are what the page plays.

import { plural } from '../../core/math';
import { bucketOf, hashCode, hashSum, windWords, type HashFn } from './hash';
import { bucketRef, keyId, QUERY, ringId, zeroCost, type Recording, type Tone } from './diagram';
import { Recorder } from './record';
import { MAX_KEYS, MIN_SIZE, TOMB, type HashTable, type Strategy } from './table';

export interface InsertOptions {
  /** Double the table when it passes three quarters full. */
  grow: boolean;
}

/** The keys Unlucky keys drops in: every one a multiple of the table size. */
export const UNLUCKY = [8, 16, 24, 32, 40, 48, 56] as const;

/* ---------------- words ---------------- */

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n: number) => ORD[n - 1] ?? `${n}th`;
export const fmtLoad = (n: number, m: number): string => (n / m).toFixed(2);
const compares = (n: number) => plural(n, 'comparison');
/** "an 8-hour clock", "a 16-hour clock". */
const clock = (m: number) => `${/^(8|11|18)/.test(String(m)) ? 'an' : 'a'} ${m}-hour clock`;
const probes = (n: number) => plural(n, 'probe');

/** Why the key lands where it does: the clock arithmetic in words. */
function hashBody(k: number, m: number, fn: HashFn, short = false): string {
  const h = hashCode(k, fn),
    b = h % m,
    hours = (x: number) => `${x} ${x === 1 ? 'hour' : 'hours'}`;
  if (fn === 'plain') {
    const wind = `On ${clock(m)}, ${hours(k)} is ${windWords(k, m)}: ${k} mod ${m} = ${b}.`;
    return short
      ? wind
      : `${wind} A computer gets there with one division, not ${k} steps, so hashing costs the same for every key.`;
  }
  const raw = 37 * k + 11;
  return `Scrambled: 37 × ${k} + 11 = ${raw}, and ${raw} mod 101 = ${h}. Then ${hours(h)} round ${clock(m)} is ${windWords(h, m)}: bucket ${b}.`;
}

const ledgerStart = (T: HashTable) => T.ledger.length;
function finish(rec: Recorder, title: string, start: ReturnType<Recorder['diagram']>, ledger: number): Recording {
  return { title, steps: rec.steps, start, ledger };
}

/* ---------------- the hub ---------------- */

/** The key (or the key looked for) lands on the hub, and the hand winds round to its bucket. */
function hashStep(rec: Recorder, id: string, k: number, tone: Tone, line: number, short = false): number {
  const T = rec.T,
    b = T.home(k);
  rec.extras.set(id, { key: k, place: { at: 'hub' }, tone });
  rec.hand = b;
  rec.lit = bucketRef(rec.live, b);
  rec.cost.hashes++;
  rec.push('hash', `${k} winds round to bucket ${b}.`, hashBody(k, T.m, T.hash, short), line, {
    focus: id,
    wind: hashCode(k, T.hash),
    callout: { text: hashSum(k, T.m, T.hash), tone: 'cobalt' },
  });
  return b;
}

/** Record the operation in the work ledger. */
function note(rec: Recorder, kind: 'insert' | 'search' | 'delete' | 'rehash', key: number | null, work: number): void {
  rec.T.ledger.push({ kind, key, work: Math.max(1, work), n: rec.T.n, m: rec.T.m });
}

/* ---------------- chaining ---------------- */

/**
 * Walk bucket b's chain comparing each key with k, one step per key.
 * Returns the level where k was found, or -1.
 */
function walkChain(rec: Recorder, k: number, b: number, line: number, why: string): number {
  const c = rec.T.chains[b];
  for (let j = 0; j < c.length; j++) {
    const id = keyId(c[j]),
      link = rec.linkInto(b, j);
    rec.calm();
    rec.trail.add(link);
    rec.cost.compares++;
    if (c[j] === k) {
      rec.tones.set(id, 'hit');
      return j;
    }
    rec.tones.set(id, 'cur');
    rec.push(
      'compare',
      `${c[j]} is not ${k}.`,
      j === 0
        ? `Follow bucket ${b}’s pointer to the first key in its chain and compare. ${why}`
        : `Follow ${c[j - 1]}’s next pointer: ${compares(j + 1)} so far. Every key in the same bucket is a collision, and each one costs a comparison.`,
      line,
      { focus: id, link, callout: { text: `${c[j]} ≠ ${k}`, tone: 'cobalt' } },
    );
  }
  return -1;
}

function chainInsert(rec: Recorder, k: number, opts: InsertOptions): void {
  const T = rec.T,
    b = T.home(k),
    c = T.chains[b],
    dup = c.includes(k),
    id = dup ? QUERY : keyId(k);
  hashStep(rec, id, k, dup ? 'query' : 'new', 0);
  rec.extras.set(id, {
    key: k,
    place: { at: 'bucket', ring: rec.live, index: b, level: c.length, hover: true },
    tone: dup ? 'query' : 'new',
  });
  rec.push(
    'jump',
    `Straight to bucket ${b}.`,
    `No searching for the bucket: its number is its address, and every bucket is one jump from the hub. ${
      c.length
        ? `Bucket ${b} already holds ${plural(c.length, 'key')}, so ${k} checks ${c.length === 1 ? 'it' : 'each of them'} first: a table keeps each key once.`
        : `Bucket ${b} is empty.`
    }`,
    1,
    { focus: id },
  );
  const at = walkChain(
    rec,
    k,
    b,
    3,
    'A table keeps each key once, so the new key is checked against every key already here.',
  );
  if (at >= 0) {
    rec.push(
      'found',
      `${k} is already here.`,
      `A set keeps one copy of each key, and a map would overwrite the value stored with it, so nothing is added. ${compares(rec.cost.compares)}.`,
      3,
      { focus: keyId(k), link: rec.linkInto(b, at), callout: { text: `${k} = ${k}`, tone: 'cobalt' } },
    );
    rec.extras.delete(id);
    rec.tones.clear();
    note(rec, 'insert', k, 1 + rec.cost.compares);
    return;
  }
  rec.calm();
  rec.extras.delete(id);
  T.quickInsert(k);
  const len = c.length;
  rec.hot.add(rec.linkInto(b, len - 1));
  note(rec, 'insert', k, 1 + rec.cost.compares);
  const cmp = rec.cost.compares;
  rec.push(
    'link',
    len === 1 ? `Bucket ${b} now points at ${k}.` : `Link ${k} on at the end of the chain.`,
    `${cmp ? `${compares(cmp)}, then one pointer write` : 'One pointer write, no comparisons'}. Bucket ${b}’s chain is ${len} long.${afterNote(T, opts)}`,
    5,
    { focus: keyId(k) },
  );
  rec.trail.clear();
  rec.lit = null;
}

function chainFind(rec: Recorder, k: number, remove: boolean): void {
  const T = rec.T,
    b = T.home(k),
    c = T.chains[b];
  hashStep(rec, QUERY, k, 'query', 0);
  rec.extras.set(QUERY, {
    key: k,
    place: { at: 'bucket', ring: rec.live, index: b, level: c.length, hover: true },
    tone: 'query',
  });
  rec.push(
    'jump',
    `Straight to bucket ${b}.`,
    c.length
      ? `One jump from the hub, whichever bucket it is. Now walk its chain of ${c.length}, comparing as we go: only keys in this bucket can be ${k}.`
      : `One jump from the hub, whichever bucket it is. Bucket ${b} is empty.`,
    1,
    { focus: QUERY },
  );
  const at = walkChain(rec, k, b, 3, `The other buckets never need a look.`);
  const kind = remove ? 'delete' : 'search';
  if (at < 0) {
    rec.calm();
    note(rec, kind, k, 1 + rec.cost.compares);
    rec.push(
      'missing',
      `${k} is not in the table.`,
      c.length
        ? `The chain ends after ${c[c.length - 1]}, and none of its ${plural(c.length, 'key')} is ${k}: ${compares(rec.cost.compares)}.${remove ? ' Nothing to delete.' : ''}`
        : `An empty bucket: one look, no comparisons.${remove ? ' Nothing to delete.' : ''}`,
      remove ? 7 : 5,
      { focus: bucketRef(rec.live, b), callout: { text: 'null', tone: 'red' } },
    );
    return;
  }
  const depth = at + 1;
  if (!remove) {
    note(rec, 'search', k, 1 + rec.cost.compares);
    rec.push(
      'found',
      `Found ${k}.`,
      `1 hash and ${compares(depth)}. ${depth === 1 ? 'It was first in its chain.' : `It was ${ordinal(depth)} in its chain: the deeper a key sits in a long chain, the more it costs to find.`}`,
      3,
      { focus: keyId(k), link: rec.linkInto(b, at), callout: { text: `${k} = ${k}`, tone: 'cobalt' } },
    );
    return;
  }
  rec.push('found', `Found ${k}.`, `${compares(depth)} to find it. Now take it out of the chain.`, 3, {
    focus: keyId(k),
    link: rec.linkInto(b, at),
    callout: { text: `${k} = ${k}`, tone: 'cobalt' },
  });
  // the pointer into k skips over it
  const into = rec.linkInto(b, at),
    after = c[at + 1];
  rec.linkTo.set(into, after != null ? keyId(after) : null);
  rec.hot.add(into);
  rec.tones.set(keyId(k), 'gone');
  rec.push(
    'unlink',
    at === 0
      ? after != null
        ? `Bucket ${b} now points past ${k}, at ${after}.`
        : `Bucket ${b} now points at nothing.`
      : after != null
        ? `${c[at - 1]} now points past ${k}, at ${after}.`
        : `${c[at - 1]} now ends the chain.`,
    `One pointer write. Nothing points at ${k} any more.`,
    4,
    { focus: keyId(k) },
  );
  rec.linkTo.clear();
  rec.tones.clear();
  rec.extras.delete(QUERY);
  T.quickRemove(k);
  rec.trail.clear();
  rec.lit = null;
  note(rec, 'delete', k, 1 + rec.cost.compares);
  rec.push(
    'free',
    `${k} is gone.`,
    `${after != null ? 'The keys above it drop down one place. ' : ''}1 hash, ${compares(depth)} and one pointer write. Load factor ${fmtLoad(T.n, T.m)}.`,
    5,
    { focus: bucketRef(rec.live, b) },
  );
}

/* ---------------- probing ---------------- */

/** The run of occupied slots (keys or tombstones) around slot s: [first, length]. */
function runAround(T: HashTable, s: number): [number, number] {
  const m = T.m,
    used = (i: number) => T.slots[((i % m) + m) % m] != null;
  if (!used(s)) return [s, 0];
  let a = s,
    len = 1;
  while (len < m && used(a - 1)) {
    a--;
    len++;
  }
  let e = s;
  while (len < m && used(e + 1)) {
    e++;
    len++;
  }
  return [((a % m) + m) % m, len];
}

function runNote(T: HashTable, s: number): string {
  const [a, len] = runAround(T, s);
  if (len < 3) return '';
  return ` Slots ${a} to ${(a + len - 1) % T.m} are now one run of ${len}: any key that lands anywhere in it walks to its end, so runs grow fastest where they are already long. That is primary clustering.`;
}

/** Look at each slot of the probe walk in turn, hovering the disc `id` over it. Returns how the walk ended. */
function walkSlots(
  rec: Recorder,
  id: string,
  k: number,
  insert: boolean,
  nextLine: number,
): { found: number; empty: number; tomb: number } {
  const T = rec.T,
    w = T.probe(k),
    b = w.path[0];
  let tomb = -1;
  for (let j = 0; j < w.path.length; j++) {
    const s = w.path[j],
      v = T.slots[s];
    rec.cost.probes++;
    rec.calm();
    rec.extras.set(id, {
      key: k,
      place: { at: 'bucket', ring: rec.live, index: s, level: 0, hover: true },
      tone: insert && id !== QUERY ? 'new' : 'query',
    });
    rec.lit = j === 0 ? bucketRef(rec.live, b) : null;
    const kind = j === 0 ? 'jump' : 'hop',
      line = j === 0 ? 1 : nextLine;
    const lead = j === 0 ? `Straight to bucket ${b}` : `On to slot ${s}`;
    if (v === k) return { found: s, empty: -1, tomb };
    if (v == null) {
      rec.push(
        kind,
        `${lead}: it is empty.`,
        j === 0
          ? `One jump from the hub, and nothing in the way.${insert ? '' : ` If ${k} were in the table, it would be here or further along, never past an empty slot.`}`
          : `${probes(j + 1)}.${insert ? ` ${k} can go here.` : ''}`,
        line,
        { focus: id, callout: j === 0 ? null : { text: 'empty', tone: 'ink' } },
      );
      return { found: -1, empty: s, tomb };
    }
    if (v === TOMB) {
      if (tomb < 0) tomb = s;
      rec.push(
        kind,
        `${lead}: a tombstone.`,
        `A deleted key used to be here. The walk has to keep going, since ${k} may be further along${insert && tomb === s ? ', but this slot is free to reuse if it isn’t' : ''}.`,
        line,
        { focus: id, callout: { text: 'DEL', tone: 'red' } },
      );
      continue;
    }
    rec.tones.set(keyId(v), 'cur');
    rec.push(
      kind,
      j === 0 ? `Bucket ${b} is taken, by ${v}.` : `Slot ${s} is taken too, by ${v}.`,
      j === 0
        ? `A collision: ${v} got here first. Linear probing tries the next slot along, wrapping round past the last one.`
        : `${probes(j + 1)} so far. Every taken slot is another look before ${k} can ${insert ? 'settle' : 'be found or ruled out'}.`,
      line,
      { focus: id, callout: { text: `${v} ≠ ${k}`, tone: 'cobalt' } },
    );
  }
  return { found: -1, empty: -1, tomb };
}

function probeInsert(rec: Recorder, k: number, opts: InsertOptions): void {
  const T = rec.T,
    dup = T.has(k),
    id = dup ? QUERY : keyId(k);
  hashStep(rec, id, k, dup ? 'query' : 'new', 0);
  const w = walkSlots(rec, id, k, true, 3);
  rec.calm();
  if (w.found >= 0) {
    rec.tones.set(keyId(k), 'hit');
    rec.push(
      'found',
      `${k} is already here, in slot ${w.found}.`,
      `A set keeps one copy of each key, and a map would overwrite the value stored with it, so nothing is added. ${probes(rec.cost.probes)}.`,
      2,
      { focus: keyId(k), callout: { text: `${k} = ${k}`, tone: 'cobalt' } },
    );
    rec.extras.delete(id);
    rec.tones.clear();
    note(rec, 'insert', k, rec.cost.probes);
    return;
  }
  const s = w.tomb >= 0 ? w.tomb : w.empty;
  rec.extras.delete(id);
  T.slots[s] = k;
  rec.lit = null;
  note(rec, 'insert', k, rec.cost.probes);
  const p = rec.cost.probes;
  rec.push(
    'place',
    w.tomb >= 0 ? `${k} takes the tombstone’s slot, ${s}.` : `${k} drops into slot ${s}.`,
    (w.tomb >= 0
      ? `Reaching an empty slot proved ${k} wasn’t in the table, so the first tombstone on the way can be reused.`
      : p === 1
        ? 'One probe: its own bucket was free.'
        : `${probes(p)}: ${plural(p - 1, 'slot')} in the way before a free one.`) +
      runNote(T, s) +
      afterNote(T, opts),
    4,
    { focus: keyId(k) },
  );
}

function probeFind(rec: Recorder, k: number, remove: boolean): void {
  const T = rec.T;
  hashStep(rec, QUERY, k, 'query', 0);
  const w = walkSlots(rec, QUERY, k, false, remove ? 5 : 3);
  rec.calm();
  if (w.found < 0) {
    note(rec, remove ? 'delete' : 'search', k, rec.cost.probes);
    rec.push(
      'missing',
      `${k} is not in the table.`,
      (w.empty >= 0
        ? `Slot ${w.empty} is empty, and a key is never stored past an empty slot on its walk, so the search can stop: ${probes(rec.cost.probes)}.`
        : `Every slot has been looked at: ${probes(rec.cost.probes)}.`) + (remove ? ' Nothing to delete.' : ''),
      remove ? 6 : 4,
      { focus: QUERY, callout: { text: 'empty', tone: 'red' } },
    );
    return;
  }
  const s = w.found,
    p = rec.cost.probes;
  rec.tones.set(keyId(k), 'hit');
  if (!remove) {
    note(rec, 'search', k, p);
    rec.push(
      'found',
      `Found ${k} in slot ${s}.`,
      p === 1
        ? '1 hash and 1 probe: it was in its own bucket.'
        : `${probes(p)}: it sits ${plural(p - 1, 'slot')} past its own bucket, pushed along by the keys that got there first.`,
      2,
      { focus: keyId(k), callout: { text: `${k} = ${k}`, tone: 'cobalt' } },
    );
    return;
  }
  rec.push('found', `Found ${k} in slot ${s}.`, `${probes(p)} to find it. Now take it out.`, 2, {
    focus: keyId(k),
    callout: { text: `${k} = ${k}`, tone: 'cobalt' },
  });
  rec.tones.clear();
  rec.extras.delete(QUERY);
  T.slots[s] = TOMB;
  rec.lit = null;
  note(rec, 'delete', k, p);
  const dep = dependent(T, s);
  rec.push(
    'tomb',
    `${k} leaves a tombstone in slot ${s}.`,
    (dep != null
      ? `Why not just empty the slot? A search for ${dep} starts at bucket ${T.home(dep)} and walks right past here; an empty slot would stop it early and report ${dep} missing. The tombstone says: deleted, keep looking.`
      : 'Why not just empty the slot? A key that collided earlier may sit further along, and an empty slot would stop its search early. The tombstone says: deleted, keep looking.') +
      ' Inserts may reuse it; the next rehash clears it.',
    3,
    { focus: `x:${rec.live}:${s}` },
  );
}

/** A key whose search walks through slot s, or null. */
function dependent(T: HashTable, s: number): number | null {
  const m = T.m;
  for (let d = 1; d < m; d++) {
    const t = (s + d) % m,
      v = T.slots[t];
    if (v == null) return null;
    if (v === TOMB) continue;
    const h = T.home(v);
    // s lies on v's walk if it is reached from v's home before t
    if ((s - h + m) % m < (t - h + m) % m) return v;
  }
  return null;
}

/* ---------------- growing and rehashing ---------------- */

/** A note for the end of an insert about the load factor, when the table will not grow. */
function afterNote(T: HashTable, opts: InsertOptions): string {
  if (!T.overloaded) return '';
  const a = fmtLoad(T.n, T.m);
  if (!opts.grow)
    return ` α = ${a} and growing is off, so ${T.strategy === 'chain' ? 'chains keep getting longer' : 'runs keep merging'}.`;
  if (!T.canGrow) return ` α = ${a}, but ${T.m} buckets is as big as this clock gets.`;
  return '';
}

/** After an insert: if the table is over three quarters full, grow it. */
function maybeGrow(rec: Recorder, opts: InsertOptions): void {
  const T = rec.T;
  if (!opts.grow || !T.overloaded || !T.canGrow) return;
  rec.code = `${T.strategy}.put`;
  rec.push(
    'full',
    `${plural(T.n, 'key')} in ${T.m} buckets: α = ${fmtLoad(T.n, T.m)}.`,
    `The load factor α = n / m has passed ¾. Past that, ${T.strategy === 'chain' ? 'chains lengthen' : 'runs of full slots merge'} and every operation slows, so the table doubles now.`,
    T.strategy === 'chain' ? 7 : 6,
    { focus: 'gauge', callout: { text: `α = ${fmtLoad(T.n, T.m)}`, tone: 'red' } },
  );
  rehashAll(rec, T.m * 2, T.hash);
}

/** How the longest pile changed, for the end of a rehash. */
function splitNote(
  T: HashTable,
  before: { chains: number[][]; slots: (number | null)[]; m: number },
  grew: boolean,
): string {
  if (T.strategy === 'probe') {
    const run = (slots: (number | null)[]) => {
      let best = 0,
        cur = 0;
      for (let j = 0; j < 2 * slots.length; j++) {
        cur = slots[j % slots.length] != null ? cur + 1 : 0;
        best = Math.max(best, Math.min(cur, slots.length));
      }
      return best;
    };
    return `The longest run of full slots went from ${run(before.slots)} to ${run(T.slots)}.`;
  }
  let ob = 0;
  before.chains.forEach((c, i) => {
    if (c.length > before.chains[ob].length) ob = i;
  });
  const len = before.chains[ob].length;
  if (!grew || len < 2) return `The longest chain went from ${len} to ${T.longest()}.`;
  const lo = T.chains[ob].length,
    hi = T.chains[ob + before.m].length;
  if (lo === 0 || hi === 0)
    return `Bucket ${ob}’s ${len} keys all moved together, to bucket ${lo ? ob : ob + before.m}: doubling didn’t split them at all.`;
  return `Bucket ${ob}’s chain of ${len} split in two: ${lo} stayed in bucket ${ob}, ${hi} moved up to ${ob + before.m}.`;
}

/**
 * Move every key into a fresh table of size m2 under hash fn. The first two keys
 * go one at a time, explained; the rest follow together.
 */
function rehashAll(rec: Recorder, m2: number, fn: HashFn): void {
  const T = rec.T,
    grew = m2 !== T.m,
    oldM = T.m,
    oldFn = T.hash;
  const keys = T.keys();
  const before = { chains: T.chains.map(c => [...c]), slots: T.slots.map(v => (v === TOMB ? null : v)), m: oldM };
  const O = {
    m: oldM,
    ring: ringId(oldM),
    lifted: !grew,
    chains: before.chains.map(c => [...c]),
    slots: [...before.slots],
  };
  rec.old = O;
  T.hash = fn;
  T.clear(m2);
  rec.hand = 0;
  rec.lit = null;
  rec.tones.clear();
  rec.trail.clear();
  rec.code = grew ? 'grow' : 'rehash';
  rec.cx = 'resize';
  if (grew)
    rec.push(
      'grow',
      `A new table: ${m2} empty buckets.`,
      `The keys can’t be copied across where they sit. A key’s bucket is its hash mod m, and m has just doubled, so every key has to be hashed again.`,
      1,
      { focus: bucketRef(ringId(m2), 0) },
    );
  else
    rec.push(
      'lift',
      'Every key lifts out.',
      'A key’s bucket depends on the hash function, so a new hash means a new bucket for everything. The table starts again, empty.',
      2,
      {},
    );
  const takeOut = (k: number) => {
    if (T.strategy === 'chain')
      for (const c of O.chains) {
        const i = c.indexOf(k);
        if (i >= 0) c.splice(i, 1);
      }
    else {
      const i = O.slots.indexOf(k);
      if (i >= 0) O.slots[i] = null;
    }
  };
  const first = keys.slice(0, 2),
    rest = keys.slice(2);
  for (const k of first) {
    const ob = bucketOf(k, oldM, oldFn);
    takeOut(k);
    const at = T.quickInsert(k);
    rec.cost.moves++;
    rec.cost.hashes++;
    const b = T.home(k);
    rec.hand = b;
    rec.lit = bucketRef(rec.live, b);
    const where = at && at.bucket !== b ? ` Bucket ${b} was taken, so it went on to slot ${at.bucket}.` : '';
    rec.push(
      'rehash',
      `${k}: ${hashSum(k, m2, fn)}.`,
      grew
        ? `It sat in bucket ${ob} (${hashCode(k, oldFn)} mod ${oldM}). With twice the buckets, every key either keeps its number or moves up by ${oldM}, and this one ${b === ob ? `stays in bucket ${b}` : `moves up to bucket ${b}`}.${where}`
        : `Under the old hash it sat in bucket ${ob}. ${hashBody(k, m2, fn, true)}${where}`,
      3,
      { focus: keyId(k), wind: hashCode(k, fn), callout: { text: hashSum(k, m2, fn), tone: 'cobalt' } },
    );
  }
  if (rest.length) {
    for (const k of rest) {
      takeOut(k);
      T.quickInsert(k);
      rec.cost.moves++;
      rec.cost.hashes++;
    }
    const last = rest[rest.length - 1];
    rec.hand = T.home(last);
    rec.lit = null;
    rec.push(
      'fountain',
      `The other ${plural(rest.length, 'key')} follow.`,
      `Each goes back through the hash function to find its new bucket: one move per key, ${keys.length} in all, paid by this one operation.`,
      3,
      { wave: rest.map(keyId), wind: hashCode(last, fn) },
    );
  }
  rec.old = null;
  rec.lit = null;
  note(rec, 'rehash', null, keys.length);
  rec.push(
    'retire',
    grew ? 'The old table is freed.' : 'Rehashed.',
    grew
      ? `${splitNote(T, before, true)} Load factor ${T.n}/${m2} = ${fmtLoad(T.n, m2)}. Moving all ${keys.length} keys is O(n), but it only happens when the table doubles, so spread over the inserts that filled it, it adds a constant to each: insert is O(1) amortized.`
      : `${splitNote(T, before, false)} Moving every key is O(n), which is why a table changes its hash (or its size) only rarely.`,
    4,
    {},
  );
}

/* ---------------- public operations ---------------- */

const codeOf = (s: Strategy, what: 'put' | 'get' | 'remove') => `${s}.${what}` as const;

export function insert(T: HashTable, k: number, opts: InsertOptions): Recording {
  const title = `Insert ${k}`;
  const rec = new Recorder(T, title, 'insert', codeOf(T.strategy, 'put'));
  const start = rec.diagram(),
    led = ledgerStart(T);
  if (!T.has(k) && ((T.strategy === 'chain' && T.n >= MAX_KEYS) || T.full)) {
    rec.push(
      'refuse',
      T.full ? 'Every slot is taken.' : `The plinth holds ${MAX_KEYS} keys.`,
      T.full
        ? `All ${T.m} slots hold a key, so an open-addressing table can’t take another: a probe would go all the way round and find nowhere to stop. This is why it grows long before this point.`
        : 'Delete something first.',
      -1,
      { focus: 'gauge', callout: { text: 'full', tone: 'red' } },
    );
    return finish(rec, title, start, led);
  }
  if (T.strategy === 'chain') chainInsert(rec, k, opts);
  else probeInsert(rec, k, opts);
  maybeGrow(rec, opts);
  return finish(rec, title, start, led);
}

export function search(T: HashTable, k: number): Recording {
  const title = `Search for ${k}`;
  const rec = new Recorder(T, title, 'search', codeOf(T.strategy, 'get'));
  const start = rec.diagram(),
    led = ledgerStart(T);
  if (T.strategy === 'chain') chainFind(rec, k, false);
  else probeFind(rec, k, false);
  return finish(rec, title, start, led);
}

export function remove(T: HashTable, k: number): Recording {
  const title = `Delete ${k}`;
  const rec = new Recorder(T, title, 'delete', codeOf(T.strategy, 'remove'));
  const start = rec.diagram(),
    led = ledgerStart(T);
  if (T.strategy === 'chain') chainFind(rec, k, true);
  else probeFind(rec, k, true);
  return finish(rec, title, start, led);
}

/** One whole insert as a single step: for batches, where the details have already been shown. */
function putStep(rec: Recorder, k: number, opts: InsertOptions): boolean {
  const T = rec.T;
  rec.code = codeOf(T.strategy, 'put');
  rec.cx = 'insert';
  if (T.has(k)) return true;
  if ((T.strategy === 'chain' && T.n >= MAX_KEYS) || T.full) {
    rec.push(
      'refuse',
      'No room for more keys.',
      T.full ? 'Every slot is taken.' : `The plinth holds ${MAX_KEYS} keys.`,
      -1,
      {
        focus: 'gauge',
        callout: { text: 'full', tone: 'red' },
      },
    );
    return false;
  }
  const b = T.home(k),
    before = T.strategy === 'chain' ? T.chains[b].length : 0,
    walk = T.strategy === 'probe' ? T.probe(k) : null;
  const at = T.quickInsert(k);
  if (!at) return true;
  rec.cost.hashes++;
  rec.hand = b;
  rec.lit = null;
  let head: string, body: string, work: number;
  let path: number[] | null = null;
  if (T.strategy === 'chain') {
    rec.cost.compares += before;
    work = 1 + before;
    rec.hot.add(rec.linkInto(b, at.level));
    head = before ? `${k} → bucket ${b}, behind ${plural(before, 'key')}.` : `${k} → bucket ${b}.`;
    body = `${hashBody(k, T.m, T.hash, true)} ${before ? `${compares(before)} to check it isn’t there already; the chain is ${before + 1} long now.` : 'An empty bucket: no comparisons.'}`;
  } else {
    const steps = walk ? walk.path.indexOf(at.bucket) + 1 : 1;
    path = walk ? walk.path.slice(0, steps) : null;
    rec.cost.probes += steps;
    work = steps;
    head = at.bucket === b ? `${k} → bucket ${b}.` : `${k} → bucket ${b}, then on to ${at.bucket}.`;
    body = `${hashBody(k, T.m, T.hash, true)} ${steps === 1 ? '1 probe.' : `${probes(steps)}.`}${runNote(T, at.bucket)}`;
  }
  note(rec, 'insert', k, work);
  rec.push('put', head, body + afterNote(T, opts), T.strategy === 'chain' ? 5 : 4, {
    focus: keyId(k),
    wind: hashCode(k, T.hash),
    path,
    callout: { text: hashSum(k, T.m, T.hash), tone: 'cobalt' },
  });
  maybeGrow(rec, opts);
  return true;
}

/** Insert several keys, one step each (plus any growing on the way). */
export function insertMany(T: HashTable, keys: readonly number[], opts: InsertOptions, title: string): Recording {
  const rec = new Recorder(T, title, 'insert', codeOf(T.strategy, 'put'));
  const start = rec.diagram(),
    led = ledgerStart(T);
  for (const k of keys) if (!putStep(rec, k, opts)) break;
  return finish(rec, title, start, led);
}

/**
 * Unlucky keys: a fresh table of 8 buckets and seven keys that are all multiples of 8,
 * so the plain hash sends every one to the same place. Then a search for the last one.
 */
export function unlucky(T: HashTable, opts: InsertOptions): Recording {
  T.hash = 'plain';
  T.clear(MIN_SIZE);
  T.ledger = [];
  const title = 'Unlucky keys';
  const rec = new Recorder(T, title, 'insert', codeOf(T.strategy, 'put'));
  const start = rec.diagram();
  for (const k of UNLUCKY) putStep(rec, k, opts);
  // then look the last one up, in full
  const k = UNLUCKY[UNLUCKY.length - 1];
  rec.op = `Search for ${k}`;
  rec.cx = 'search';
  rec.code = codeOf(T.strategy, 'get');
  // the chips count the search alone
  Object.assign(rec.cost, zeroCost());
  if (T.strategy === 'chain') chainFind(rec, k, false);
  else probeFind(rec, k, false);
  const looks = T.strategy === 'chain' ? rec.cost.compares : rec.cost.probes;
  const used = new Set(UNLUCKY.map(u => T.home(u))).size;
  rec.op = title;
  rec.calm();
  rec.push(
    'done',
    'Same code. Only the keys changed.',
    `Every key is a multiple of 8, and so is the table size, so the plain hash can’t tell them apart: they share ${used === 1 ? 'a single bucket' : `just ${used} of ${T.m} buckets`}, and finding ${k} took ${plural(looks, T.strategy === 'chain' ? 'comparison' : 'probe')} instead of one or two. With n keys in one pile, that is O(n): the worst case.${T.m > MIN_SIZE ? ` Doubling only halved the pile, since ${T.m} is a multiple of 8 too.` : ''} Switch to the Scrambled hash to spread the same keys out.`,
    -1,
    {},
  );
  return finish(rec, title, start, 0);
}

/** Change the hash function: every key is rehashed into a table of the same size. */
export function switchHash(T: HashTable, fn: HashFn): Recording {
  const title = fn === 'plain' ? 'Back to the plain hash' : 'Switch to the scrambled hash';
  const rec = new Recorder(T, title, 'resize', 'rehash');
  const start = rec.diagram(),
    led = ledgerStart(T);
  rehashAll(rec, T.m, fn);
  return finish(rec, title, start, led);
}
