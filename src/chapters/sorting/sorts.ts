// The six sorts, run on threads and recorded. Each one works on a plain array of
// thread ids and reports every comparison it makes (a pick of the loom), every
// key it moves, and what it has learned (which slots are final, where the pivot
// is). The recording is the whole history: the arrangement before each pick, and
// an event per comparison or move with its narration. No DOM, no Three.js.

import { plural } from '../../core/math';
import type { Threads } from './threads';

export type SortKey = 'bubble' | 'insertion' | 'selection' | 'merge' | 'quick' | 'heap';
export const SORTS: readonly SortKey[] = ['bubble', 'insertion', 'selection', 'merge', 'quick', 'heap'];
export const NAMES: Readonly<Record<SortKey, string>> = {
  bubble: 'Bubble sort',
  insertion: 'Insertion sort',
  selection: 'Selection sort',
  merge: 'Merge sort',
  quick: 'Quick sort',
  heap: 'Heap sort',
};
/** One word for each, for tight spots. */
export const SHORT: Readonly<Record<SortKey, string>> = {
  bubble: 'Bubble',
  insertion: 'Insertion',
  selection: 'Selection',
  merge: 'Merge',
  quick: 'Quick',
  heap: 'Heap',
};
export const STABLE: Readonly<Record<SortKey, boolean>> = {
  bubble: true,
  insertion: true,
  selection: false,
  merge: true,
  quick: false,
  heap: false,
};

/** What a sort knows about the row after an event, drawn at the front of the loom. */
export interface Marks {
  /** Slots whose key is in its final place. */
  final: boolean[];
  /** The part of the row being worked on, [lo, hi). */
  range: readonly [number, number] | null;
  /** Insertion: the key being inserted, lifted out of the row (-1 for none). */
  held: number;
  /** Insertion: how many slots at the start are in order among themselves. */
  sorted: number;
  /** Selection: the smallest key found so far in this pass. */
  min: number;
  /** Quick: the pivot, and the slot where the low side ends. */
  pivot: number;
  low: number;
  /** Merge: merged so far [lo, k), the left run [k, m), the right run [m, hi). */
  merge: { lo: number; k: number; m: number; hi: number } | null;
  /** Heap: how many slots the heap holds (0 with no heap), and the key sinking. */
  heap: number;
  sink: number;
}

export type EvKind = 'pick' | 'move' | 'done';

export interface Ev {
  kind: EvKind;
  /** The slots compared, before anything moved (-1 for a move). */
  i: number;
  j: number;
  /** The arrangement after the event: arr[slot] = thread id. */
  arr: number[];
  /** Comparisons and writes so far. */
  comps: number;
  writes: number;
  head: string;
  body: string;
  /** The line of code, 0-based (-1 for none). */
  line: number;
  marks: Marks;
  /** Twins that changed order in this event: each pair is a knot. */
  knots: [number, number][];
}

export interface Run {
  key: SortKey;
  threads: Threads;
  events: Ev[];
  /** The arrangement before each pick, then the sorted one: states.length = comps + 1. */
  states: number[][];
  comps: number;
  writes: number;
  /** Knots tied (twins crossing). */
  knots: number;
}

const freshMarks = (n: number): Marks => ({
  final: new Array<boolean>(n).fill(false),
  range: null,
  held: -1,
  sorted: 0,
  min: -1,
  pivot: -1,
  low: -1,
  merge: null,
  heap: 0,
  sink: -1,
});

const cloneMarks = (m: Marks): Marks => ({ ...m, final: m.final.slice(), merge: m.merge ? { ...m.merge } : null });

/** Runs a sort on an array of thread ids and writes down everything it does. */
class Recorder {
  readonly n: number;
  readonly a: number[];
  readonly V: number[];
  readonly L: string[];
  readonly name: string;
  comps = 0;
  writes = 0;
  knots = 0;
  readonly events: Ev[] = [];
  readonly states: number[][] = [];
  m: Marks;
  /** Counts only: no arrangements or words (for the growth chart). */
  readonly lean: boolean;
  private pend: { i: number; j: number } | null = null;
  private before: number[] = [];

