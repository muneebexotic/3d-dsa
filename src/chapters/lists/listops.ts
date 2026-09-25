// Operations on singly and doubly linked lists. Each runs instantly on the list
// and records every pointer it follows or writes, with the line of code and a
// plain-English reason. The recordings are what the page plays.

import { plural } from '../../core/math';
import type { CodeKey } from './code';
import type { OpKey } from './complexity';
import type { Recording } from './diagram';
import { ChainRecorder, type LinkedList } from './linked';
import { addrText } from './memory';

export const MAX_NODES = 12;

type Kind = 'singly' | 'doubly';
const kindOf = (L: LinkedList): Kind => (L.doubly ? 'doubly' : 'singly');
const codeOf = (L: LinkedList, what: string) => `${kindOf(L)}.${what}` as CodeKey;

function begin(L: LinkedList, title: string, cx: OpKey, what: string): { rec: ChainRecorder; title: string } {
  return { rec: new ChainRecorder(L, title, cx, codeOf(L, what)), title };
}
function finish(rec: ChainRecorder, title: string, start: ReturnType<ChainRecorder['diagram']>): Recording {
  return { title, steps: rec.steps, start };
}
const v = (L: LinkedList, id: number | null): string => (id == null ? 'null' : String(L.node(id).val));
const writes = (n: number) => plural(n, 'pointer write');

/** One step explaining why nothing happens. */
function nothing(L: LinkedList, title: string, cx: OpKey, what: string, head: string, body: string): Recording {
  const { rec } = begin(L, title, cx, what);
  const start = rec.diagram();
  rec.push('empty', head, body, -1, { focus: L.head != null ? L.key(L.head) : null });
  return finish(rec, title, start);
}

/** Walk the hand `name` from the head (or the tail, going backwards) for `hops` pointers. */
function walk(
  rec: ChainRecorder,
  name: string,
  fromTail: boolean,
  hops: number,
  line: number,
  goal: string,
): number | null {
  const L = rec.L;
  let cur = fromTail ? L.tail : L.head;
  for (let k = 0; k < hops && cur != null; k++) {
    const role = fromTail ? 'prev' : 'next';
    const nxt = L.node(cur)[role];
    rec.trail.add(rec.wireId(cur, role));
    rec.cost.hops++;
    const from = cur;
    cur = nxt;
    rec.hand(name, cur);
    rec.push(
      'hop',
      `Follow ${v(L, from)}’s ${role} pointer to ${v(L, cur)}.`,
      `Hop ${k + 1} of ${hops}. A list has no index to jump to: the only way to reach a node is through the pointer of the one ${fromTail ? 'after' : 'before'} it${goal ? `. ${goal}` : '.'}`,
      line,
      {
        focus: cur != null ? L.key(cur) : null,
        hop: cur != null ? { from: L.key(from), to: L.key(cur) } : null,
        wire: rec.wireId(from, role),
      },
    );
  }
  return cur;
}

/* ---------------- insert ---------------- */

