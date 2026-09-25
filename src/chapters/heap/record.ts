// The recorder: it watches an operation run on a Heap and, after each change,
// snapshots a Diagram of it plus whatever is being checked (the moving key, the
// keys it is compared with, the wires between them).

import type { CodeKey } from './code';
import {
  cloneDiagram,
  zeroCost,
  type Cost,
  type DItem,
  type Diagram,
  type OpKey,
  type Step,
  type StepKind,
  type Tone,
  type View,
} from './diagram';
import type { NetState } from './dijkstra';
import type { Heap } from './heap';

export type StepExtra = Partial<
  Pick<Step, 'focus' | 'from' | 'look' | 'callout' | 'mover' | 'path' | 'top' | 'was' | 'net'>
>;

export class Recorder {
  readonly H: Heap;
  readonly steps: Step[] = [];
  readonly cost: Cost = zeroCost();
  readonly tones = new Map<string, Tone>();
  /** Keys already on the out tray that the array still holds: the hole at the top, before the last key fills it. */
  readonly gone = new Set<string>();
  lit: number[] = [];
  /** Wires being checked in the next step, by child slot; cleared after each step. */
  hot: number[] = [];
  view: View;
  wires = true;
  /** Dijkstra: where the run stands; carried from step to step. */
  net: NetState | null = null;
  op: string;
  cx: OpKey;
  code: CodeKey;

  constructor(H: Heap, view: View, op: string, cx: OpKey, code: CodeKey) {
    this.H = H;
    this.view = view;
    this.op = op;
    this.cx = cx;
    this.code = code;
  }

  diagram(): Diagram {
    const H = this.H,
      items: DItem[] = [];
    H.a.forEach((it, i) => {
      if (this.gone.has(it.id)) return;
      items.push({
        id: it.id,
        key: it.key,
        tag: it.tag,
        place: { at: 'slot', i },
        tone: this.tones.get(it.id) ?? 'rest',
      });
    });
    H.out.forEach((it, j) => items.push({ id: it.id, key: it.key, tag: it.tag, place: { at: 'out', j }, tone: 'out' }));
    return {
      order: H.order,
      view: this.view,
      wires: this.wires,
      n: H.n,
      items,
      outN: H.out.length,
      lit: [...this.lit],
      hot: [...this.hot],
    };
  }

  /** Record a step; the checked wires are cleared afterwards. */
  push(kind: StepKind, head: string, body: string, line: number, extra: StepExtra = {}): void {
    this.steps.push({
      kind,
      op: this.op,
      cx: this.cx,
      diag: cloneDiagram(this.diagram()),
      head,
      body,
      code: this.code,
      line,
      cost: { ...this.cost },
      net: this.net,
      ledger: this.H.ledger.length,
      ...extra,
    });
    this.hot = [];
  }

  /** Paint every key in the heap as at rest again. */
  calm(): void {
    this.tones.clear();
  }
}
