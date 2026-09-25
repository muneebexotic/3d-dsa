// The operations, recorded step by step with their narration: push (sift up), pop
// (the last key to the top, then sift down), heapify (every parent sifted down,
// last first), flipping between a min- and a max-heap, draining the heap in order,
// and Graph Net's Dijkstra run replayed on the heap as its priority queue.

import { plural } from '../../core/math';
import type { CodeKey } from './code';
import { cloneDiagram, type Diagram, type OpKey, type Recording, type View } from './diagram';
import { KNOTS, START, TARGET, queueEvents } from './dijkstra';
import type { Heap } from './heap';
import {
  MAX_SIZE,
  heapifyBound,
  leftOf,
  parentOf,
  pushBound,
  pushOneByOne,
  rightOf,
  rowOf,
  rowsFor,
  type Item,
  type Order,
} from './heap';
import { Recorder } from './record';

/** The heap on show, and how it is seen. */
export interface World {
  H: Heap;
  view: View;
}

interface Words {
  better: string;
  worse: string;
  /** "too big for the top" */
  too: string;
  best: string;
  /** "is no bigger than": the relation a parent must keep with its children. */
  le: string;
  lt: string;
  top: string;
}

export function words(o: Order): Words {
  return o === 'min'
    ? { better: 'smaller', worse: 'bigger', too: 'big', best: 'smallest', le: '≤', lt: '<', top: 'min' }
    : { better: 'larger', worse: 'smaller', too: 'small', best: 'largest', le: '≥', lt: '>', top: 'max' };
}

const name = (it: Item): string => (it.tag ? `${it.tag}·${it.key}` : String(it.key));
const upSum = (i: number): string => `(${i} − 1) / 2 = ${parentOf(i)}`;
const downSum = (i: number, n: number): string =>
  rightOf(i) < n ? `2·${i} + 1 = ${leftOf(i)}, 2·${i} + 2 = ${rightOf(i)}` : `2·${i} + 1 = ${leftOf(i)}`;
const sinks = (swaps: number): string => (swaps ? `sinks ${plural(swaps, 'row')}` : 'stays there');
const tall = (H: Heap): string => `${plural(H.height, 'swap')} for ${plural(H.n, 'key')}`;

interface Session {
  W: World;
  rec: Recorder;
  start: Diagram;
  ledger: number;
}

function begin(W: World, op: string, cx: OpKey, code: CodeKey): Session {
  const rec = new Recorder(W.H, W.view, op, cx, code);
  return { W, rec, start: cloneDiagram(rec.diagram()), ledger: W.H.ledger.length };
}

function finish(S: Session, title = S.rec.op): Recording {
  const steps = S.rec.steps;
  // the last step shows every ledger entry the operation wrote
  if (steps.length) steps[steps.length - 1].ledger = S.W.H.ledger.length;
  return { title, steps, start: S.start, ledger: S.ledger };
}

/* ---------------- sift up ---------------- */

