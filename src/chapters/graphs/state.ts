// What the viewer has chosen and is doing, shared by the page's modules.

import { Graph, type AlgoKey, type EdgeId, type NodeId } from './algorithms';
import type { PresetKey } from './presets';
import type { Mode } from './program';

export type Tool = 'move' | 'node' | 'edge' | 'delete';

export interface DragState {
  id: NodeId;
  /** Which plinth the knot was grabbed on. */
  j: number;
  x: number;
  z: number;
  /** Where on the knot it was grabbed, so it does not jump to the pointer. */
  dx: number;
  dz: number;
}

export interface UiState {
  mode: Mode;
  algo: AlgoKey;
  race: [AlgoKey, AlgoKey];
  preset: PresetKey | 'custom';
  start: NodeId | null;
  target: NodeId | null;
  tool: Tool;
  selected: NodeId | null;
  selectedNet: number;
  /** First knot clicked with + Edge. */
  pendingEdge: { j: number; id: NodeId } | null;
  /** Pointer on the floor plane, for the string being tied. */
  pointer: { x: number; z: number } | null;
  drag: DragState | null;
  /** The string whose weight card is open. */
  wEdge: EdgeId | null;
}

/** The graph being edited. `gen` changes whenever a different graph is loaded. */
export interface GraphDoc {
  graph: Graph;
  gen: number;
}

export function createUiState(): UiState {
  return {
    mode: 'single',
    algo: 'dijkstra',
    race: ['bfs', 'dfs'],
    preset: 'textbook',
    start: null,
    target: null,
    tool: 'move',
    selected: null,
    selectedNet: 0,
    pendingEdge: null,
    pointer: null,
    drag: null,
    wEdge: null,
  };
}

export function createDoc(): GraphDoc {
  return { graph: new Graph(), gen: 1 };
}