  constructor(th: Threads, name: string, lean: boolean) {
    this.n = th.n;
    this.a = th.list.map(t => t.id);
    this.V = th.list.map(t => t.v);
    this.L = th.list.map(t => t.label);
    this.name = name;
    this.lean = lean;
    this.m = freshMarks(th.n);
    this.before = this.a.slice();
  }

  /** The value in slot i. */
  v(i: number): number {
    return this.V[this.a[i]];
  }
  /** The label of thread id. */
  l(id: number): string {
    return this.L[id];
  }

  /** Compare the keys in slots i and j: negative if slot i's is smaller, 0 if they are equal. */
  cmp(i: number, j: number): number {
    if (!this.lean) this.states.push(this.a.slice());
    this.comps++;
    this.pend = { i, j };
    return this.v(i) - this.v(j);
  }

  /** Swap two slots (two writes). */
  swap(i: number, j: number): void {
    if (i === j) return;
    const a = this.a;
    [a[i], a[j]] = [a[j], a[i]];
    this.writes += 2;
  }

  /** Insertion's shift: the key in slot j moves right, and the key after it steps left (one write). */
  shift(j: number): void {
    const a = this.a;
    [a[j], a[j + 1]] = [a[j + 1], a[j]];
    this.writes += 1;
  }

  /** Merge's take: the key in slot from goes to slot to (to < from), and the keys between move right. */
  lift(from: number, to: number): void {
    const a = this.a,
      x = a[from];
    for (let k = from; k > to; k--) a[k] = a[k - 1];
    a[to] = x;
  }

  write(k = 1): void {
    this.writes += k;
  }

  /** Twins whose order changed since the last event. */
  private flips(): [number, number][] {
    const out: [number, number][] = [];
    const pos = (arr: number[]) => {
      const p = new Array<number>(this.n);
      arr.forEach((id, s) => (p[id] = s));
      return p;
    };
    const p0 = pos(this.before),
      p1 = pos(this.a);
    for (let x = 0; x < this.n; x++)
      for (let y = x + 1; y < this.n; y++)
        if (this.V[x] === this.V[y] && p0[x] < p0[y] !== p1[x] < p1[y]) out.push([x, y]);
    return out;
  }

  private emit(kind: EvKind, head: string, body: string, line: number): void {
    const p = this.pend;
    this.pend = null;
    if (this.lean) return;
    const knots = this.flips();
    if (knots.length && this.knots === 0 && kind !== 'done') {
      const [x, y] = knots[0];
      body += ` ${this.l(x)} and ${this.l(y)} just crossed: twins out of order is a knot, and it means ${this.name.toLowerCase()} is not stable.`;
    }
    this.knots += knots.length;
    this.events.push({
      kind,
      i: p ? p.i : -1,
      j: p ? p.j : -1,
      arr: this.a.slice(),
      comps: this.comps,
      writes: this.writes,
      head,
      body,
      line,
      marks: cloneMarks(this.m),
      knots,
    });
    this.before = this.a.slice();
  }

  pick(head: string, body: string, line: number): void {
    this.emit('pick', head, body, line);
  }
  move(head: string, body: string, line: number): void {
    this.emit('move', head, body, line);
  }
  done(head: string, body: string): void {
    this.emit('done', head, body, -1);
  }

  allFinal(): void {
    this.m.final.fill(true);
  }

  finish(): void {
    if (!this.lean) this.states.push(this.a.slice());
  }
}

const rel = (d: number): string => (d < 0 ? '<' : d > 0 ? '>' : '=');

/* ---------------- bubble ---------------- */