/** Let the key in slot i climb while it beats its parent. Returns the swaps. */
function siftUp(rec: Recorder, i: number): number {
  const H = rec.H,
    w = words(H.order),
    it = H.a[i],
    k = name(it);
  let swaps = 0;
  rec.tones.set(it.id, 'cur');
  while (i > 0) {
    const p = parentOf(i),
      par = H.a[p],
      pk = name(par);
    rec.cost.compares++;
    rec.tones.set(par.id, 'look');
    rec.hot = [i];
    const callout = { text: upSum(i), tone: 'cobalt' as const };
    if (!H.above(it, par)) {
      rec.push(
        'stay',
        `${k} stays in slot ${i}.`,
        `Its parent is in slot (${i} − 1) / 2 = ${p}: ${pk}, and ${pk} ${w.le} ${k}, so this wire is in order. ` +
          (swaps
            ? `Every wire is in order again after ${plural(swaps, 'swap')}. A push never climbs more than the tree is tall, ${tall(H)}, so it is O(log n).`
            : 'Nothing had to move.'),
        4,
        { focus: it.id, from: i, look: [p], callout },
      );
      rec.tones.delete(par.id);
      rec.tones.delete(it.id);
      return swaps;
    }
    rec.push(
      'up',
      `Compare ${k} with its parent, ${pk}.`,
      swaps
        ? `Slot ${i}’s parent is slot ${p}. ${k} ${w.lt} ${pk}: out of order again.`
        : `Its parent is in slot (${i} − 1) / 2 = ${p}, rounded down. ${k} is ${w.better} than ${pk}, so this wire is out of order: a parent must never be ${w.worse} than its children.`,
      4,
      { focus: it.id, from: i, look: [p], callout },
    );
    H.swap(i, p);
    rec.cost.swaps++;
    swaps++;
    rec.hot = [i];
    rec.push(
      'swap',
      `Swap: ${k} moves up to slot ${p}.`,
      swaps === 1
        ? `${pk} drops into slot ${i}. It was already no ${w.worse} than everything below it, so it is fine there. Only the wire above ${k} can still be out of order.`
        : `${pk} drops into slot ${i}. ${k} has climbed ${plural(swaps, 'row')}.`,
      5,
      { focus: it.id, from: p, look: [i] },
    );
    rec.tones.delete(par.id);
    i = p;
  }
  rec.push(
    'stay',
    `${k} reaches the top.`,
    `It is the ${w.best} key in the heap now, in slot 0, where a pop will find it. ` +
      (swaps
        ? `It climbed ${plural(swaps, 'row')}: a push never climbs more than the tree is tall, ${tall(H)}, so it is O(log n).`
        : 'It is the only key.'),
    2,
    { focus: it.id, from: 0 },
  );
  rec.tones.delete(it.id);
  return swaps;
}

/* ---------------- sift down ---------------- */

interface DownLines {
  cmp: number;
  swap: number;
  brk: number;
  loop: number;
}
const POP_LINES: DownLines = { cmp: 5, swap: 8, brk: 7, loop: 3 };
const BUILD_LINES: DownLines = { cmp: 4, swap: 6, brk: 5, loop: 3 };

/** Words for the first check of a sift-down, when the operation has something to say about it. */
type Opening = (sinks: boolean, kids: string) => { head: string; body: string };