export function insertHead(L: LinkedList, val: number): Recording {
  const { rec, title } = begin(L, `Insert ${val} at the head`, 'insHead', 'insertHead');
  const start = rec.diagram();
  const old = L.head;
  const N = L.create(val),
    k = L.key(N.id);
  rec.slots.set(N.id, old != null ? (rec.slots.get(old) ?? 0) - 1 : 0);
  rec.tones.set(N.id, 'new');
  rec.hand('NODE', N.id);
  rec.push(
    'alloc',
    `A new node for ${val}, at ${addrText(N.addr)}.`,
    `The allocator hands out any free spot in memory. The node’s pointer${L.doubly ? 's start' : ' starts'} out as null.`,
    0,
    { focus: k, callout: { text: addrText(N.addr) } },
  );
  N.next = old;
  rec.hot.add(rec.wireId(N.id, 'next'));
  rec.cost.writes++;
  rec.push(
    'link',
    old == null ? `${val}.next stays null: the list was empty.` : `Point ${val} at the old head, ${v(L, old)}.`,
    old == null
      ? 'There is nothing after it yet.'
      : `Now the whole list hangs off the new node. Nothing points at ${val} yet, so HEAD still starts at ${v(L, old)}.`,
    1,
    { focus: k, wire: rec.wireId(N.id, 'next') },
  );
  if (L.doubly) {
    if (old != null) {
      L.node(old).prev = N.id;
      rec.hot.add(rec.wireId(old, 'prev'));
      rec.cost.writes++;
      rec.push(
        'link',
        `Point ${v(L, old)}’s prev back at ${val}.`,
        'A doubly linked list keeps a second pointer in every node, so each link is written in both directions.',
        2,
        { focus: L.key(old), wire: rec.wireId(old, 'prev') },
      );
    } else {
      L.tail = N.id;
      rec.cost.writes++;
      rec.push('move', `TAIL points at ${val} too.`, 'In a one-node list the head and the tail are the same node.', 3, {
        focus: k,
      });
    }
  }
  L.head = N.id;
  rec.cost.writes++;
  rec.push(
    'move',
    `HEAD now points at ${val}.`,
    'Inserting at the head never walks the list: however long it is, this takes the same few pointer writes.',
    L.doubly ? 4 : 2,
    { focus: k },
  );
  if (!L.doubly && L.tail == null) {
    L.tail = N.id;
    rec.cost.writes++;
    rec.push('move', `TAIL points at ${val} too.`, 'In a one-node list the head and the tail are the same node.', 3, {
      focus: k,
    });
  }
  rec.tones.delete(N.id);
  rec.vars.clear();
  rec.tidy();
  rec.push(
    'tidy',
    `${val} is the new head.`,
    `${writes(rec.cost.writes)}, no walking: O(1). An array would have to shift every value one cell right to make room at the front.`,
    -1,
    { focus: k },
  );
  return finish(rec, title, start);
}

export function insertTail(L: LinkedList, val: number): Recording {
  const { rec, title } = begin(L, `Insert ${val} at the tail`, 'insTail', 'insertTail');
  const start = rec.diagram();
  const old = L.tail;
  const N = L.create(val),
    k = L.key(N.id);
  rec.slots.set(N.id, old != null ? (rec.slots.get(old) ?? 0) + 1 : 0);
  rec.tones.set(N.id, 'new');
  rec.hand('NODE', N.id);
  rec.push(
    'alloc',
    `A new node for ${val}, at ${addrText(N.addr)}.`,
    `The allocator hands out any free spot in memory. Its next pointer is null, which is right for a tail.`,
    0,
    { focus: k, callout: { text: addrText(N.addr) } },
  );
  let line = 1;
  if (L.doubly) {
    N.prev = old;
    rec.hot.add(rec.wireId(N.id, 'prev'));
    rec.cost.writes++;
    rec.push(
      'link',
      old == null ? `${val}.prev stays null.` : `Point ${val}’s prev back at the old tail, ${v(L, old)}.`,
      old == null ? 'The list was empty, so there is nothing before it.' : 'Each new link is written both ways.',
      1,
      { focus: k, wire: rec.wireId(N.id, 'prev') },
    );
    line = 2;
  }
  if (old != null) {
    L.node(old).next = N.id;
    rec.hot.add(rec.wireId(old, 'next'));
    rec.cost.writes++;
    rec.push(
      'link',
      `Swing ${v(L, old)}’s next pointer from null to ${val}.`,
      'The list keeps a TAIL pointer, so the last node is one step away. Without TAIL you would walk the whole list to find it.',
      line,
      { focus: L.key(old), wire: rec.wireId(old, 'next') },
    );
  } else {
    L.head = N.id;
    rec.cost.writes++;
    rec.push('move', `HEAD points at ${val}.`, 'The list was empty, so the new node is also the head.', line + 1, {
      focus: k,
    });
  }
  L.tail = N.id;
  rec.cost.writes++;
  rec.push('move', `TAIL now points at ${val}.`, 'That is the whole insert.', line + 2, { focus: k });
  rec.tones.delete(N.id);
  rec.vars.clear();
  rec.tidy();
  rec.push(
    'tidy',
    `${val} is the new tail.`,
    `${writes(rec.cost.writes)}, no walking: O(1), thanks to the TAIL pointer.`,
    -1,
    { focus: k },
  );
  return finish(rec, title, start);
}