function bubble(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    R.m.range = [0, n - i];
    for (let j = 0; j < n - 1 - i; j++) {
      const x = a[j],
        y = a[j + 1];
      const d = R.cmp(j, j + 1);
      let head: string, body: string, line: number;
      if (d > 0) {
        R.swap(j, j + 1);
        swapped = true;
        head = `${L(x)} > ${L(y)}: swap them.`;
        body = `${L(x)} is the biggest so far in this pass, so it keeps moving right, one place per comparison.`;
        line = 4;
      } else {
        head = `${L(x)} ${rel(d)} ${L(y)}: leave them.`;
        body =
          d === 0
            ? 'Equal keys never swap, so twins keep their order: bubble sort is stable.'
            : `${L(y)} is bigger, so it is the one that moves on from here.`;
        line = 3;
      }
      if (j === 0)
        body = `Pass ${i + 1}: walk the row from the left, swapping any two neighbours that are out of order. ${body}`;
      if (j === n - 2 - i) {
        R.m.final[n - 1 - i] = true;
        if (!swapped) {
          R.allFinal();
          R.m.range = null;
          body = `No swaps in a whole pass, so the row is already sorted: stop early. That check is why bubble sort takes only n − 1 comparisons on sorted input.`;
          line = 6;
        } else {
          if (i === n - 2) R.allFinal();
          body = `${L(a[n - 1 - i])} has bubbled up to slot ${n - 1 - i}, its final place. Each pass fixes one more key at the end.`;
        }
      }
      R.pick(head, body, line);
    }
    if (!swapped) break;
  }
  R.allFinal();
}

/* ---------------- insertion ---------------- */

function insertion(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  R.m.sorted = 1;
  for (let i = 1; i < n; i++) {
    const key = a[i];
    R.m.range = [0, i + 1];
    let j = i - 1;
    let first = true;
    while (j >= 0) {
      const x = a[j];
      R.m.held = key;
      const d = R.cmp(j, j + 1);
      let head: string, body: string, line: number;
      if (d > 0) {
        R.shift(j);
        head = `${L(x)} > ${L(key)}: shift ${L(x)} right.`;
        body = first
          ? `Take ${L(key)} out and slide it into the sorted part on its left. Every bigger key moves one place right to make room.`
          : `${L(key)} moves one more place left.`;
        line = 3;
        if (j === 0) {
          R.write();
          R.m.held = -1;
          R.m.sorted = i + 1;
          body = `${first ? `Take ${L(key)} out to insert it on the left. ` : ''}Nothing is left to compare, so ${L(key)} drops into slot 0: the smallest so far.`;
          line = 4;
        }
        R.pick(head, body, line);
        j--;
        first = false;
        continue;
      }
      R.write();
      R.m.held = -1;
      R.m.sorted = i + 1;
      head = `${L(x)} ${rel(d)} ${L(key)}: ${L(key)} drops into slot ${j + 1}.`;
      body = first
        ? `${L(key)} is already at least as big as everything on its left, so it stays: one comparison, no shifting. On nearly sorted input that happens again and again.`
        : `The first ${i + 1} keys are now in order among themselves (not yet in their final places).`;
      if (d === 0) body = `Equal keys stop the slide, so ${L(key)} stays behind its twin: insertion sort is stable.`;
      line = 4;
      R.pick(head, body, line);
      break;
    }
  }
  R.m.range = null;
  R.allFinal();
}

/* ---------------- selection ---------------- */

function selection(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  for (let i = 0; i < n - 1; i++) {
    let m = i;
    R.m.range = [i, n];
    R.m.min = a[i];
    for (let j = i + 1; j < n; j++) {
      const x = a[j],
        y = a[m];
      const d = R.cmp(m, j);
      let head: string, body: string;
      if (d > 0) {
        m = j;
        R.m.min = x;
        head = `${L(x)} < ${L(y)}: ${L(x)} is the smallest so far.`;
        body = 'Remember where it is and keep scanning: every key left in the row has to be looked at.';
      } else {
        head = `${L(x)} ${d === 0 ? '=' : '>'} ${L(y)}: ${L(y)} is still the smallest.`;
        body = `Nothing moves during the scan. Only the smallest key's slot is remembered.`;
      }
      if (j === i + 1)
        body = `Pass ${i + 1}: scan slots ${i} to ${n - 1} for the smallest key. ${d > 0 ? 'Remember where it is.' : 'Nothing moves until the scan is done.'}`;
      R.pick(head, body, 3);
    }
    const x = a[m],
      y = a[i];
    R.m.min = -1;
    R.m.final[i] = true;
    if (i === n - 2) R.m.final[n - 1] = true;
    if (m !== i) {
      R.swap(i, m);
      R.move(
        `Swap ${L(x)} into slot ${i}.`,
        `${L(x)} is in its final place, and ${L(y)} goes to slot ${m}. Selection sort makes at most one swap a pass, so at most n − 1 in all, but it still compares every pair.`,
        4,
      );
    } else
      R.move(
        `${L(x)} stays in slot ${i}.`,
        'It was already the smallest left, so no swap is needed: it is in its final place.',
        4,
      );
  }
  R.m.range = null;
  R.allFinal();
}