/** Let the key in slot i sink while a child beats it. Returns the swaps. */
function siftDown(rec: Recorder, i: number, ctx: 'pop' | 'build', open?: Opening): number {
  const H = rec.H,
    w = words(H.order),
    it = H.a[i],
    k = name(it);
  const L = ctx === 'pop' ? POP_LINES : BUILD_LINES;
  const from = i;
  let swaps = 0;
  rec.tones.set(it.id, 'cur');
  const settled = () =>
    ctx === 'pop'
      ? ` It sank ${plural(swaps, 'row')}. A pop never sinks further than the tree is tall, ${tall(H)}, so it is O(log n).`
      : ` The subtree under slot ${from} is a heap now.`;
  for (;;) {
    const l = leftOf(i),
      r = rightOf(i);
    if (l >= H.n) {
      rec.push(
        'stay',
        `${k} reaches the bottom row.`,
        `Slot ${i} has no children: 2·${i} + 1 = ${l} is past the end of the array.${settled()}`,
        L.loop,
        { focus: it.id, from: i },
      );
      break;
    }
    const kids = r < H.n ? [l, r] : [l];
    const b = H.betterChild(i),
      bk = name(H.a[b]);
    const names = kids.map(c => name(H.a[c])).join(' and ');
    rec.cost.compares += kids.length;
    for (const c of kids) rec.tones.set(H.a[c].id, 'look');
    rec.hot = kids;
    const callout = { text: downSum(i, H.n), tone: 'cobalt' as const };
    const sinks = H.above(H.a[b], it);
    const o = swaps === 0 && open ? open(sinks, names) : null;
    if (!sinks) {
      rec.push(
        'stay',
        o?.head ?? `${k} stays in slot ${i}.`,
        o?.body ??
          `${kids.length > 1 ? `Both children, ${names}, are` : `Its only child, ${names}, is`} no ${w.better} than ${k}, so every wire under it is in order.${swaps ? settled() : ''}`,
        L.brk,
        { focus: it.id, from: i, look: kids, callout },
      );
      for (const c of kids) rec.tones.delete(H.a[c].id);
      break;
    }
    rec.push(
      'down',
      o?.head ?? `Compare ${k} with ${kids.length > 1 ? `its children, ${names}` : `its only child, ${names}`}.`,
      o?.body ??
        (swaps
          ? `Slot ${i}’s children are at ${downSum(i, H.n)}. ${bk} is ${w.better} than ${k}: out of order again.`
          : kids.length > 1
            ? `Slot ${i}’s children are at 2·${i} + 1 = ${l} and 2·${i} + 2 = ${r}. The ${w.better} child, ${bk}, is the one that has to rise: it is the only one of the three that can sit above the other two.`
            : `Slot ${i}’s only child is at 2·${i} + 1 = ${l}: ${bk}, which is ${w.better} than ${k}.`),
      L.cmp,
      { focus: it.id, from: i, look: kids, callout },
    );
    for (const c of kids) if (c !== b) rec.tones.delete(H.a[c].id);
    H.swap(i, b);
    rec.cost.swaps++;
    swaps++;
    rec.hot = [b];
    rec.push(
      'swap',
      `Swap: ${bk} rises, ${k} sinks to slot ${b}.`,
      swaps === 1
        ? `${bk} is ${w.better} than ${k}${kids.length > 1 ? ' and than its sibling' : ''}, so slot ${i} is in order now. Only the wires under ${k} can still be broken.`
        : `${bk} moves up into slot ${i}.`,
      L.swap,
      { focus: it.id, from: b, look: [i] },
    );
    rec.tones.delete(H.a[i].id);
    i = b;
  }
  rec.tones.delete(it.id);
  return swaps;
}

/* ---------------- push and pop, step by step ---------------- */

export function push(W: World, key: number): Recording {
  const S = begin(W, `Push ${key}`, 'push', 'push'),
    { rec } = S,
    H = W.H;
  if (H.full) {
    rec.push(
      'full',
      `The pyramid is full: ${MAX_SIZE} keys.`,
      'Five full rows is as big as this one gets, so pop a key first. A real heap just grows its array, the way a dynamic array doubles in No. 3.',
      0,
      { focus: H.a[H.n - 1]?.id },
    );
    return finish(S);
  }
  const it = H.make(key);
  H.a.push(it);
  const i = H.n - 1,
    row = rowOf(i);
  rec.tones.set(it.id, 'new');
  rec.push(
    'append',
    `Put ${key} in the next free slot: ${i}.`,
    i === 0
      ? `The heap is empty, so ${key} goes in slot 0. It is the top.`
      : i > 0 && row > rowOf(i - 1)
        ? `Row ${row - 1} is full, so ${key} starts row ${row}, at its left end. Each row holds twice as many keys as the one above, so ${plural(H.n, 'key')} fill only ${plural(rowsFor(H.n), 'row')}.`
        : `A heap fills its rows left to right, with no gaps, so a new key always goes at the end of the array: the first free spot on the bottom row. Nothing else has to move.`,
    0,
    { focus: it.id, from: i },
  );
  const swaps = siftUp(rec, i);
  H.ledger.push({ kind: 'push', key, swaps, compares: rec.cost.compares, bound: H.height, n: H.n });
  return finish(S);
}

