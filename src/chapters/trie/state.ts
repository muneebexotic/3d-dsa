// Page state for Prefix Sunburst that is not in any recording: the words each
// dictionary holds now (inserts and deletes change them), what is chosen in the
// controls, and the node in the inspector.

import type { OpKey } from './diagram';
import type { View } from './layout';
import { dictOf, type Dict } from './trie';
import { SIZES, WORDS, type Size } from './words';

export interface UiState {
  size: Size;
  view: View;
  /** The word in the box. */
  word: string;
  /** The operation on show. */
  op: OpKey;
  dicts: Record<Size, Dict>;
  selected: { fan: string; id: string } | null;
}

export const freshDicts = (): Record<Size, Dict> =>
  Object.fromEntries(SIZES.map(s => [s, dictOf(WORDS[s])])) as Record<Size, Dict>;

export const createUiState = (): UiState => ({
  size: 20,
  view: 'letters',
  word: '',
  op: 'zip',
  dicts: freshDicts(),
  selected: null,
});

/** A word to use when the box is empty, for each operation. */
export const EXAMPLE: Readonly<Record<'search' | 'insert' | 'remove' | 'spell' | 'three', string>> = {
  search: 'CART',
  insert: 'CARS',
  remove: 'CARTOON',
  spell: 'DOE',
  three: 'CART',
};