export function insertAt(L: LinkedList, val: number, i: number): Recording {
  const n = L.size;
  if (!Number.isInteger(i) || i < 0 || i > n)
    return nothing(
      L,
      `Insert ${val} at index ${i}`,
      'insAt',
      'insertAt',
      `There is no index ${i} to insert at.`,
      `This list has ${plural(n, 'node')}, so a new value can go at index 0 to ${n}.`,
    );
  if (i === 0) return insertHead(L, val);
  if (i === n) return insertTail(L, val);
  const { rec, title } = begin(L, `Insert ${val} at index ${i}`, 'insAt', 'insertAt');
  const start = rec.diagram();
  const fromTail = L.doubly && i > n / 2;
  const hops = fromTail ? n - i : i - 1;
  const goal = `We need node ${i - 1}, the one just before the gap.`;
  rec.hand('CUR', fromTail ? L.tail : L.head);
  rec.push(
    'start',
    fromTail ? `Start at the tail, ${v(L, L.tail)}.` : `Start at the head, ${v(L, L.head)}.`,
    fromTail
      ? `Index ${i} is past the middle, so a doubly linked list walks back from TAIL: ${plural(hops, 'hop')} instead of ${i - 1}. ${goal}`
      : `To put ${val} at index ${i}, stand on the node before it, index ${i - 1}. ${hops ? `That is ${plural(hops, 'hop')} away.` : 'That is the head itself.'}`,
    L.doubly ? (fromTail ? 4 : 1) : 0,
    { focus: L.key(fromTail ? (L.tail as number) : (L.head as number)) },
  );
  const cur = walk(rec, 'CUR', fromTail, hops, L.doubly ? (fromTail ? 5 : 2) : 2, goal) as number;
  const after = L.node(cur).next as number;
  const N = L.create(val),
    k = L.key(N.id);
  rec.slots.set(N.id, (rec.slots.get(cur) ?? 0) + 0.5);
  rec.loose.add(N.id);
  rec.tones.set(N.id, 'new');
  rec.hand('NODE', N.id);
  rec.push(
    'alloc',
    `A new node for ${val}, at ${addrText(N.addr)}.`,
    `It is not in the list yet: nothing points at it and it points at nothing. Found the spot in ${plural(rec.cost.hops, 'hop')}; now the splice.`,
    L.doubly ? 6 : 3,
    { focus: k, callout: { text: addrText(N.addr) } },
  );
  N.next = after;
  rec.hot.add(rec.wireId(N.id, 'next'));
  rec.cost.writes++;
  rec.push(
    'link',
    `First point ${val} at ${v(L, after)}.`,
    `Order matters. If ${v(L, cur)}’s pointer moved first, nothing would hold on to ${v(L, after)} and the rest of the list would be lost.`,
    L.doubly ? 7 : 4,
    { focus: k, wire: rec.wireId(N.id, 'next') },
  );
  if (L.doubly) {
    N.prev = cur;
    rec.hot.add(rec.wireId(N.id, 'prev'));
    rec.cost.writes++;
    rec.push('link', `Point ${val}’s prev back at ${v(L, cur)}.`, 'The new node now knows both neighbours.', 8, {
      focus: k,
      wire: rec.wireId(N.id, 'prev'),
    });
    L.node(after).prev = N.id;
    rec.hot.add(rec.wireId(after, 'prev'));
    rec.cost.writes++;
    rec.push(
      'link',
      `Swing ${v(L, after)}’s prev from ${v(L, cur)} to ${val}.`,
      'Walking backwards now passes through the new node.',
      9,
      { focus: L.key(after), wire: rec.wireId(after, 'prev') },
    );
  }
  L.node(cur).next = N.id;
  rec.hot.add(rec.wireId(cur, 'next'));
  rec.cost.writes++;
  rec.push(
    'link',
    `Swing ${v(L, cur)}’s next from ${v(L, after)} to ${val}.`,
    `The chain is whole again, with ${val} inside it. No other node moved or changed.`,
    L.doubly ? 10 : 5,
    { focus: L.key(cur), wire: rec.wireId(cur, 'next') },
  );
  rec.tones.delete(N.id);
  rec.vars.clear();
  rec.trail.clear();
  rec.tidy();
  rec.push(
    'tidy',
    `${val} is at index ${i}.`,
    `${plural(rec.cost.hops, 'hop')} to find the spot, then ${writes(rec.cost.writes)} to splice it in. Finding the spot is O(n); the insert itself is O(1). An array would shift ${plural(n - i, 'value')} instead.`,
    -1,
    { focus: k },
  );
  return finish(rec, title, start);
}