export function pop(W: World): Recording {
  const H = W.H,
    w = words(H.order);
  const S = begin(W, `Pop the ${w.top}`, 'pop', 'pop'),
    { rec } = S;
  if (H.empty) {
    rec.push('empty', 'The heap is empty.', 'There is no top to take. Push a key first.', 0);
    return finish(S);
  }
  const top = H.a[0],
    first = H.out.length === 0;
  H.out.push(top);
  const alone = H.n === 1;
  if (alone) H.a.pop();
  else rec.gone.add(top.id);
  rec.push(
    'take',
    `Take the top: ${name(top)}, the ${w.best} key.`,
    `The ${w.best} key always sits in slot 0, so a pop never has to search. ` +
      (alone
        ? 'It was the only key, so the heap is empty now.'
        : 'Taking it leaves a hole at the top, and a heap is not allowed gaps.') +
      (first ? ' It goes on the out tray: watch the order the keys come out in.' : ''),
    0,
    { focus: top.id, from: 0 },
  );
  if (alone) {
    H.ledger.push({ kind: 'pop', key: top.key, tag: top.tag, swaps: 0, compares: 0, bound: 0, n: 0 });
    return finish(S);
  }
  const last = H.a.pop() as Item;
  H.a[0] = last;
  rec.gone.delete(top.id);
  rec.tones.set(last.id, 'cur');
  const broken = [leftOf(0), rightOf(0)].some(c => c < H.n && H.above(H.a[c], last));
  rec.push(
    'last',
    `Move the last key, ${name(last)}, up to the top.`,
    `The only key that can leave without opening a gap is the one at the end of the array, slot ${H.n}. It fills the hole, and the array is one shorter. ` +
      (H.n === 1
        ? 'It is the only key left.'
        : broken
          ? `${name(last)} is too ${w.too} for the top: the red wires show where the order is broken.`
          : 'This time it happens to be in order already.'),
    1,
    { focus: last.id, from: 0 },
  );
  const swaps = H.n > 1 ? siftDown(rec, 0, 'pop') : 0;
  rec.tones.clear();
  H.ledger.push({
    kind: 'pop',
    key: top.key,
    tag: top.tag,
    swaps,
    compares: rec.cost.compares,
    bound: H.height,
    n: H.n,
  });
  return finish(S);
}

/* ---------------- heapify ---------------- */

/** The bottom-up build on whatever the array holds now. */
function build(S: Session): void {
  const { rec } = S,
    H = rec.H,
    w = words(H.order),
    n = H.n;
  const lastParent = (n >> 1) - 1;
  if (n < 2) {
    rec.push('done', 'A single key is already a heap.', 'There is nothing to repair.', 1);
    return;
  }
  const c0 = { ...rec.cost },
    given = H.a.map(it => it.key);
  rec.lit = Array.from({ length: n - (n >> 1) }, (_, j) => (n >> 1) + j);
  rec.push(
    'leaves',
    `${n - (n >> 1)} of the ${n} keys are leaves.`,
    `Slots ${n >> 1} to ${n - 1} have no children, and a key on its own is already a heap. About half of any heap is leaves, so heapify skips half the keys before it starts. It works backwards from the last parent, slot ${lastParent}: the parent of slot ${n - 1}.`,
    0,
  );
  rec.lit = [];
  for (let i = lastParent; i >= 0; i--) {
    const k = name(H.a[i]);
    const open: Opening = (sinks, kids) => {
      const where = i === lastParent ? `Slot ${i}, the last parent` : i === 0 ? 'Slot 0, the top' : `Slot ${i}`;
      const why =
        i === lastParent
          ? 'Why backwards? Sinking a key only works if both subtrees below it are heaps already. Going from the last parent back to the top guarantees they are: every subtree is repaired before its parent.'
          : `Both subtrees under slot ${i} are heaps already, so sinking ${k} as far as it needs to go makes the whole subtree a heap.`;
      return sinks
        ? { head: `${where}: compare ${k} with ${kids}.`, body: why }
        : {
            head: `${where}: ${k} is already in order.`,
            body: `${k} ${w.le} ${kids}, so the subtree under slot ${i} is a heap as it stands.${i === lastParent ? ' ' + why : ''}`,
          };
    };
    siftDown(rec, i, 'build', open);
  }
  rec.tones.clear();
  const swaps = rec.cost.swaps - c0.swaps,
    bound = heapifyBound(n);
  const one = pushOneByOne(given, H.order);
  H.ledger.push({ kind: 'build', key: n, swaps, compares: rec.cost.compares - c0.compares, bound, n });
  rec.push(
    'done',
    `A heap, after ${plural(swaps, 'swap')}.`,
    `No heapify of ${n} keys can need more than ${bound}: each key sinks at most its height, and most keys live near the bottom, where there is no room to sink. Pushing keys one at a time can take up to ${pushBound(n)} (${one} for these), because then most keys start at the bottom and may climb all the way. Heapify is O(n); n pushes are O(n log n).`,
    1,
  );
}

