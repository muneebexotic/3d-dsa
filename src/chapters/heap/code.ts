// The code each operation runs, shown beside the sculpture with the current line
// lit. Pseudocode for a min-heap; a max-heap flips the key comparisons (never the
// index ones).

import type { Order } from './heap';

const MIN = {
  push: [
    'a.append(k)',
    'i = n - 1        // the end',
    'while i > 0:',
    '  p = (i - 1) // 2',
    '  if a[p] <= a[i]: break',
    '  swap(a[i], a[p])',
    '  i = p',
  ],
  pop: [
    'top = a[0]',
    'a[0] = a.pop()  // last to top',
    'i = 0',
    'while 2*i + 1 < n:',
    '  c = 2*i + 1    // left child',
    '  if c+1 < n and a[c+1]<a[c]:',
    '    c += 1       // right wins',
    '  if a[i] <= a[c]: break',
    '  swap(a[i], a[c])',
    '  i = c',
    'return top',
  ],
  heapify: [
    'i = n // 2 - 1  // last parent',
    'while i >= 0:',
    '  j = i',
    '  while 2*j + 1 < n:',
    '    c = better child of j',
    '    if a[j] <= a[c]: break',
    '    swap(a[j], a[c])',
    '    j = c',
    '  i -= 1',
  ],
  lower: [
    'i = where[x]     // no search',
    'a[i] = d         // d < a[i]',
    'while i > 0:',
    '  p = (i - 1) // 2',
    '  if a[p] <= a[i]: break',
    '  swap(a[i], a[p])',
    '  i = p',
  ],
  dijkstra: [
    'pq.push(A, 0)',
    'while pq not empty:',
    '  x = pq.pop()   // cheapest',
    '  for y, w next to x:',
    '    d = dist[x] + w',
    '    if d < dist[y]:',
    '      dist[y] = d',
    '      pq.push or lower(y, d)',
  ],
  view: ['// slot i of the array:', 'parent = (i - 1) // 2', 'left   = 2*i + 1', 'right  = 2*i + 2'],
} as const satisfies Record<string, readonly string[]>;

export type CodeKey = keyof typeof MIN;

/** Swap the key comparisons for a max-heap; index comparisons stay as they are. */
function flip(line: string): string {
  return line
    .replace('a[p] <= a[i]', 'a[p] >= a[i]')
    .replace('a[i] <= a[c]', 'a[i] >= a[c]')
    .replace('a[j] <= a[c]', 'a[j] >= a[c]')
    .replace('a[c+1]<a[c]', 'a[c+1]>a[c]')
    .replace('d < a[i]', 'd > a[i]');
}

export function listing(key: CodeKey, order: Order): readonly string[] {
  return order === 'min' ? MIN[key] : MIN[key].map(flip);
}

/** What a listing is called in the code card. */
export function codeTitle(key: CodeKey, order: Order): string {
  const title: Record<CodeKey, string> = {
    push: 'push(k)',
    pop: order === 'min' ? 'pop() · take the min' : 'pop() · take the max',
    heapify: 'heapify(a)',
    lower: order === 'min' ? 'lower(x, d)' : 'raise(x, d)',
    dijkstra: 'dijkstra(A)',
    view: 'the index rules',
  };
  return title[key];
}
