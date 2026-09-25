// A queue kept in a ring buffer: an ordinary array of 8 cells whose end wraps
// round to its start. FRONT is where the oldest value waits; BACK is the empty
// cell the next value goes into. Nothing ever shifts, so both ends are O(1).

import { plural } from '../../core/math';
import {
  cellRef,
  cloneDiagram,
  zeroCost,
  type Cost,
  type Diagram,
  type Recording,
  type Step,
  type StepKind,
  type Tone,
} from './diagram';
import type { CodeKey } from './code';
import type { OpKey } from './complexity';
import { TRAY_SIZE, type OutEntry } from './linked';

export const RING_CAP = 8;
export const RING_BLOCK = 'Q';
const RING_BASE = 0x40;

export interface RingSlot {
  key: string;
  val: number;
}

export class RingQueue {
  readonly cap = RING_CAP;
  /** How a value is written on its disc. */
  readonly labelOf: (val: number) => string;
  cells: (RingSlot | null)[] = Array.from({ length: RING_CAP }, () => null);
  front = 0;
  back = 0;
  size = 0;
  out: OutEntry[] = [];
  private nextKey = 1;

  constructor(labelOf: (val: number) => string = String) {
    this.labelOf = labelOf;
  }

  newSlot(val: number): RingSlot {
    return { key: `Q${this.nextKey++}`, val };
  }

  /** Values from front to back. */
  values(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.size; k++) out.push((this.cells[(this.front + k) % this.cap] as RingSlot).val);
    return out;
  }

  quickEnqueue(val: number): void {
    this.cells[this.back] = this.newSlot(val);
    this.back = (this.back + 1) % this.cap;
    this.size++;
  }

  /** Empty the ring and start both ends at cell `at`. */
  reset(at = 0): void {
    this.cells = this.cells.map(() => null);
    this.front = this.back = at;
    this.size = 0;
    this.out = [];
  }
}

class RingRecorder {
  readonly steps: Step[] = [];
  readonly cost: Cost = zeroCost();
  readonly tones = new Map<string, Tone>();
  readonly Q: RingQueue;
  private readonly op: string;
  private readonly cx: OpKey;
  private readonly code: CodeKey;

  constructor(Q: RingQueue, op: string, cx: OpKey, code: CodeKey) {
    this.Q = Q;
    this.op = op;
    this.cx = cx;
    this.code = code;
  }

  diagram(): Diagram {
    return ringDiagram(this.Q, this.tones);
  }

  push(kind: StepKind, head: string, body: string, line: number, extra: Partial<Step> = {}): void {
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
      ...extra,
    });
  }
}

export function ringDiagram(Q: RingQueue, tones: ReadonlyMap<string, Tone> = new Map()): Diagram {
  const items: Diagram['items'] = [];
  Q.cells.forEach((c, index) => {
    if (c)
      items.push({
        id: c.key,
        label: Q.labelOf(c.val),
        place: { at: 'cell', block: RING_BLOCK, index },
        tone: tones.get(c.key) ?? 'rest',
        addr: null,
      });
  });
  Q.out.forEach((e, index) =>
    items.push({ id: e.key, label: Q.labelOf(e.val), place: { at: 'out', index }, tone: 'out', addr: null }),
  );
  return {
    structure: 'queue',
    items,
    wires: [],
    flags: [
      { id: 'FRONT', label: 'FRONT', kind: 'field', to: cellRef(RING_BLOCK, Q.front) },
      { id: 'BACK', label: 'BACK', kind: 'field', to: cellRef(RING_BLOCK, Q.back) },
    ],
    blocks: [{ id: RING_BLOCK, kind: 'ring', cap: Q.cap, base: RING_BASE, row: 0, len: Q.size }],
    net: null,
    tray: 'OUT',
  };
}

const wrapNote = (from: number, cap: number, name: string): string =>
  from === cap - 1
    ? `${name} was on cell ${from}: (${from} + 1) % ${cap} = 0, so it wraps round to cell 0. In the ring, cell 0 simply comes after cell ${from}.`
    : `${name} moves on one cell: (${from} + 1) % ${cap} = ${from + 1}.`;