/* ---------------- delete ---------------- */

export function deleteAt(L: LinkedList, i: number): Recording {
  const n = L.size;
  const title = `Delete index ${i}`;
  const cx: OpKey = i === 0 ? 'delHead' : i === n - 1 ? 'delTail' : 'delAt';
  if (!n)
    return nothing(L, title, cx, 'deleteAt', 'The list is empty.', 'HEAD points to null: there is nothing to delete.');
  if (!Number.isInteger(i) || i < 0 || i >= n)
    return nothing(
      L,
      title,
      cx,
      'deleteAt',
      `There is no node at index ${i}.`,
      `This list has ${plural(n, 'node')}, at index 0 to ${n - 1}.`,
    );
  return L.doubly ? deleteDoubly(L, i, title, cx) : deleteSingly(L, i, title, cx);
}

function freeStep(rec: ChainRecorder, gone: number): void {
  const L = rec.L,
    val = v(L, gone);
  rec.vars.delete('GONE');
  L.release(gone);
  rec.push(
    'free',
    `${val} drops out of memory.`,
    `No pointer reaches ${val} any more, not HEAD and not any node, so the program can never find it again. Its memory goes back to the allocator.`,
    L.doubly ? 13 : 10,
    { callout: { text: 'unreachable', tone: 'red' } },
  );
}

