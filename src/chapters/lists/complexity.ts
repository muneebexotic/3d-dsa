// The cost of every operation on every structure: the table beside the sculpture.

import type { Structure } from './diagram';

export type OpKey =
  | 'access'
  | 'search'
  | 'insHead'
  | 'insTail'
  | 'insAt'
  | 'delHead'
  | 'delTail'
  | 'delAt'
  | 'reverse'
  | 'push'
  | 'pop'
  | 'peek';

export type SeqKind = 'array' | 'singly' | 'doubly';

export interface CostRow<K extends string> {
  op: OpKey;
  label: string;
  cost: Record<K, string>;
}

/** Arrays and lists. A dagger marks rows where the walk costs O(n) but the splice itself is O(1). */
export const SEQ_TABLE: readonly CostRow<SeqKind>[] = [
  { op: 'access', label: 'Get index i', cost: { array: 'O(1)', singly: 'O(n)', doubly: 'O(n)' } },
  { op: 'search', label: 'Search for v', cost: { array: 'O(n)', singly: 'O(n)', doubly: 'O(n)' } },
  { op: 'insHead', label: 'Insert at head', cost: { array: 'O(n)', singly: 'O(1)', doubly: 'O(1)' } },
  { op: 'insTail', label: 'Insert at tail', cost: { array: 'O(1)*', singly: 'O(1)', doubly: 'O(1)' } },
  { op: 'insAt', label: 'Insert at i', cost: { array: 'O(n)', singly: 'O(n)†', doubly: 'O(n)†' } },
  { op: 'delHead', label: 'Delete head', cost: { array: 'O(n)', singly: 'O(1)', doubly: 'O(1)' } },
  { op: 'delTail', label: 'Delete tail', cost: { array: 'O(1)', singly: 'O(n)', doubly: 'O(1)' } },
  { op: 'delAt', label: 'Delete at i', cost: { array: 'O(n)', singly: 'O(n)†', doubly: 'O(n)†' } },
  { op: 'reverse', label: 'Reverse', cost: { array: 'O(n)', singly: 'O(n)', doubly: 'O(n)' } },
];
export const SEQ_NOTES = [
  '* Amortized: when the array is full it copies everything into one twice the size, which is rare enough to average out.',
  '† Walking to i is O(n); once there, the splice is two or four pointer writes, O(1).',
  'Extra memory per value: array none, singly one pointer, doubly two.',
];

export type BoxKind = 'stack' | 'queue';
/** Stacks and queues. */
export const BOX_TABLE: readonly CostRow<BoxKind>[] = [
  { op: 'push', label: 'Push · enqueue', cost: { stack: 'O(1)', queue: 'O(1)' } },
  { op: 'pop', label: 'Pop · dequeue', cost: { stack: 'O(1)', queue: 'O(1)' } },
  { op: 'peek', label: 'Peek', cost: { stack: 'O(1)', queue: 'O(1)' } },
  { op: 'search', label: 'Search', cost: { stack: 'O(n)', queue: 'O(n)' } },
];
export const BOX_NOTES = [
  'The stack here is a linked list you only touch at the head. The queue is a ring buffer: an array whose end wraps around to its start.',
  'A queue that shifted every value forward on each dequeue would make dequeue O(n); the ring never moves a value.',
];

export const isSeq = (s: Structure): s is SeqKind => s === 'array' || s === 'singly' || s === 'doubly';