export function enqueue(Q: RingQueue, val: number): Recording {
  const title = `Enqueue ${val}`;
  const rec = new RingRecorder(Q, title, 'push', 'queue.enqueue');
  const start = rec.diagram();
  if (Q.size === Q.cap) {
    rec.push(
      'overflow',
      'Queue overflow: all 8 cells are full.',
      'BACK has come all the way round to FRONT. A fixed ring either refuses, as here, or copies itself into a bigger array.',
      0,
      { focus: cellRef(RING_BLOCK, Q.back), callout: { text: 'full', tone: 'red' } },
    );
    return { title, steps: rec.steps, start };
  }
  const at = Q.back,
    slot = Q.newSlot(val);
  Q.cells[at] = slot;
  rec.tones.set(slot.key, 'new');
  rec.cost.writes++;
  rec.push(
    'write',
    `Write ${val} into cell ${at}, where BACK points.`,
    'a[back] = v. The value goes straight into its cell: nothing else moves.',
    1,
    { focus: slot.key, callout: { text: `a[${at}] = ${val}` } },
  );
  Q.back = (at + 1) % Q.cap;
  Q.size++;
  rec.tones.delete(slot.key);
  rec.cost.writes++;
  rec.push(
    'move',
    Q.back === 0 ? 'BACK wraps round to cell 0.' : `BACK moves on to cell ${Q.back}.`,
    `${wrapNote(at, Q.cap, 'BACK')} ${plural(Q.size, 'value')} waiting. Enqueue is O(1).`,
    2,
    { focus: cellRef(RING_BLOCK, Q.back) },
  );
  return { title, steps: rec.steps, start };
}

export function dequeue(Q: RingQueue): Recording {
  const title = 'Dequeue';
  const rec = new RingRecorder(Q, title, 'pop', 'queue.dequeue');
  const start = rec.diagram();
  if (Q.size === 0) {
    rec.push(
      'underflow',
      'Queue underflow: nothing is waiting.',
      'FRONT and BACK point at the same cell and the size is 0.',
      0,
      { focus: cellRef(RING_BLOCK, Q.front), callout: { text: 'empty', tone: 'red' } },
    );
    return { title, steps: rec.steps, start };
  }
  const at = Q.front,
    slot = Q.cells[at] as RingSlot;
  rec.tones.set(slot.key, 'cur');
  rec.push(
    'read',
    `The front is ${slot.val}.`,
    Q.size > 1
      ? `It has waited longest: first in, first out. The ${plural(Q.size - 1, 'value')} behind it wait their turn.`
      : 'It is the only value waiting.',
    1,
    { focus: slot.key, callout: { text: `v = ${slot.val}`, tone: 'cobalt' } },
  );
  Q.front = (at + 1) % Q.cap;
  Q.size--;
  rec.tones.set(slot.key, 'gone');
  rec.cost.writes++;
  rec.push(
    'move',
    Q.front === 0 ? 'FRONT wraps round to cell 0.' : `FRONT moves on to cell ${Q.front}.`,
    `${wrapNote(at, Q.cap, 'FRONT')} Cell ${at} is free to be written again.`,
    2,
    { focus: cellRef(RING_BLOCK, Q.front) },
  );
  Q.cells[at] = null;
  rec.tones.delete(slot.key);
  Q.out.push({ key: slot.key, val: slot.val });
  if (Q.out.length > TRAY_SIZE) Q.out.shift();
  rec.push(
    'out',
    `Out comes ${slot.val}.`,
    `First in, first out. Dequeued so far, in order: ${Q.out.map(e => e.val).join(', ')}. No value moved to fill the gap: O(1).`,
    4,
    { focus: slot.key },
  );
  return { title, steps: rec.steps, start };
}

export function peek(Q: RingQueue): Recording {
  const title = 'Peek';
  const rec = new RingRecorder(Q, title, 'peek', 'queue.peek');
  const start = rec.diagram();
  if (Q.size === 0) {
    rec.push('underflow', 'Nothing to peek at.', 'The queue is empty.', 0, {
      focus: cellRef(RING_BLOCK, Q.front),
      callout: { text: 'empty', tone: 'red' },
    });
    return { title, steps: rec.steps, start };
  }
  const slot = Q.cells[Q.front] as RingSlot;
  rec.tones.set(slot.key, 'hit');
  rec.push(
    'read',
    `The front is ${slot.val}.`,
    'Peek reads a[front] without removing it: O(1). It is the next value out.',
    1,
    { focus: slot.key, callout: { text: String(slot.val), tone: 'cobalt' } },
  );
  return { title, steps: rec.steps, start };
}

/** Enqueue values one after another, then dequeue them all: the order comes back the same. */
export function fillAndEmpty(Q: RingQueue, values: readonly number[]): Recording {
  const start = ringDiagram(Q);
  const steps: Step[] = [];
  for (const v of values) steps.push(...enqueue(Q, v).steps);
  while (Q.size) steps.push(...dequeue(Q).steps);
  return { title: `Enqueue ${values.join(', ')}, then dequeue them all`, steps, start };
}
