// A stack built from linked nodes: a list you only ever touch at the head, which
// is called TOP. It stands upright, newest on top, so last in is first out.

import { plural } from '../../core/math';
import type { Recording } from './diagram';
import { ChainRecorder, TRAY_SIZE, type LinkedList } from './linked';
import { addrText } from './memory';

export const MAX_STACK = 9;

const top = (S: LinkedList) => (S.head == null ? null : S.node(S.head));

export function push(S: LinkedList, val: number): Recording {
  const title = `Push ${val}`;
  const rec = new ChainRecorder(S, title, 'push', 'stack.push');
  const start = rec.diagram();
  if (S.size >= MAX_STACK) {
    rec.push(
      'overflow',
      `The column holds ${MAX_STACK} nodes.`,
      'A linked stack only runs out when memory does; this plinth runs out sooner. Pop something first.',
      -1,
      { focus: S.head != null ? S.key(S.head) : null, callout: { text: 'full', tone: 'red' } },
    );
    return { title, steps: rec.steps, start };
  }
  const old = S.head;
  const N = S.create(val),
    k = S.key(N.id);
  rec.slots.set(N.id, S.size);
  rec.loose.add(N.id);
  rec.tones.set(N.id, 'new');
  rec.hand('NODE', N.id);
  rec.push(
    'alloc',
    `A new node for ${val}, at ${addrText(N.addr)}.`,
    'It hovers above the stack: nothing points at it yet.',
    0,
    { focus: k, callout: { text: addrText(N.addr) } },
  );
  N.next = old;
  rec.hot.add(rec.wireId(N.id, 'next'));
  rec.cost.writes++;
  rec.push(
    'link',
    old == null ? `${val}.next stays null.` : `Point ${val} down at the old top, ${S.node(old).val}.`,
    old == null
      ? 'The stack was empty, so there is nothing under it.'
      : 'Everything already on the stack now hangs beneath the new node.',
    1,
    { focus: k, wire: rec.wireId(N.id, 'next') },
  );
  S.head = N.id;
  if (S.tail == null) S.tail = N.id;
  rec.cost.writes++;
  rec.loose.delete(N.id);
  rec.tones.delete(N.id);
  rec.vars.clear();
  rec.push(
    'move',
    `TOP moves up to ${val}.`,
    `${val} settles on top. Push is one new node and two pointer writes, however tall the stack: O(1).`,
    2,
    { focus: k },
  );
  return { title, steps: rec.steps, start };
}

/** Put a popped node on the tray, dropping the oldest entry when it is full. */
function toTray(S: LinkedList, key: string, val: number): void {
  S.out.push({ key, val });
  if (S.out.length > TRAY_SIZE) S.out.shift();
}

export function pop(S: LinkedList): Recording {
  const title = 'Pop';
  const rec = new ChainRecorder(S, title, 'pop', 'stack.pop');
  const start = rec.diagram();
  const T = top(S);
  if (!T) {
    rec.push(
      'underflow',
      'Stack underflow.',
      'TOP points to null: there is nothing to pop. Real code checks isEmpty() first, or throws here.',
      0,
      { callout: { text: 'empty', tone: 'red' } },
    );
    return { title, steps: rec.steps, start };
  }
  const k = S.key(T.id),
    below = T.next;
  rec.tones.set(T.id, 'cur');
  rec.push(
    'read',
    `The top is ${T.val}.`,
    below == null
      ? 'It is the only value on the stack.'
      : `Only the top can be reached. The value at the bottom is buried under ${plural(S.size - 1, 'node')}; to get it you would pop every one of them first.`,
    1,
    { focus: k, callout: { text: `v = ${T.val}`, tone: 'cobalt' } },
  );
  S.head = below;
  if (below == null) S.tail = null;
  rec.cost.writes++;
  rec.tones.set(T.id, 'gone');
  rec.push(
    'move',
    below == null ? 'TOP drops to null.' : `TOP drops to ${S.node(below).val}.`,
    `Nothing points at ${T.val} now.`,
    2,
    { focus: below != null ? S.key(below) : k },
  );
  S.release(T.id);
  rec.tones.delete(T.id);
  toTray(S, k, T.val);
  rec.tidy();
  const order = S.out.map(e => e.val).join(', ');
  rec.push('out', `Out comes ${T.val}.`, `Last in, first out. Popped so far, in order: ${order}. Pop is O(1).`, 3, {
    focus: k,
  });
  return { title, steps: rec.steps, start };
}

export function peek(S: LinkedList): Recording {
  const title = 'Peek';
  const rec = new ChainRecorder(S, title, 'peek', 'stack.peek');
  const start = rec.diagram();
  const T = top(S);
  if (!T) {
    rec.push('underflow', 'Nothing to peek at.', 'TOP points to null: the stack is empty.', 0, {
      callout: { text: 'empty', tone: 'red' },
    });
    return { title, steps: rec.steps, start };
  }
  rec.tones.set(T.id, 'hit');
  rec.push(
    'read',
    `The top is ${T.val}.`,
    'Peek reads the top without removing it: one pointer, O(1). It is the only value a stack lets you see.',
    1,
    { focus: S.key(T.id), callout: { text: String(T.val), tone: 'cobalt' } },
  );
  return { title, steps: rec.steps, start };
}

/** Push values one after another, then pop them all: the order comes back reversed. */
export function fillAndEmpty(S: LinkedList, values: readonly number[]): Recording {
  const start = new ChainRecorder(S, '', 'push', 'stack.push').diagram();
  const steps = [];
  for (const v of values) steps.push(...push(S, v).steps);
  while (S.size) steps.push(...pop(S).steps);
  return {
    title: `Push ${values.join(', ')}, then pop them all`,
    steps,
    start,
  };
}