/* ---------------- merge ---------------- */

function merge(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  const runText = (lo: number, hi: number) =>
    hi - lo <= 4
      ? a
          .slice(lo, hi)
          .map(id => L(id))
          .join(' ')
      : `slots ${lo}–${hi - 1}`;
  let firstEver = true;
  function mergeRuns(lo: number, mid: number, hi: number): void {
    let k = lo,
      m = mid,
      first = true;
    const pair = hi - lo === 2;
    const intro = firstEver
      ? 'Merge sort splits the row in half, and in half again, down to single keys: one key is already sorted. Then it merges neighbours back together, two sorted runs at a time.'
      : pair
        ? `Merge ${runText(lo, mid)} with ${runText(mid, hi)}.`
        : `Merge ${runText(lo, mid)} with ${runText(mid, hi)}: both runs are sorted, so only their front keys are compared.`;
    firstEver = false;
    R.m.range = [lo, hi];
    while (k < m && m < hi) {
      R.m.merge = { lo, k, m, hi };
      const x = a[k],
        y = a[m];
      const d = R.cmp(k, m);
      let head: string, body: string, line: number;
      if (d <= 0) {
        R.write();
        k++;
        head = `${L(x)} ${rel(d)} ${L(y)}: take ${L(x)} from the left.`;
        body =
          d === 0
            ? 'Equal keys: taking the left one first keeps twins in order. That is what makes merge sort stable.'
            : `${L(x)} is already next in line, so nothing moves.`;
        line = 8;
      } else {
        R.lift(m, k);
        R.write();
        head = `${L(y)} < ${L(x)}: take ${L(y)} from the right.`;
        body = `It goes ahead of the ${plural(m - k, 'key')} still waiting in the left run.`;
        k++;
        m++;
        line = 9;
      }
      R.m.merge = { lo, k, m, hi };
      const end = k >= m || m >= hi;
      if (end) {
        R.write(hi - k);
        R.m.merge = { lo, k: hi, m: hi, hi };
        if (lo === 0 && hi === n) R.allFinal();
        line = 10;
      }
      if (first) body = pair && d !== 0 ? intro : `${intro} ${body}`;
      else if (end)
        body = `${d === 0 ? `${body} ` : ''}The ${k >= m ? 'left' : 'right'} run is used up, so the rest are already in place.${lo === 0 && hi === n ? ' The whole row is merged.' : ''}`;
      first = false;
      R.pick(head, body, line);
    }
  }
  function sort(lo: number, hi: number): void {
    if (hi - lo < 2) return;
    const mid = (lo + hi) >> 1;
    sort(lo, mid);
    sort(mid, hi);
    mergeRuns(lo, mid, hi);
  }
  sort(0, n);
  R.m.merge = null;
  R.m.range = null;
  R.allFinal();
}

/* ---------------- quick ---------------- */