/** Replace the heap with these keys, in this order, and heapify them in place. */
export function heapify(W: World, keys: readonly number[]): Recording {
  const S = begin(W, `Heapify ${keys.length} keys`, 'build', 'heapify'),
    H = W.H,
    w = words(H.order);
  H.a = keys.map(k => H.make(k));
  H.out = [];
  const bad = H.a.filter((it, i) => i > 0 && H.above(it, H.a[parentOf(i)])).length;
  S.rec.push(
    'scatter',
    `${keys.length} keys, in the order they came.`,
    `Read as a tree, this array is not a heap: ${bad === 1 ? 'the red wire joins a parent to a' : `each of the ${bad} red wires joins a parent to a`} ${w.better} child. Pushing the keys one at a time would work. Heapify repairs them all in place, and faster.`,
    0,
  );
  build(S);
  return finish(S);
}

/** Switch between a min- and a max-heap: same array, new rule, heapified in place. */
export function flip(W: World, order: Order): Recording {
  const w = words(order);
  const S = begin(W, order === 'min' ? 'Make it a min-heap' : 'Make it a max-heap', 'build', 'heapify'),
    H = W.H;
  H.order = order;
  H.out = [];
  const bad = H.a.filter((it, i) => i > 0 && H.above(it, H.a[parentOf(i)])).length;
  S.rec.push(
    'scatter',
    `Flip the rule: the ${w.best} key goes on top.`,
    `Same array, same keys, but now every parent must be no ${w.worse} than its children. ${bad ? `${plural(bad, 'wire')} ${bad === 1 ? 'breaks' : 'break'} under the new rule.` : 'Nothing breaks.'} No need to start again: heapify repairs the array where it is.`,
    0,
  );
  build(S);
  return finish(S);
}

/* ---------------- batches: one step per operation ---------------- */

interface Moved {
  it: Item;
  path: number[];
  swaps: number;
  compares: number;
}

/** A push with no recording: the key and the slots it climbed through. */
function quickPush(H: Heap, it: Item): Moved {
  H.a.push(it);
  let i = H.n - 1,
    swaps = 0,
    compares = 0;
  const path = [i];
  while (i > 0) {
    const p = parentOf(i);
    compares++;
    if (!H.above(H.a[i], H.a[p])) break;
    H.swap(i, p);
    swaps++;
    i = p;
    path.push(i);
  }
  return { it, path, swaps, compares };
}

/** A pop with no recording: the top, and the last key with the slots it sank through. */
function quickPop(H: Heap): { top: Item; last: Moved | null } {
  const top = H.a[0],
    last = H.a.pop() as Item;
  H.out.push(top);
  if (last === top) return { top, last: null };
  H.a[0] = last;
  let i = 0,
    swaps = 0,
    compares = 0;
  const path = [0];
  for (;;) {
    const b = H.betterChild(i);
    if (b < 0) break;
    compares += rightOf(i) < H.n ? 2 : 1;
    if (!H.above(H.a[b], H.a[i])) break;
    H.swap(i, b);
    swaps++;
    i = b;
    path.push(i);
  }
  return { top, last: { it: last, path, swaps, compares } };
}

