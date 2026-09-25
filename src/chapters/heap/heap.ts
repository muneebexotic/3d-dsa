// The heap itself: one array, read as a tree. Slot i's children are at 2i + 1 and
// 2i + 2 and its parent at (i − 1) / 2, rounded down, so the tree needs no
// pointers at all. Plain data and quick (unrecorded) operations; the recorded
// versions live in ops.ts.

/** Smallest on top (a min-heap) or largest on top (a max-heap). */
export type Order = 'min' | 'max';

export const MIN_KEY = 0;
export const MAX_KEY = 99;
/** Five full rows. */
export const MAX_SIZE = 31;

/** A key in the heap. Dijkstra's tickets carry the knot they are for as a tag. */
export interface Item {
  id: string;
  key: number;
  tag?: string;
}

export const parentOf = (i: number): number => (i - 1) >> 1;
export const leftOf = (i: number): number => 2 * i + 1;
export const rightOf = (i: number): number => 2 * i + 2;
/** The row slot i sits in: 0 for the top, 1 for its children, and so on. */
export const rowOf = (i: number): number => 31 - Math.clz32(i + 1);
/** Rows a heap of n keys fills. */
export const rowsFor = (n: number): number => (n <= 0 ? 0 : rowOf(n - 1) + 1);

/** How far a key in slot i could sink in a heap of n: the longest way down to a leaf. */
export function heightOf(i: number, n: number): number {
  let h = 0;
  for (let c = leftOf(i); c < n; c = leftOf(c)) h++;
  return h;
}

/** The most swaps heapify can make on n keys: every key sinks at most its height. */
export function heapifyBound(n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += heightOf(i, n);
  return s;
}

/** The most swaps n pushes can make: every key climbs at most its row. */
export function pushBound(n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += rowOf(i);
  return s;
}

/**
 * x belongs above y: its key is strictly better (smaller in a min-heap). Equal keys
 * are fine either way, except Dijkstra's tickets, which break ties by knot, as
 * Graph Net's queue does, so the two hand out tickets in exactly the same order.
 */
export function outranks(order: Order, x: Item, y: Item): boolean {
  const d = order === 'min' ? x.key - y.key : y.key - x.key;
  if (d) return d < 0;
  return x.tag != null && y.tag != null && x.tag < y.tag;
}

/** What one operation cost, for the work chart. */
export interface Entry {
  kind: 'push' | 'pop' | 'build' | 'lower';
  /** The key pushed, popped or lowered; the size, for a build. */
  key: number;
  tag?: string;
  swaps: number;
  compares: number;
  /** The most swaps it could have needed: the height for a push or pop, the sum of heights for a build. */
  bound: number;
  /** Keys in the heap afterwards. */
  n: number;
}

export interface SiftCost {
  swaps: number;
  compares: number;
}

export class Heap {
  order: Order;
  a: Item[] = [];
  /** Keys taken off the top, in the order they came out. */
  out: Item[] = [];
  ledger: Entry[] = [];
  private serial = 0;

  constructor(order: Order = 'min', keys: readonly number[] = []) {
    this.order = order;
    this.a = keys.map(k => this.make(k));
  }

  get n(): number {
    return this.a.length;
  }
  get full(): boolean {
    return this.n >= MAX_SIZE;
  }
  get empty(): boolean {
    return this.n === 0;
  }
  /** How many rows tall the heap is, minus one: the most a push or pop can swap. */
  get height(): number {
    return Math.max(0, rowsFor(this.n) - 1);
  }

  /** A new item, not yet in the heap. */
  make(key: number, tag?: string): Item {
    return tag != null ? { id: `t${tag}`, key, tag } : { id: `h${this.serial++}`, key };
  }

  above(x: Item, y: Item): boolean {
    return outranks(this.order, x, y);
  }

  /** Every parent is at least as good as its children. */
  isHeap(): boolean {
    for (let i = 1; i < this.n; i++) if (this.above(this.a[i], this.a[parentOf(i)])) return false;
    return true;
  }

  indexOf(id: string): number {
    return this.a.findIndex(it => it.id === id);
  }

  keys(): number[] {
    return this.a.map(it => it.key);
  }

  swap(i: number, j: number): void {
    const t = this.a[i];
    this.a[i] = this.a[j];
    this.a[j] = t;
  }

  /** The better child of slot i, or -1 for a leaf. */
  betterChild(i: number): number {
    const l = leftOf(i),
      r = rightOf(i);
    if (l >= this.n) return -1;
    return r < this.n && this.above(this.a[r], this.a[l]) ? r : l;
  }

  /* ---------- quick operations: no recording ---------- */

  siftUp(i: number): SiftCost {
    const c = { swaps: 0, compares: 0 };
    while (i > 0) {
      const p = parentOf(i);
      c.compares++;
      if (!this.above(this.a[i], this.a[p])) break;
      this.swap(i, p);
      c.swaps++;
      i = p;
    }
    return c;
  }

  siftDown(i: number): SiftCost {
    const c = { swaps: 0, compares: 0 };
    for (;;) {
      const b = this.betterChild(i);
      if (b < 0) break;
      c.compares += b === leftOf(i) && rightOf(i) >= this.n ? 1 : 2;
      if (!this.above(this.a[b], this.a[i])) break;
      this.swap(i, b);
      c.swaps++;
      i = b;
    }
    return c;
  }

  push(key: number, tag?: string): SiftCost {
    this.a.push(this.make(key, tag));
    return this.siftUp(this.n - 1);
  }

  pop(): Item | null {
    if (!this.n) return null;
    const top = this.a[0],
      last = this.a.pop() as Item;
    if (this.n) {
      this.a[0] = last;
      this.siftDown(0);
    }
    this.out.push(top);
    return top;
  }

  /** Give an item a better key and let it climb. */
  lower(id: string, key: number): SiftCost {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`No item ${id}`);
    this.a[i] = { ...this.a[i], key };
    return this.siftUp(i);
  }

  /** Floyd's bottom-up build: sift down every parent, last first. */
  heapify(): SiftCost {
    const c = { swaps: 0, compares: 0 };
    for (let i = (this.n >> 1) - 1; i >= 0; i--) {
      const d = this.siftDown(i);
      c.swaps += d.swaps;
      c.compares += d.compares;
    }
    return c;
  }
}

/** Swaps it takes to push these keys one at a time into an empty heap. */
export function pushOneByOne(keys: readonly number[], order: Order): number {
  const H = new Heap(order);
  let s = 0;
  for (const k of keys) s += H.push(k).swaps;
  return s;
}
