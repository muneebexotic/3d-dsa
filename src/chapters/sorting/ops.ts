// The recordings the page plays: one sort weaving the threads step by step, or all
// six weaving them at once, then standing their cloths up side by side.

import type { LoomState, Recording, Step } from './diagram';
import { NAMES, SHORT, SORTS, pairs, runSort, type Run, type SortKey } from './sorts';
import { INPUT_NAMES, type InputKind, type Threads } from './threads';

const rel = (d: number): string => (d < 0 ? '<' : d > 0 ? '>' : '=');

/** How the input reads in a sentence. */
export function inputWords(th: Threads): string {
  const kinds: Readonly<Record<InputKind, string>> = {
    random: 'shuffled',
    nearly: 'nearly sorted',
    reversed: 'reversed',
    twins: 'twinned',
  };
  return `${th.n} ${kinds[th.kind]} threads`;
}

const INTRO: Readonly<Record<SortKey, { head: string; body: string }>> = {
  bubble: {
    head: 'Bubble sort: swap neighbours until nothing moves.',
    body: 'Walk the row again and again, swapping any two neighbours that are out of order. The biggest key bubbles to the end each pass.',
  },
  insertion: {
    head: 'Insertion sort: slide each key into place.',
    body: 'Like sorting a hand of cards: take the next key and slide it left past every bigger one.',
  },
  selection: {
    head: 'Selection sort: find the smallest, put it next.',
    body: 'Each pass scans everything left for the smallest key, then makes a single swap.',
  },
  merge: {
    head: 'Merge sort: split in half, then merge the halves.',
    body: 'Two sorted runs merge by comparing only their front keys, so each merge is one walk along the row.',
  },
  quick: {
    head: 'Quick sort: split round a pivot.',
    body: 'Keys smaller than the pivot go left and the rest go right; the pivot lands in its final place between them. Then each side is sorted the same way.',
  },
  heap: {
    head: 'Heap sort: a max-heap hands out the biggest.',
    body: 'Heapify the row, then again and again swap the top to the end and let the new top sink.',
  },
};

const startState = (run: Run): LoomState => ({
  rows: 0,
  arr: run.threads.list.map(t => t.id),
  marks: null,
  glow: [],
  done: false,
});

/** One sort, step by step. */
export function solo(key: SortKey, th: Threads): Recording {
  const run = runSort(key, th);
  const L = (id: number) => th.list[id].label,
    V = (id: number) => th.list[id].v;
  const op = `${NAMES[key]} · ${INPUT_NAMES[th.kind]} ${th.n}`;
  let before = th.list.map(t => t.id);
  const steps: Step[] = run.events.map(ev => {
    let glow: number[] = [],
      callout: string | null = null;
    if (ev.kind === 'pick') {
      const x = before[ev.i],
        y = before[ev.j];
      glow = [x, y];
      // say it the way the headline does, when the headline leads with the comparison
      const said = /^(\S+ [<>=] \S+):/.exec(ev.head);
      callout = said ? said[1] : `${L(x)} ${rel(V(x) - V(y))} ${L(y)}`;
    }
    before = ev.arr;
    return {
      kind: ev.kind,
      op,
      head: ev.head,
      body: ev.body,
      code: key,
      line: ev.line,
      callout,
      looms: [{ rows: ev.comps, arr: ev.arr, marks: ev.marks, glow, done: ev.kind === 'done' }],
      stand: 0,
      ev,
    };
  });
  return {
    title: NAMES[key],
    mode: 'solo',
    threads: th,
    looms: [{ key, run }],
    start: [startState(run)],
    steps,
    intro: {
      head: INTRO[key].head,
      body: `${INTRO[key].body} Every comparison weaves one row of cloth behind the ${inputWords(th)}.`,
    },
  };
}

/* ---------------- all six ---------------- */