function quick(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  let firstEver = true;
  function partition(lo: number, hi: number): number {
    const pv = a[hi - 1];
    let i = lo;
    R.m.range = [lo, hi];
    R.m.pivot = pv;
    R.m.low = lo;
    for (let j = lo; j < hi - 1; j++) {
      const x = a[j];
      const d = R.cmp(j, hi - 1);
      let head: string, body: string, line: number;
      if (d < 0) {
        const y = a[i];
        R.swap(i, j);
        head = `${L(x)} < ${L(pv)}: into the low side.`;
        body =
          i === j
            ? 'It is right at the edge of the low side, so it joins without moving.'
            : `Swap it with ${L(y)}, the first key of the high side, and the low side grows by one.`;
        line = 8;
        i++;
      } else {
        head = `${L(x)} ${d === 0 ? '=' : '>'} ${L(pv)}: it stays on the high side.`;
        body = 'Only keys smaller than the pivot move.';
        line = 7;
      }
      R.m.low = i;
      if (j === lo)
        body = `${firstEver ? 'Quick sort picks a pivot and splits the row round it. ' : ''}Partition slots ${lo} to ${hi - 1} round the last key, ${L(pv)}: smaller keys gather on the left.`;
      firstEver = false;
      R.pick(head, body, line);
    }
    const onEnd = i === hi - 1;
    R.swap(i, hi - 1);
    R.m.final[i] = true;
    R.m.pivot = -1;
    R.m.low = -1;
    const lopsided = (i === lo || i === hi - 1) && hi - lo > 2;
    R.move(
      onEnd ? `The pivot ${L(pv)} is already in place: slot ${i}.` : `Swap the pivot ${L(pv)} into slot ${i}.`,
      lopsided
        ? `Every other key went to the ${i === lo ? 'high' : 'low'} side. A lopsided split like this only shrinks the problem by one key; on sorted input it happens every time, and quick sort slows to O(n²).`
        : `Everything left of it is smaller and everything right is at least as big, so ${L(pv)} is in its final place. Each side is sorted the same way.`,
      9,
    );
    return i;
  }
  function sort(lo: number, hi: number): void {
    if (hi - lo < 2) {
      if (hi - lo === 1) R.m.final[lo] = true;
      return;
    }
    const p = partition(lo, hi);
    sort(lo, p);
    sort(p + 1, hi);
  }
  sort(0, n);
  R.m.range = null;
  R.allFinal();
}

/* ---------------- heap ---------------- */

function heap(R: Recorder): void {
  const n = R.n,
    a = R.a,
    L = (id: number) => R.l(id);
  let firstEver = true;
  const intro = `Heap sort first heapifies the row into a max-heap, as in Heap Pyramid: slot i’s children are 2i + 1 and 2i + 2, and every parent must be at least as big as them. Sink each parent, from slot ${(n >> 1) - 1} back to 0.`;
  function sink(i: number, end: number): void {
    while (2 * i + 1 < end) {
      let c = 2 * i + 1;
      R.m.sink = a[i];
      if (c + 1 < end) {
        const l = a[c],
          r = a[c + 1],
          p = a[i];
        const d = R.cmp(c, c + 1);
        if (d < 0) c++;
        const big = d < 0 ? r : l;
        R.pick(
          `Children of ${L(p)}: ${L(l)} and ${L(r)}.`,
          firstEver
            ? intro
            : `${L(big)} is the ${d === 0 ? 'first of two equals' : 'bigger'}, so it is the one ${L(p)} must beat to stay.`,
          7,
        );
        firstEver = false;
      }
      const x = a[i],
        y = a[c];
      const d = R.cmp(i, c);
      if (d >= 0) {
        R.m.sink = -1;
        R.pick(
          `${L(x)} ${rel(d)} ${L(y)}: ${L(x)} stays.`,
          firstEver ? intro : `No child is bigger, so the heap is in order from slot ${i} down.`,
          8,
        );
        firstEver = false;
        return;
      }
      R.swap(i, c);
      const leaf = 2 * c + 1 >= end;
      if (leaf) R.m.sink = -1;
      R.pick(
        `${L(y)} > ${L(x)}: swap them.`,
        firstEver
          ? intro
          : `${L(x)} sinks to slot ${c}${leaf ? ', where it has no children: it can sink no further.' : ' and checks its new children.'}`,
        9,
      );
      firstEver = false;
      i = c;
    }
    R.m.sink = -1;
  }
  R.m.heap = n;
  R.m.range = [0, n];
  for (let i = (n >> 1) - 1; i >= 0; i--) sink(i, n);
  for (let end = n - 1; end >= 1; end--) {
    const top = a[0];
    R.swap(0, end);
    R.m.heap = end;
    R.m.range = [0, end];
    R.m.final[end] = true;
    if (end === 1) R.allFinal();
    R.move(
      `Swap the top, ${L(top)}, to slot ${end}.`,
      end === n - 1
        ? `The row is a max-heap now, so its biggest key is on top. It goes to the end, its final place, and the heap shrinks by one. ${L(a[0])} takes the top and sinks.`
        : end === 1
          ? `The last two keys are in place.`
          : `${L(top)} is the biggest left, so it belongs at the end. ${L(a[0])} takes the top and sinks.`,
      3,
    );
    sink(0, end);
  }
  R.m.heap = 0;
  R.m.range = null;
  R.allFinal();
}

