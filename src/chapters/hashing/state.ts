// The two tables on show, what they start with, and what the viewer has chosen.

import { Recorder } from './record';
import type { Diagram } from './diagram';
import { HashTable, type Strategy } from './table';

/**
 * Six keys in eight buckets: three quarters full, one key short of growing. In
 * this order, 33 collides with 25 and 70 with 46, and probing already has a run of four.
 */
export const START_KEYS = [25, 12, 46, 33, 59, 70] as const;

export type World = Record<Strategy, HashTable>;

/** A table holding the opening keys, with what each insert cost already in its ledger. */
export function fresh(s: Strategy): HashTable {
  const T = new HashTable(s);
  for (const k of START_KEYS) {
    const work = s === 'chain' ? 1 + T.chains[T.home(k)].length : T.probe(k).path.length;
    T.quickInsert(k);
    T.ledger.push({ kind: 'insert', key: k, work, n: T.n, m: T.m });
  }
  return T;
}

export const createWorld = (): World => ({ chain: fresh('chain'), probe: fresh('probe') });

/** The table as it stands, at rest. */
export const diagramOf = (T: HashTable): Diagram => new Recorder(T, '', 'insert', `${T.strategy}.put`).diagram();

export interface UiState {
  strategy: Strategy;
  /** Double the table when it passes three quarters full. */
  grow: boolean;
  /** The disc in the inspector. */
  selected: string | null;
}

export const createUiState = (): UiState => ({ strategy: 'chain', grow: true, selected: null });