function deleteSingly(L: LinkedList, i: number, title: string, cx: OpKey): Recording {
  const { rec } = begin(L, title, cx, 'deleteAt');
  const start = rec.diagram();
  const n = L.size;
  let gone: number;
  if (i === 0) {
    gone = L.head as number;
    rec.hand('GONE', gone);
    rec.tones.set(gone, 'gone');
    rec.push(
      'start',
      `Delete the head, ${v(L, gone)}.`,
      'The head is already in hand, so there is no walk at all.',
      1,
      { focus: L.key(gone) },
    );
    L.head = L.node(gone).next;
    rec.cost.writes++;
    rec.push(
      'move',
      L.head == null ? 'HEAD now points to null.' : `HEAD skips ahead to ${v(L, L.head)}.`,
      L.head == null
        ? 'That was the only node.'
        : `${v(L, gone)} still points at ${v(L, L.head)}, but nothing points at ${v(L, gone)}.`,
      2,
      { focus: L.head != null ? L.key(L.head) : null },
    );
    if (L.head == null) {
      L.tail = null;
      rec.cost.writes++;
      rec.push('move', 'TAIL points to null too.', 'The list is empty again.', 3);
    }
  } else {
    rec.hand('CUR', L.head);
    rec.push(
      'start',
      `Start at the head, ${v(L, L.head)}.`,
      `A singly linked list can only unlink a node from the node before it, so we need index ${i - 1}${i > 1 ? `, ${plural(i - 1, 'hop')} away` : ', the head itself'}.`,
      5,
      { focus: L.key(L.head as number) },
    );
    const cur = walk(rec, 'CUR', false, i - 1, 6, `We need node ${i - 1}.`) as number;
    gone = L.node(cur).next as number;
    rec.hand('GONE', gone);
    rec.tones.set(gone, 'gone');
    rec.push('start', `The node to delete is ${v(L, gone)}.`, `It is ${v(L, cur)}.next.`, 7, { focus: L.key(gone) });
    const after = L.node(gone).next;
    L.node(cur).next = after;
    rec.hot.add(rec.wireId(cur, 'next'));
    rec.cost.writes++;
    rec.push(
      'link',
      `Point ${v(L, cur)} past ${v(L, gone)}, straight at ${v(L, after)}.`,
      after == null
        ? `${v(L, cur)} becomes the last node, so its pointer is null.`
        : `${v(L, gone)} still points at ${v(L, after)}, but nothing points at ${v(L, gone)}: it has been cut out of the chain.`,
      8,
      { focus: L.key(cur), wire: rec.wireId(cur, 'next') },
    );
    if (L.tail === gone) {
      L.tail = cur;
      rec.cost.writes++;
      rec.push(
        'move',
        `TAIL moves back to ${v(L, cur)}.`,
        `Deleting the tail of a singly linked list costs a walk of ${plural(n - 2, 'hop')}: the tail cannot point backwards, so only a walk from the head finds the node before it.`,
        9,
        { focus: L.key(cur) },
      );
    }
  }
  const val = v(L, gone);
  rec.vars.delete('CUR');
  freeStep(rec, gone);
  rec.trail.clear();
  rec.tidy();
  rec.push(
    'tidy',
    `${val} is gone.`,
    `${plural(rec.cost.hops, 'hop')} to reach the node before it, then ${writes(rec.cost.writes)}. ${i === 0 ? 'Deleting the head is O(1).' : 'The walk is O(n); the unlink is O(1).'} An array would shift ${plural(n - 1 - i, 'value')} left to close the gap.`,
    -1,
  );
  return finish(rec, title, start);
}

function deleteDoubly(L: LinkedList, i: number, title: string, cx: OpKey): Recording {
  const { rec } = begin(L, title, cx, 'deleteAt');
  const start = rec.diagram();
  const n = L.size;
  const fromTail = i >= n / 2;
  const hops = fromTail ? n - 1 - i : i;
  const first = (fromTail ? L.tail : L.head) as number;
  rec.hand('GONE', first);
  rec.push(
    'start',
    fromTail ? `Start at the tail, ${v(L, first)}.` : `Start at the head, ${v(L, first)}.`,
    hops
      ? `Every node knows its neighbour on both sides, so we can stand on the doomed node itself. From the ${fromTail ? 'tail' : 'head'} that is ${plural(hops, 'hop')}.`
      : `The node to delete is the ${fromTail ? 'tail' : 'head'} itself: no walk.`,
    fromTail ? 4 : 1,
    { focus: L.key(first) },
  );
  const gone = walk(rec, 'GONE', fromTail, hops, fromTail ? 6 : 2, `We are looking for index ${i}.`) as number;
  rec.tones.set(gone, 'gone');
  const G = L.node(gone),
    before = G.prev,
    after = G.next;
  if (hops)
    rec.push(
      'start',
      `This is ${v(L, gone)}, the node to delete.`,
      'Now two pointers go around it.',
      fromTail ? 6 : 2,
      {
        focus: L.key(gone),
      },
    );
  if (before != null) {
    L.node(before).next = after;
    rec.hot.add(rec.wireId(before, 'next'));
    rec.cost.writes++;
    rec.push(
      'link',
      `Point ${v(L, before)}’s next past ${v(L, gone)}, at ${v(L, after)}.`,
      'gone.prev.next = gone.next: the node before now skips over it.',
      8,
      { focus: L.key(before), wire: rec.wireId(before, 'next') },
    );
  } else {
    L.head = after;
    rec.cost.writes++;
    rec.push('move', `HEAD moves on to ${v(L, after)}.`, `${v(L, gone)} was the head, so HEAD skips over it.`, 9, {
      focus: after != null ? L.key(after) : null,
    });
  }
  if (after != null) {
    L.node(after).prev = before;
    rec.hot.add(rec.wireId(after, 'prev'));
    rec.cost.writes++;
    rec.push(
      'link',
      `Point ${v(L, after)}’s prev back past ${v(L, gone)}, at ${v(L, before)}.`,
      'gone.next.prev = gone.prev: walking backwards skips it too.',
      11,
      { focus: L.key(after), wire: rec.wireId(after, 'prev') },
    );
  } else {
    L.tail = before;
    rec.cost.writes++;
    rec.push(
      'move',
      `TAIL moves back to ${v(L, before)}.`,
      'Because the tail knows the node before it, deleting the tail of a doubly linked list needs no walk: O(1).',
      12,
      { focus: before != null ? L.key(before) : null },
    );
  }
  const val = v(L, gone);
  freeStep(rec, gone);
  rec.trail.clear();
  rec.tidy();
  rec.push(
    'tidy',
    `${val} is gone.`,
    `${plural(rec.cost.hops, 'hop')}, then ${writes(rec.cost.writes)}. Starting from the nearer end means at most n / 2 hops; the unlink itself is O(1).`,
    -1,
  );
  return finish(rec, title, start);
}