const ALGOS: Readonly<Record<SortKey, (R: Recorder) => void>> = { bubble, insertion, selection, merge, quick, heap };

/** The last word on a run: what it cost, and for twins, whether they kept their order. */
function doneWords(key: SortKey, th: Threads, R: Recorder): { head: string; body: string } {
  const n = th.n,
    name = NAMES[key];
  const head = `Sorted: ${plural(R.comps, 'comparison')}, ${plural(R.writes, 'write')}.`;
  if (th.kind === 'twins') {
    const out = R.a.map(id => th.list[id]);
    const bad = out.findIndex((t, s) => s > 0 && t.v === out[s - 1].v && out[s - 1].twin > t.twin);
    if (STABLE[key])
      return {
        head,
        body: `Every pair of twins came out in the order it went in, with no knots: ${name.toLowerCase()} is stable.`,
      };
    if (bad > 0)
      return {
        head,
        body: `${plural(R.knots, 'knot')}, and ${out[bad - 1].label} now comes before ${out[bad].label}: ${name.toLowerCase()} is not stable.`,
      };
    return {
      head,
      body: R.knots
        ? `Twins crossed ${R.knots === 1 ? 'once' : `${R.knots} times`} but came out in order on this input. On others they would not: ${name.toLowerCase()} is not stable.`
        : `No twins crossed this time, but ${name.toLowerCase()} makes no promise: on another input they could.`,
    };
  }
  const all = pairs(n),
    fast = Math.round(nlogn(n));
  const side =
    R.comps < 2 * n
      ? 'Barely more than one comparison per key: the input was nearly in order already, and this sort noticed.'
      : R.comps >= 0.6 * all
        ? 'This run was on the O(n²) side: most pairs got compared.'
        : R.comps <= 1.25 * fast
          ? 'This run was on the O(n log n) side.'
          : 'Somewhere between the two.';
  return { head, body: `Comparing every pair of ${n} keys takes ${all}; n log₂ n is about ${fast}. ${side}` };
}

/** Sort the threads and record every step. */
export function runSort(key: SortKey, th: Threads): Run {
  const R = new Recorder(th, NAMES[key], false);
  ALGOS[key](R);
  R.m = { ...freshMarks(th.n), final: new Array<boolean>(th.n).fill(true) };
  const w = doneWords(key, th, R);
  R.done(w.head, w.body);
  R.finish();
  return {
    key,
    threads: th,
    events: R.events,
    states: R.states,
    comps: R.comps,
    writes: R.writes,
    knots: R.knots,
  };
}

/** Just the counts, and the sorted values, without recording anything. */
export function countSort(key: SortKey, th: Threads): { comps: number; writes: number; out: number[] } {
  const R = new Recorder(th, NAMES[key], true);
  ALGOS[key](R);
  return { comps: R.comps, writes: R.writes, out: R.a.map(id => R.V[id]) };
}

/** The most comparisons any of these sorts can make on n keys: every pair, once. */
export const pairs = (n: number): number => (n * (n - 1)) / 2;
/** n log₂ n, the shape of the fast sorts' work. */
export const nlogn = (n: number): number => (n > 1 ? n * Math.log2(n) : 0);