/** Give a ticket a better key where it sits, and let it climb. */
function quickLower(H: Heap, id: string, key: number): Moved & { was: number } {
  let i = H.indexOf(id);
  const was = H.a[i].key;
  H.a[i] = { ...H.a[i], key };
  const path = [i];
  let swaps = 0,
    compares = 0;
  while (i > 0) {
    const p = parentOf(i);
    compares++;
    if (!H.above(H.a[i], H.a[p])) break;
    H.swap(i, p);
    swaps++;
    i = p;
    path.push(i);
  }
  return { it: H.a[i], path, swaps, compares, was };
}

const climb = (m: Moved): string =>
  m.swaps ? `up ${plural(m.swaps, 'row')} to slot ${m.path[m.path.length - 1]}` : 'and stays';

export function pushMany(W: World, keys: readonly number[]): Recording {
  const S = begin(W, `Push ${keys.join(', ')}`, 'push', 'push'),
    { rec } = S,
    H = W.H;
  for (const key of keys) {
    if (H.full) {
      rec.push('full', `The pyramid is full: ${MAX_SIZE} keys.`, 'Pop a key to make room.', 0);
      break;
    }
    const m = quickPush(H, H.make(key));
    rec.cost.swaps += m.swaps;
    rec.cost.compares += m.compares;
    H.ledger.push({ kind: 'push', key, swaps: m.swaps, compares: m.compares, bound: H.height, n: H.n });
    rec.push(
      'push',
      `Push ${key}: in at slot ${m.path[0]}, ${climb(m)}.`,
      m.swaps
        ? `Each step up swaps it with a ${words(H.order).worse} parent. ${plural(m.swaps, 'swap')}, out of at most ${H.height}.`
        : `Its parent is already no ${words(H.order).worse}, so no swaps at all.`,
      m.swaps ? 5 : 4,
      { focus: m.it.id, mover: m.it.id, path: m.path },
    );
  }
  return finish(S);
}

/** Pop every key: they come out in order, which is heap sort. */
export function drain(W: World): Recording {
  const H = W.H,
    w = words(H.order);
  const S = begin(W, 'Pop them all', 'pop', 'pop'),
    { rec } = S;
  if (H.empty) {
    rec.push('empty', 'The heap is empty.', 'There is nothing to pop. Push some keys first.', 0);
    return finish(S);
  }
  const before = H.out.length;
  while (H.n) {
    const { top, last } = quickPop(H);
    if (last) {
      rec.cost.swaps += last.swaps;
      rec.cost.compares += last.compares;
    }
    H.ledger.push({
      kind: 'pop',
      key: top.key,
      tag: top.tag,
      swaps: last?.swaps ?? 0,
      compares: last?.compares ?? 0,
      bound: H.height,
      n: H.n,
    });
    rec.push(
      'pop',
      `Out comes ${name(top)}.`,
      last
        ? `${name(last.it)} moves up from the end and ${sinks(last.swaps)}. ${plural(H.n, 'key')} left.`
        : 'That was the last key.',
      last ? 8 : 0,
      { focus: top.id, top: top.id, mover: last?.it.id ?? null, path: last?.path ?? null },
    );
  }
  const got = H.out.slice(before).map(name);
  rec.push(
    'done',
    `Out in order: ${got.join(' ')}.`,
    `Taking the top again and again hands the keys back ${w.best} first. That is heap sort: n pops at O(log n) each, O(n log n) in all, and a real one needs no extra array: each key taken off the top goes into the slot the heap just gave up. More in No. 6.`,
    10,
  );
  return finish(S);
}

/* ---------------- views ---------------- */

/** Fold the array up into a tree, or unfold the tree back into a row. */
export function setView(W: World, v: View): Recording {
  const S = begin(W, v === 'tree' ? 'Fold into a tree' : 'Unfold into the array', 'peek', 'view'),
    { rec } = S;
  W.view = v;
  rec.view = v;
  rec.push(
    'fold',
    v === 'tree' ? 'Fold the array into rows: 1, 2, 4, 8.' : 'Unfold the tree back into one row.',
    v === 'tree'
      ? 'Slot 0 goes on top, slots 1 and 2 under it, then 3 to 6, then 7 to 14. Each arc becomes a branch of the tree. Nothing moves in memory: the tree is only a way of reading the array.'
      : 'Nothing moves in memory: this row is all there ever was. Every arc joins slot i to its children in slots 2i + 1 and 2i + 2, and every child to its parent in slot (i − 1) / 2.',
    v === 'tree' ? 1 : 2,
  );
  return finish(S);
}

