// The heap on show, what it starts with, and what the viewer has chosen.

import type { Diagram } from './diagram';
import { Heap } from './heap';
import type { World } from './ops';
import { Recorder } from './record';

/**
 * Ten keys that already form a min-heap. Push 5 and it climbs two rows to sit
 * under 4; pop and 21 comes up from the end and sinks two rows, past 9 and 12.
 */
export const START_KEYS = [4, 17, 9, 23, 18, 12, 31, 40, 26, 21] as const;

/** Keys a random heapify draws: fifteen fills four rows exactly. */
export const BUILD_SIZE = 15;

export const freshWorld = (): World => ({ H: new Heap('min', START_KEYS), view: 'tree' });

/** The heap as it stands, at rest. */
export const diagramOf = (W: World): Diagram => new Recorder(W.H, W.view, '', 'peek', 'push').diagram();

export interface UiState {
  /** The disc in the inspector. */
  selected: string | null;
}

export const createUiState = (): UiState => ({ selected: null });