const joinNames = (keys: readonly SortKey[]): string => {
  const names = keys.map(k => SHORT[k].toLowerCase());
  if (names.length === 1) return NAMES[keys[0]];
  const s = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} sort`;
  return s[0].toUpperCase() + s.slice(1);
};

/** Why a sort finished when it did, on this input. */
function insight(key: SortKey, run: Run): string {
  const th = run.threads,
    n = th.n,
    kind = th.kind;
  switch (key) {
    case 'merge':
      return 'Merge sort never needs more than about n log₂ n comparisons, whatever the input.';
    case 'quick':
      return kind === 'random' || kind === 'twins'
        ? 'Its pivots split the row roughly in half, so it does about as well as merge sort, in place.'
        : 'Splitting round the last key, it kept making lopsided splits on this input.';
    case 'insertion':
      return kind === 'nearly'
        ? 'On nearly sorted input each key only slides a place or two, so insertion sort wins.'
        : kind === 'reversed'
          ? 'Reversed input is its worst case: every key slides all the way to the front.'
          : 'On shuffled input each key slides about halfway back: about n² / 4 comparisons.';
    case 'heap':
      return 'Heap sort is O(n log n) too, but a key sinking through the heap costs two comparisons a level.';
    case 'bubble':
      return run.comps < pairs(n)
        ? 'Bubble sort only compares neighbours, so keys crawl one place at a time; it stopped early when a pass made no swaps.'
        : 'Bubble sort only compares neighbours, so keys crawl one place at a time.';
    case 'selection':
      return `Selection sort compares every pair on any input: n(n − 1) / 2 = ${pairs(n)}.`;
  }
}

function moral(th: Threads): string {
  switch (th.kind) {
    case 'nearly':
      return 'On nearly sorted keys insertion sort barely moves, while quick sort, always splitting round the last key, keeps making lopsided splits.';
    case 'reversed':
      return 'Reversed input is the worst case for bubble, insertion and this quick sort: every pair gets compared. Merge and heap sort do not care.';
    case 'twins':
      return 'The red knots are twins that crossed on the way: selection, quick and heap sort are not stable. The other three never tie one.';
    default:
      return `On shuffled keys the O(n log n) sorts pull away, and the gap widens as n grows: try ${th.n < 24 ? 24 : 16} threads.`;
  }
}

/** All six sorts weave the same threads, one comparison per row, then stand up side by side. */
export function race(th: Threads): Recording {
  const runs = SORTS.map(k => runSort(k, th));
  const C = runs.map(r => r.comps);
  const top = Math.max(...C);
  const chunk = Math.max(3, Math.ceil(top / 11));
  // pause wherever a loom finishes, and every so often in between
  const marks = new Set<number>(C);
  for (let t = chunk; t < top; t += chunk) marks.add(t);
  const times = [...marks]
    .sort((a, b) => a - b)
    .filter((t, i, all) => C.includes(t) || all[i + 1] === undefined || all[i + 1] - t >= chunk / 3);
  const state = (T: number): LoomState[] =>
    runs.map(r => ({
      rows: Math.min(r.comps, T),
      arr: r.states[Math.min(r.comps, T)],
      marks: null,
      glow: [],
      done: T >= r.comps,
    }));
  const op = `All six · ${INPUT_NAMES[th.kind]} ${th.n}`;
  const steps: Step[] = [];
  let prev = 0;
  times.forEach((T, k) => {
    const fin = SORTS.filter((_, j) => C[j] > prev && C[j] <= T);
    const done = SORTS.filter((_, j) => C[j] <= T);
    const left = SORTS.filter((_, j) => C[j] > T);
    const leftText = left.length ? `Still weaving: ${left.map(s => SHORT[s].toLowerCase()).join(', ')}.` : '';
    let head: string, body: string;
    if (fin.length) {
      const counts = fin.map(s => C[SORTS.indexOf(s)]);
      const at = counts.every(c => c === counts[0]) ? `${counts[0]}` : counts.join(' and ');
      head = left.length
        ? `${joinNames(fin)} ${fin.length > 1 ? 'are' : 'is'} done: ${at} comparisons.`
        : `${joinNames(fin)} ${fin.length > 1 ? 'finish' : 'finishes'} last, at ${at}.`;
      body = `${insight(fin[0], runs[SORTS.indexOf(fin[0])])} ${leftText}`.trim();
    } else if (k === 0) {
      head = `${T} comparisons in: all six still weaving.`;
      body =
        'Every sort started from the same row of threads, and every comparison weaves one row, so the cloths grow at the same pace. The first to finish did the least work.';
    } else {
      head = `${T} comparisons in.`;
      body = `Done: ${done.map(s => `${SHORT[s].toLowerCase()} (${C[SORTS.indexOf(s)]})`).join(', ')}. ${leftText}`;
    }
    steps.push({
      kind: 'weave',
      op,
      head,
      body,
      code: null,
      line: -1,
      callout: null,
      looms: state(T),
      stand: 0,
      ev: null,
    });
    prev = T;
  });
  const lo = Math.min(...C),
    fastest = SORTS.filter((_, j) => C[j] === lo),
    slowest = SORTS.filter((_, j) => C[j] === top);
  const ratio = lo > 0 ? top / lo : 1;
  steps.push({
    kind: 'stand',
    op,
    head: 'Stand the cloths up: their height is their work.',
    body: `${joinNames(slowest)} took ${
      ratio >= 1.95
        ? `${ratio.toFixed(1)}× as many comparisons as`
        : `${Math.round((ratio - 1) * 100)}% more comparisons than`
    } ${joinNames(fastest).toLowerCase()}, on the same ${th.n} threads. ${moral(th)}`,
    code: null,
    line: -1,
    callout: null,
    looms: state(top),
    stand: 1,
    ev: null,
  });
  const stableNote = th.kind === 'twins' ? ' Twins share a height; a stable sort never lets them cross.' : '';
  return {
    title: 'All six sorts',
    mode: 'race',
    threads: th,
    looms: SORTS.map((key, j) => ({ key, run: runs[j] })),
    start: runs.map(startState),
    steps,
    intro: {
      head: `Six sorts weave the same ${th.n} threads.`,
      body: `Each thread is a key: its height and its shade are its value. Every comparison weaves one row, so a longer cloth means more work.${stableNote}`,
    },
  };
}
