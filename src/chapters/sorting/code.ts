// The code each sort runs, shown beside the loom with the current line lit.
// Line numbers here are the ones sorts.ts records (0-based).

import type { SortKey } from './sorts';

export const LISTINGS: Readonly<Record<SortKey, readonly string[]>> = {
  bubble: [
    'for i in 0 ..< n-1:',
    '  swapped = false',
    '  for j in 0 ..< n-1-i:',
    '    if a[j] > a[j+1]:',
    '      swap(a[j], a[j+1])',
    '      swapped = true',
    '  if not swapped: break',
  ],
  insertion: [
    'for i in 1 ..< n:',
    '  key = a[i]; j = i - 1',
    '  while j >= 0 and a[j] > key:',
    '    a[j+1] = a[j]; j -= 1',
    '  a[j+1] = key',
  ],
  selection: [
    'for i in 0 ..< n-1:',
    '  m = i',
    '  for j in i+1 ..< n:',
    '    if a[j] < a[m]: m = j',
    '  swap(a[i], a[m])',
  ],
  merge: [
    'sort(lo, hi):',
    '  if hi - lo < 2: return',
    '  mid = (lo + hi) / 2',
    '  sort(lo, mid); sort(mid, hi)',
    '  merge(lo, mid, hi)',
    'merge(lo, mid, hi):',
    '  i = lo; j = mid',
    '  while i < mid and j < hi:',
    '    if a[i] <= a[j]: take a[i]',
    '    else: take a[j]',
    '  take the rest; copy back',
  ],
  quick: [
    'sort(lo, hi):',
    '  if hi - lo < 2: return',
    '  p = partition(lo, hi)',
    '  sort(lo, p); sort(p+1, hi)',
    'partition(lo, hi):',
    '  pivot = a[hi-1]; i = lo',
    '  for j in lo ..< hi-1:',
    '    if a[j] < pivot:',
    '      swap(a[i], a[j]); i += 1',
    '  swap(a[i], a[hi-1])',
    '  return i',
  ],
  heap: [
    'for i in n/2-1 down to 0:',
    '  sink(i, n)      // heapify',
    'for end in n-1 down to 1:',
    '  swap(a[0], a[end])',
    '  sink(0, end)',
    'sink(i, end):',
    '  while 2i+1 < end:',
    '    c = bigger child of i',
    '    if a[i] >= a[c]: break',
    '    swap(a[i], a[c]); i = c',
  ],
};