/* ---------------- search and get ---------------- */

export function search(L: LinkedList, val: number): Recording {
  const title = `Search for ${val}`;
  if (!L.size)
    return nothing(L, title, 'search', 'search', 'The list is empty.', `HEAD points to null, so ${val} is not here.`);
  const { rec } = begin(L, title, 'search', 'search');
  const start = rec.diagram();
  let cur: number | null = L.head as number,
    i = 0;
  rec.hand('CUR', cur);
  rec.push(
    'start',
    `Start at the head, ${v(L, cur)}.`,
    `Compare each value with ${val} on the way down the chain.`,
    0,
    {
      focus: L.key(cur),
      callout: { text: 'i = 0' },
    },
  );
  while (cur != null) {
    rec.cost.compares++;
    const here = L.node(cur);
    if (here.val === val) {
      rec.tones.set(cur, 'hit');
      rec.push(
        'found',
        `Found ${val} at index ${i}.`,
        `${plural(rec.cost.compares, 'comparison')} and ${plural(rec.cost.hops, 'hop')}. Search is O(n) in a list and in an unsorted array alike: every value might be the one.`,
        2,
        { focus: L.key(cur), callout: { text: `= ${val}`, tone: 'cobalt' } },
      );
      return finish(rec, title, start);
    }
    const nxt: number | null = here.next;
    rec.trail.add(rec.wireId(cur, 'next'));
    rec.cost.hops++;
    rec.hand('CUR', nxt);
    i++;
    rec.push(
      'hop',
      nxt == null
        ? `${here.val} is not ${val}, and it is the last node.`
        : `${here.val} is not ${val}. On to ${v(L, nxt)}.`,
      nxt == null ? 'Its pointer is null: CUR falls off the end of the list.' : `Follow the pointer. i = ${i}.`,
      3,
      {
        focus: nxt != null ? L.key(nxt) : null,
        hop: nxt != null ? { from: L.key(cur), to: L.key(nxt) } : null,
        wire: rec.wireId(cur, 'next'),
        callout: { text: `${here.val} ≠ ${val}` },
      },
    );
    cur = nxt;
  }
  rec.push(
    'missing',
    `${val} is not in the list.`,
    `CUR is null after ${plural(rec.cost.compares, 'comparison')}. Proving something is absent means looking at every node: O(n).`,
    4,
    { callout: { text: 'not found', tone: 'red' } },
  );
  return finish(rec, title, start);
}

