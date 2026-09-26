// Page state for Sorting Loom that is not in any recording: what is chosen in the
// controls, and the thread being followed.

import type { View } from './layout';
import type { Measure } from './panels';
import type { SortKey } from './sorts';
import { makeThreads, type InputKind, type Threads } from './threads';

export type PlayMode = 'solo' | 'race';

export interface UiState {
  mode: PlayMode;
  sort: SortKey;
  kind: InputKind;
  n: number;
  seed: number;
  view: View;
  measure: Measure;
  /** The thread being followed, by its place in the input. */
  selected: number | null;
}

/** The opening: sixteen shuffled threads, all six sorts. */
export const START = { kind: 'random' as InputKind, n: 16, seed: 6 };

export const createUiState = (): UiState => ({
  mode: 'race',
  sort: 'insertion',
  ...START,
  view: 'loom',
  measure: 'comps',
  selected: null,
});

export const threadsFor = (ui: UiState): Threads => makeThreads(ui.kind, ui.n, ui.seed);
