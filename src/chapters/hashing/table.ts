// The hash table itself, in both styles: separate chaining (every bucket keeps a
// list of keys) and linear probing (every bucket holds one key, and a key that
// finds its bucket taken tries the next). Plain data and plain operations; the
// recorder in ops.ts watches these run.

import { bucketOf, type HashFn } from './hash';

export type Strategy = 'chain' | 'probe';

/** The table sizes on show: a clock of 8 hours, then 16, then 32. */
export const SIZES = [8, 16, 32] as const;
export const MIN_SIZE = SIZES[0];
export const MAX_SIZE = SIZES[SIZES.length - 1];
/** Grow once more than three quarters of the buckets' worth of keys are in. */
export const MAX_LOAD = 3 / 4;
/** Chaining never runs out of room, but the plinth does. */
export const MAX_KEYS = 32;

/** A probing slot's contents: a key, a tombstone left by a delete, or nothing. */
export const TOMB = -1;
export type Slot = number | null;

/** What one finished operation cost, for the work chart. */
export interface Entry {
  kind: 'insert' | 'search' | 'delete' | 'rehash';
  key: number | null;
  /** Places looked at: buckets, chain nodes and slots; for a rehash, keys moved. */
  work: number;
  /** Keys and buckets after the operation. */
  n: number;
  m: number;
}

/** Where a probe for key k went: every slot it looked at, and how it ended. */
export interface ProbeWalk {
  path: number[];
  /** The slot holding k, or -1. */
  found: number;
  /** The first empty slot reached, or -1 if the probe went all the way round. */
  empty: number;
  /** The first tombstone passed, or -1. */
  tomb: number;
}

export class HashTable {
  readonly strategy: Strategy;
  hash: HashFn;
  m: number;
  /** Chaining: each bucket's keys, head of the chain first. */
  chains: number[][] = [];
  /** Probing: one key, TOMB or null per slot. */
  slots: Slot[] = [];
  /** Every operation's cost, oldest first. */
  ledger: Entry[] = [];

  constructor(strategy: Strategy, m: number = MIN_SIZE, hash: HashFn = 'plain') {
    this.strategy = strategy;
    this.hash = hash;
    this.m = m;
    this.clear(m);
  }

  /** Empty the table, at size m. */
  clear(m = this.m): void {
    this.m = m;
    this.chains = Array.from({ length: m }, () => []);
    this.slots = Array.from({ length: m }, () => null);
  }

  get n(): number {
    return this.strategy === 'chain'
      ? this.chains.reduce((a, c) => a + c.length, 0)
      : this.slots.filter(s => s != null && s !== TOMB).length;
  }

  get tombs(): number {
    return this.strategy === 'chain' ? 0 : this.slots.filter(s => s === TOMB).length;
  }

  /** The load factor, α = n / m. */
  get load(): number {
    return this.n / this.m;
  }

  /** Every key, bucket by bucket (chains head first). This is the order a rehash visits them. */
  keys(): number[] {
    return this.strategy === 'chain'
      ? this.chains.flat()
      : this.slots.filter((s): s is number => s != null && s !== TOMB);
  }

  home(k: number): number {
    return bucketOf(k, this.m, this.hash);
  }

  /** Walk the probe sequence for k: until it is found, an empty slot, or every slot has been seen. */
  probe(k: number): ProbeWalk {
    const h = this.home(k),
      path: number[] = [];
    let tomb = -1;
    for (let j = 0; j < this.m; j++) {
      const s = (h + j) % this.m,
        v = this.slots[s];
      path.push(s);
      if (v === k) return { path, found: s, empty: -1, tomb };
      if (v == null) return { path, found: -1, empty: s, tomb };
      if (v === TOMB && tomb < 0) tomb = s;
    }
    return { path, found: -1, empty: -1, tomb };
  }

  has(k: number): boolean {
    return this.strategy === 'chain' ? this.chains[this.home(k)].includes(k) : this.probe(k).found >= 0;
  }

  /** Probing: can a new key go anywhere? */
  get full(): boolean {
    return this.strategy === 'probe' && this.slots.every(s => s != null && s !== TOMB);
  }

  /** Insert without recording. Returns where it went, or null if it was there already (or there is no room). */
  quickInsert(k: number): { bucket: number; level: number } | null {
    if (this.strategy === 'chain') {
      const c = this.chains[this.home(k)];
      if (c.includes(k)) return null;
      c.push(k);
      return { bucket: this.home(k), level: c.length - 1 };
    }
    const w = this.probe(k);
    if (w.found >= 0) return null;
    const s = w.tomb >= 0 ? w.tomb : w.empty;
    if (s < 0) return null;
    this.slots[s] = k;
    return { bucket: s, level: 0 };
  }

  /** Delete without recording. Probing leaves a tombstone. */
  quickRemove(k: number): boolean {
    if (this.strategy === 'chain') {
      const c = this.chains[this.home(k)],
        i = c.indexOf(k);
      if (i < 0) return false;
      c.splice(i, 1);
      return true;
    }
    const w = this.probe(k);
    if (w.found < 0) return false;
    this.slots[w.found] = TOMB;
    return true;
  }

  /** Put every key into a fresh table of size m under hash fn, in rehash order. Tombstones are dropped. */
  rebuild(m: number, fn: HashFn = this.hash): void {
    const keys = this.keys();
    this.hash = fn;
    this.clear(m);
    for (const k of keys) this.quickInsert(k);
  }

  /** Over three quarters full: time to grow, if there is a bigger size. */
  get overloaded(): boolean {
    return this.load > MAX_LOAD;
  }

  get canGrow(): boolean {
    return this.m < MAX_SIZE;
  }

  /** Where a key sits: its bucket, and how far along the chain (or from home, when probing). */
  locate(k: number): { bucket: number; level: number; distance: number } | null {
    if (this.strategy === 'chain') {
      const b = this.home(k),
        i = this.chains[b].indexOf(k);
      return i < 0 ? null : { bucket: b, level: i, distance: i };
    }
    const w = this.probe(k);
    return w.found < 0 ? null : { bucket: w.found, level: 0, distance: w.path.length - 1 };
  }

  /** The longest chain (chaining), or the longest run of slots a probe has to pass through (probing). */
  longest(): number {
    if (this.strategy === 'chain') return Math.max(0, ...this.chains.map(c => c.length));
    let best = 0,
      run = 0;
    // walk twice round so a run that wraps past the last slot is counted whole
    for (let j = 0; j < 2 * this.m; j++) {
      const v = this.slots[j % this.m];
      run = v != null ? run + 1 : 0;
      best = Math.max(best, Math.min(run, this.m));
    }
    return best;
  }
}