/** The opening: the array alone, its arcs drawn in, then folded into the pyramid. */
export function opening(W: World): Recording {
  W.view = 'array';
  const H = W.H,
    w = words(H.order);
  const S = begin(W, 'Heap Pyramid', 'peek', 'view'),
    { rec } = S;
  S.start = cloneDiagram({ ...rec.diagram(), wires: false });
  rec.push(
    'arcs',
    `Cell i’s children are cells 2i + 1 and 2i + 2.`,
    'So cell 0’s children are 1 and 2, cell 1’s are 3 and 4, and cell 4’s are 9 and 10. Going back, every cell’s parent is (i − 1) / 2, rounded down. The arcs join each cell to its children. Nothing else is stored: that arithmetic is the whole structure.',
    2,
    { focus: H.a[0]?.id },
  );
  W.view = 'tree';
  rec.view = 'tree';
  rec.push(
    'fold',
    'Fold the row into rows of 1, 2, 4 and 8.',
    `The arcs become the branches of a tree, and one rule holds on every branch: no parent is ${w.worse} than its children. So the ${w.best} key, ${H.a[0] ? name(H.a[0]) : ''}, is always on top. The array stays on the plinth underneath: the tree is only a way of reading it.`,
    1,
    { focus: H.a[0]?.id },
  );
  return {
    ...finish(S),
    intro: {
      head: `${plural(H.n, 'key')} in one array.`,
      body: 'This row of cells is a heap. Watch the arithmetic that turns it into a tree.',
    },
  };
}

/* ---------------- Dijkstra ---------------- */