export function get(L: LinkedList, i: number): Recording {
  const n = L.size,
    title = `Get index ${i}`;
  if (!n) return nothing(L, title, 'access', 'get', 'The list is empty.', 'There is no index 0 to read.');
  if (!Number.isInteger(i) || i < 0 || i >= n)
    return nothing(
      L,
      title,
      'access',
      'get',
      `There is no index ${i}.`,
      `This list has ${plural(n, 'node')}, at index 0 to ${n - 1}.`,
    );
  const { rec } = begin(L, title, 'access', 'get');
  const start = rec.diagram();
  const fromTail = L.doubly && i >= n / 2;
  const hops = fromTail ? n - 1 - i : i;
  const line = L.doubly ? (fromTail ? 4 : 1) : 0;
  rec.hand('CUR', fromTail ? L.tail : L.head);
  rec.push(
    'start',
    fromTail ? `Start at the tail, ${v(L, L.tail)}.` : `Start at the head, ${v(L, L.head)}.`,
    fromTail
      ? `Index ${i} is past the middle, so walk back from TAIL: ${plural(hops, 'hop')}.`
      : `A list does not know where index ${i} is. The only way there is ${plural(hops, 'hop')} along the pointers.`,
    line,
    { focus: L.key((fromTail ? L.tail : L.head) as number) },
  );
  const cur = walk(rec, 'CUR', fromTail, hops, L.doubly ? line + 1 : 2, '') as number;
  rec.tones.set(cur, 'hit');
  rec.push(
    'found',
    `Index ${i} holds ${v(L, cur)}.`,
    `${plural(hops, 'hop')} to get here: O(n). An array finds any index in one jump, because its cells sit side by side in memory.`,
    L.doubly ? 6 : 3,
    { focus: L.key(cur), callout: { text: v(L, cur), tone: 'cobalt' } },
  );
  return finish(rec, title, start);
}

/* ---------------- reverse ---------------- */

export function reverse(L: LinkedList): Recording {
  const title = 'Reverse';
  if (!L.size)
    return nothing(L, title, 'reverse', 'reverse', 'The list is empty.', 'An empty list reads the same both ways.');
  return L.doubly ? reverseDoubly(L) : reverseSingly(L);
}

function reverseSingly(L: LinkedList): Recording {
  const { rec, title } = begin(L, 'Reverse', 'reverse', 'reverse');
  const start = rec.diagram();
  const n = L.size;
  rec.hand('PREV', null, 'left');
  rec.push(
    'start',
    'PREV starts at null.',
    'Three hands walk down the list. PREV is what is already reversed, CUR is the node being turned, NEXT keeps hold of the rest. PREV begins at null, because the new tail must point to null.',
    0,
    { focus: L.key(L.head as number) },
  );
  let cur: number | null = L.head;
  rec.hand('CUR', cur);
  rec.push('start', `CUR starts at the head, ${v(L, cur)}.`, 'No node will move. Only the pointers turn around.', 1, {
    focus: L.key(cur as number),
  });
  let prev: number | null = null;
  let turned = 0;
  while (cur != null) {
    const nxt: number | null = L.node(cur).next;
    rec.hand('NEXT', nxt);
    rec.push(
      'save',
      `NEXT holds on to ${v(L, nxt)}.`,
      nxt == null
        ? `${v(L, cur)} is the last node; its pointer is already null.`
        : `Save the rest of the list before cutting ${v(L, cur)}’s pointer, or ${v(L, nxt)} and everything after it would be lost.`,
      3,
      { focus: nxt != null ? L.key(nxt) : L.key(cur) },
    );
    L.node(cur).next = prev;
    rec.hot.add(rec.wireId(cur, 'next'));
    rec.cost.writes++;
    turned++;
    rec.push(
      'swing',
      `Turn ${v(L, cur)}’s pointer around, to ${v(L, prev)}.`,
      prev == null
        ? `${v(L, cur)} will be the new tail, so it points to null. Only NEXT still holds on to ${v(L, nxt)}.`
        : `${v(L, cur)} now points back at ${v(L, prev)}. ${turned} of ${n} turned.`,
      4,
      { focus: L.key(cur), wire: rec.wireId(cur, 'next') },
    );
    prev = cur;
    cur = nxt;
    rec.hand('PREV', prev);
    rec.hand('CUR', cur);
    rec.push(
      'advance',
      cur == null ? 'CUR runs off the end.' : `Step forward: PREV to ${v(L, prev)}, CUR to ${v(L, cur)}.`,
      cur == null
        ? `Every pointer has turned. PREV is on ${v(L, prev)}, the old tail: the new head.`
        : 'Everything behind PREV is already reversed.',
      cur == null ? 2 : 5,
      { focus: cur != null ? L.key(cur) : L.key(prev) },
    );
  }
  rec.vars.delete('NEXT');
  rec.vars.delete('CUR');
  const oldHead = L.head;
  L.tail = oldHead;
  L.head = prev;
  rec.cost.writes += 2;
  rec.push(
    'move',
    `HEAD moves to ${v(L, prev)}; TAIL to ${v(L, oldHead)}.`,
    'The list now starts at the far end and runs back the other way.',
    8,
    { focus: L.key(prev as number) },
  );
  rec.vars.clear();
  rec.tidy();
  rec.push(
    'turn',
    'Reversed.',
    `Turn the picture round so it reads left to right again. In memory, not one node moved: ${plural(n, 'pointer')} changed direction, one pass, O(n) time and O(1) extra space.`,
    -1,
    { focus: L.key(prev as number) },
  );
  return finish(rec, title, start);
}

