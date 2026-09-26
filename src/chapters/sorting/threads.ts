// The threads a sort weaves: one per value, in the order the input gives them.
// Inputs are made from a seed, so a shuffle can be repeated and a test is fixed.

import { mulberry } from '../../core/random';

export type InputKind = 'random' | 'nearly' | 'reversed' | 'twins';
export const INPUTS: readonly InputKind[] = ['random', 'nearly', 'reversed', 'twins'];
export const INPUT_NAMES: Readonly<Record<InputKind, string>> = {
  random: 'Random',
  nearly: 'Nearly sorted',
  reversed: 'Reversed',
  twins: 'Twins',
};

export const SIZES = [8, 12, 16, 24] as const;
export const MAX_N = 24;

export interface Thread {
  /** Its place in the input. */
  id: number;
  /** Its value: 1 to n, or 1 to n / 2 when every value comes as twins. */
  v: number;
  /** For twins: 'a' for the one that comes first in the input, 'b' for the next. */
  twin: string;
  /** The value, with a twin's letter. */
  label: string;
}

export interface Threads {
  kind: InputKind;
  n: number;
  seed: number;
  list: Thread[];
  /** The largest value. */
  top: number;
}

function shuffle(xs: number[], rnd: () => number): void {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
}

const inOrder = (xs: readonly number[]): boolean => xs.every((x, i) => i === 0 || xs[i - 1] <= x);

/** The values an input starts with. */
export function inputValues(kind: InputKind, n: number, seed: number): number[] {
  const rnd = mulberry(seed * 7919 + n * 31 + kind.length);
  const up = Array.from({ length: n }, (_, i) => i + 1);
  switch (kind) {
    case 'reversed':
      return up.reverse();
    case 'nearly': {
      // sorted, with a few keys nudged one or two places out
      const xs = up.slice();
      const swaps = Math.max(2, Math.round(n / 6));
      for (let k = 0; k < swaps; k++) {
        const i = Math.floor(rnd() * (n - 1)),
          j = Math.min(n - 1, i + 1 + Math.floor(rnd() * 2));
        [xs[i], xs[j]] = [xs[j], xs[i]];
      }
      if (inOrder(xs)) [xs[0], xs[1]] = [xs[1], xs[0]];
      return xs;
    }
    case 'twins': {
      const xs = Array.from({ length: n }, (_, i) => (i >> 1) + 1);
      do shuffle(xs, rnd);
      while (inOrder(xs));
      return xs;
    }
    default: {
      const xs = up.slice();
      do shuffle(xs, rnd);
      while (inOrder(xs));
      return xs;
    }
  }
}

/** Threads for an input: values, and letters for twins in the order they come. */
export function makeThreads(kind: InputKind, n: number, seed: number): Threads {
  const vs = inputValues(kind, n, seed);
  const seen = new Map<number, number>();
  const list = vs.map((v, id): Thread => {
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    const twin = kind === 'twins' ? (k === 0 ? 'a' : 'b') : '';
    return { id, v, twin, label: `${v}${twin}` };
  });
  return { kind, n, seed, list, top: Math.max(...vs) };
}

/** Threads from any values (for tests and fixed examples); repeated values get letters. */
export function threadsOf(values: readonly number[]): Threads {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  const seen = new Map<number, number>();
  const list = values.map((v, id): Thread => {
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    const twin = (count.get(v) ?? 0) > 1 ? String.fromCharCode(97 + k) : '';
    return { id, v, twin, label: `${v}${twin}` };
  });
  const twins = [...count.values()].some(c => c > 1);
  return { kind: twins ? 'twins' : 'random', n: values.length, seed: 0, list, top: Math.max(...values) };
}
