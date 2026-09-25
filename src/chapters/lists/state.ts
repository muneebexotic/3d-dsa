// The five structures on show, what they start with, and what the viewer has chosen.

import { DynArray, arrayDiagram } from './array';
import type { Diagram, Structure } from './diagram';
import { ChainRecorder, LinkedList } from './linked';
import { RingQueue, ringDiagram } from './queue';

/** The same six values in every sequence, so array and lists can be compared directly. */
export const START_VALUES = [4, 8, 15, 16, 23, 42] as const;

export interface World {
  array: DynArray;
  singly: LinkedList;
  doubly: LinkedList;
  stack: LinkedList;
  queue: RingQueue;
}

const SEEDS = { singly: 17, doubly: 29, stack: 41 } as const;

export function fresh<K extends Structure>(s: K): World[K];
export function fresh(s: Structure): World[Structure] {
  switch (s) {
    case 'array': {
      const A = new DynArray(8);
      for (const v of START_VALUES) A.quickAppend(v);
      return A;
    }
    case 'singly':
    case 'doubly': {
      const L = new LinkedList(s, SEEDS[s]);
      for (const v of START_VALUES) L.quickAppend(v);
      return L;
    }
    case 'stack': {
      const S = new LinkedList('stack', SEEDS.stack);
      for (const v of [1, 2, 3]) S.quickPushHead(v);
      return S;
    }
    case 'queue': {
      const Q = new RingQueue();
      Q.reset(3);
      for (const v of [1, 2, 3]) Q.quickEnqueue(v);
      return Q;
    }
  }
}

export function createWorld(): World {
  return {
    array: fresh('array'),
    singly: fresh('singly'),
    doubly: fresh('doubly'),
    stack: fresh('stack'),
    queue: fresh('queue'),
  };
}

/** The structure as it stands, at rest. */
export function diagramOf(world: World, s: Structure): Diagram {
  switch (s) {
    case 'array':
      return arrayDiagram(world.array);
    case 'queue':
      return ringDiagram(world.queue);
    default:
      return new ChainRecorder(world[s], '', 'search', s === 'stack' ? 'stack.peek' : `${s}.search`).diagram();
  }
}

export interface UiState {
  structure: Structure;
  /** Memory view: nodes at their addresses, the ring unbent into the array it is. */
  memory: boolean;
  /** The disc or cell in the inspector. */
  selected: string | null;
  /** The next value a blank push or enqueue uses, so the order is easy to follow. */
  next: { stack: number; queue: number };
}

export function createUiState(): UiState {
  return { structure: 'singly', memory: false, selected: null, next: { stack: 4, queue: 4 } };
}