function reverseDoubly(L: LinkedList): Recording {
  const { rec, title } = begin(L, 'Reverse', 'reverse', 'reverse');
  const start = rec.diagram();
  const n = L.size;
  let cur: number | null = L.head;
  rec.hand('CUR', cur);
  rec.push(
    'start',
    `CUR starts at the head, ${v(L, cur)}.`,
    'In a doubly linked list every node already knows both directions, so reversing is a swap inside each node: next becomes prev, prev becomes next.',
    0,
    { focus: L.key(cur as number) },
  );
  let k = 0;
  while (cur != null) {
    const N = L.node(cur);
    [N.next, N.prev] = [N.prev, N.next];
    rec.hot.add(rec.wireId(cur, 'next'));
    rec.hot.add(rec.wireId(cur, 'prev'));
    rec.cost.writes += 2;
    k++;
    rec.push(
      'swap',
      `Swap ${N.val}’s next and prev.`,
      `Its next now points to ${v(L, N.next)} and its prev to ${v(L, N.prev)}. ${k} of ${n} swapped.`,
      2,
      { focus: L.key(cur), wire: rec.wireId(cur, 'next') },
    );
    const nxt: number | null = N.prev;
    rec.hand('CUR', nxt);
    rec.push(
      'advance',
      nxt == null ? 'CUR runs off the end.' : `CUR moves on to ${v(L, nxt)}.`,
      nxt == null
        ? 'Every node is swapped.'
        : 'After the swap, the old next is stored in prev, so that is the pointer to follow.',
      nxt == null ? 1 : 3,
      { focus: nxt != null ? L.key(nxt) : L.key(cur) },
    );
    cur = nxt;
  }
  [L.head, L.tail] = [L.tail, L.head];
  rec.cost.writes += 2;
  rec.vars.clear();
  rec.push('move', 'Swap HEAD and TAIL.', `HEAD is now ${v(L, L.head)}, TAIL is ${v(L, L.tail)}.`, 4, {
    focus: L.key(L.head as number),
  });
  rec.tidy();
  rec.push(
    'turn',
    'Reversed.',
    `Turn the picture round so it reads left to right again. No node moved: ${plural(2 * n, 'pointer')} swapped places, O(n).`,
    -1,
    { focus: L.key(L.head as number) },
  );
  return finish(rec, title, start);
}