/** Graph Net's Textbook run, with the heap as its priority queue. */
export function dijkstra(W: World): Recording {
  const H = W.H;
  const S = begin(W, 'Dijkstra’s queue', 'push', 'dijkstra'),
    { rec } = S;
  const events = queueEvents();
  H.order = 'min';
  H.a = [];
  H.out = [];
  rec.net = {
    dist: Object.fromEntries(KNOTS.map(k => [k.label, Infinity])),
    settled: [],
    queued: [],
    cur: null,
    edge: null,
  };
  rec.push(
    'scatter',
    `Dijkstra from ${START} to ${TARGET}, on Graph Net’s Textbook graph.`,
    'Its priority queue is a min-heap of tickets: a knot and the cheapest distance to it found so far. The heap starts empty. Every ticket shows its distance, with its knot’s letter above it.',
    0,
  );
  let pushes = 0,
    pops = 0,
    lowers = 0;
  const id = (knot: string) => `t${knot}`;
  for (const { ev, net } of events) {
    rec.net = net;
    if (ev.kind === 'push') {
      pushes++;
      const m = quickPush(H, H.make(ev.d, ev.knot));
      rec.cost.swaps += m.swaps;
      rec.cost.compares += m.compares;
      H.ledger.push({
        kind: 'push',
        key: ev.d,
        tag: ev.knot,
        swaps: m.swaps,
        compares: m.compares,
        bound: H.height,
        n: H.n,
      });
      rec.cx = 'push';
      rec.code = 'dijkstra';
      rec.push(
        'push',
        ev.from == null
          ? `Push ${ev.knot}’s ticket: 0.`
          : `Relax ${ev.from} → ${ev.knot}: ${net.dist[ev.from]} + ${ev.w} = ${ev.d}. Push ${ev.knot} at ${ev.d}.`,
        ev.from == null
          ? `Every distance starts at ∞ except ${ev.knot}’s, which is 0. Its ticket is the only one, so it is the top.`
          : `${ev.knot} had no route yet, so this is its first ticket. ` +
              (m.path[0] === 0
                ? 'The heap is empty, so it goes in at slot 0: the top.'
                : `It goes in at the end of the heap, slot ${m.path[0]}, ${m.swaps ? `and climbs ${plural(m.swaps, 'row')} past dearer tickets.` : 'and stays: its parent is cheaper.'}`),
        ev.from == null ? 0 : 7,
        { focus: m.it.id, mover: m.it.id, path: m.path },
      );
    } else if (ev.kind === 'pop') {
      pops++;
      const { top, last } = quickPop(H);
      if (last) {
        rec.cost.swaps += last.swaps;
        rec.cost.compares += last.compares;
      }
      H.ledger.push({
        kind: 'pop',
        key: top.key,
        tag: top.tag,
        swaps: last?.swaps ?? 0,
        compares: last?.compares ?? 0,
        bound: H.height,
        n: H.n,
      });
      rec.cx = 'pop';
      rec.push(
        'pop',
        `Pop the cheapest ticket: ${ev.knot} at ${ev.d}.`,
        `It was on top, so finding it cost nothing. No ticket left can beat ${ev.d}, and no string costs less than 0, so ${ev.knot} is settled. ` +
          (!last
            ? 'The heap is empty.'
            : H.n === 1
              ? `${last.it.tag}’s ticket is the only one left, so it moves up to the top.`
              : `${last.it.tag}’s ticket moves up from the end and ${sinks(last.swaps)}.`),
        2,
        { focus: top.id, top: top.id, mover: last?.it.id ?? null, path: last?.path ?? null },
      );
    } else if (ev.kind === 'lower') {
      lowers++;
      const at = H.indexOf(id(ev.knot));
      const m = quickLower(H, id(ev.knot), ev.d);
      rec.cost.swaps += m.swaps;
      rec.cost.compares += m.compares;
      H.ledger.push({
        kind: 'lower',
        key: ev.d,
        tag: ev.knot,
        swaps: m.swaps,
        compares: m.compares,
        bound: H.height,
        n: H.n,
      });
      rec.cx = 'lower';
      rec.push(
        'relower',
        `Relax ${ev.from} → ${ev.knot}: ${net.dist[ev.from]} + ${ev.w} = ${ev.d}, better than ${ev.old}.`,
        `${ev.knot}’s ticket is already in the heap, in slot ${at}. The queue keeps a note of where every knot’s ticket sits, so it finds it without searching and writes ${ev.d}. ${m.swaps ? `The cheaper ticket climbs ${plural(m.swaps, 'row')}.` : at === 0 ? 'It is already on top, so nothing moves.' : 'Its parent is still cheaper, so it stays.'} O(log n).`,
        7,
        { focus: m.it.id, mover: m.it.id, path: m.path, was: m.was },
      );
    } else {
      rec.cx = 'peek';
      rec.push(
        'keep',
        `Relax ${ev.from} → ${ev.knot}: ${net.dist[ev.from]} + ${ev.w} = ${ev.nd}.`,
        `${ev.nd === ev.cur ? 'That only ties' : 'That is worse than'} ${ev.knot}’s ${ev.cur}, so its ticket stays as it is. The heap is not touched.`,
        5,
        { focus: H.indexOf(id(ev.knot)) >= 0 ? id(ev.knot) : null },
      );
    }
  }
  const order = H.out.map(it => `${it.tag} ${it.key}`);
  rec.cx = 'pop';
  rec.push(
    'done',
    `${TARGET} is settled at ${H.out[H.out.length - 1]?.key ?? '∞'}: the cheapest route.`,
    `The heap handed out ${order.join(', ')}: in order of distance, exactly as in Graph Net. That took ${pushes} ${pushes === 1 ? 'push' : 'pushes'}, ${plural(pops, 'pop')} and ${plural(lowers, 'lower')}, each O(log n), which is why Dijkstra with a heap runs in O((V + E) log V).`,
    1,
  );
  return finish(S);
}
