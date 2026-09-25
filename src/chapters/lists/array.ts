// A dynamic array: values side by side in one block of memory. Any index is one
// sum away, but opening or closing a gap shifts everything after it, and a full
// block has to be copied into one twice the size.

import { plural } from '../../core/math';
import type { CodeKey } from './code';
import type { OpKey } from './complexity';
import {
  cellRef,
  cloneDiagram,
  zeroCost,
  type Cost,
  type DBlock,
  type DFlag,
  type Diagram,
  type Recording,
  type Step,
  type StepKind,
  type Tone,
} from './diagram';
import { addrText } from './memory';

export const MAX_ARRAY = 16;
const FIRST_BASE = 0x40;

export interface ArrSlot {
  key: string;
  val: number;
}

export class DynArray {
  cap: number;
  len = 0;
  cells: (ArrSlot | null)[];
  /** Which block is in use; each grow allocates the next. */
  block = 1;
  base = FIRST_BASE;
  private nextKey = 1;

  constructor(cap = 8) {
    this.cap = cap;
    this.cells = Array.from({ length: cap }, () => null);
  }

  get blockId(): string {
    return `A${this.block}`;
  }

  newSlot(val: number): ArrSlot {
    return { key: `A-${this.nextKey++}`, val };
  }

  values(): number[] {
    return this.cells.slice(0, this.len).map(c => (c as ArrSlot).val);
  }

  /** Address of cell i. */
  addr(i: number): number {
    return this.base + 4 * i;
  }

  quickAppend(val: number): void {
    if (this.len === this.cap) {
      this.cap *= 2;
      this.cells.length = this.cap;
      this.cells.fill(null, this.len);
    }
    this.cells[this.len++] = this.newSlot(val);
  }

  clear(): void {
    this.cells.fill(null);
    this.len = 0;
  }
}

/** A block being filled while the array grows. */
interface Growing {
  id: string;
  cap: number;
  base: number;
  cells: (ArrSlot | null)[];
}

class ArrayRecorder {
  readonly steps: Step[] = [];
  readonly cost: Cost = zeroCost();
  readonly tones = new Map<string, Tone>();
  readonly vars = new Map<string, number>();
  growing: Growing | null = null;
  /** Values copied by a grow, counted apart from shifts in the summary. */
  copies = 0;
  readonly A: DynArray;
  private readonly op: string;
  private readonly cx: OpKey;
  private readonly code: CodeKey;

  constructor(A: DynArray, op: string, cx: OpKey, code: CodeKey) {
    this.A = A;
    this.op = op;
    this.cx = cx;
    this.code = code;
  }

  diagram(): Diagram {
    return arrayDiagram(this.A, this.tones, this.vars, this.growing);
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

  cell(i: number): string {
    return cellRef(this.A.blockId, i);
  }
}

export function arrayDiagram(
  A: DynArray,
  tones: ReadonlyMap<string, Tone> = new Map(),
  vars: ReadonlyMap<string, number> = new Map(),
  growing: Growing | null = null,
): Diagram {
  const items: Diagram['items'] = [];
  const blocks: DBlock[] = [{ id: A.blockId, kind: 'array', cap: A.cap, base: A.base, row: 0, len: A.len }];
  const add = (block: string, cells: (ArrSlot | null)[]) =>
    cells.forEach((c, index) => {
      if (c)
        items.push({
          id: c.key,
          label: String(c.val),
          place: { at: 'cell', block, index },
          tone: tones.get(c.key) ?? 'rest',
          addr: null,
        });
    });
  add(A.blockId, A.cells);
  if (growing) {
    blocks.push({ id: growing.id, kind: 'array', cap: growing.cap, base: growing.base, row: 1, len: 0 });
    add(growing.id, growing.cells);
  }
  const flags: DFlag[] = [...vars].map(([name, i]) => ({
    id: name,
    label: name,
    kind: 'var',
    to: cellRef(A.blockId, i),
  }));
  return { structure: 'array', items, wires: [], flags, blocks, net: null, tray: null };
}

function nothing(A: DynArray, title: string, cx: OpKey, code: CodeKey, head: string, body: string): Recording {
  const rec = new ArrayRecorder(A, title, cx, code);
  const start = rec.diagram();
  rec.push('empty', head, body, -1);
  return { title, steps: rec.steps, start };
}

const hex = addrText;

export function get(A: DynArray, i: number): Recording {
  const title = `Get index ${i}`;
  if (!A.len) return nothing(A, title, 'access', 'array.get', 'The array is empty.', 'There is no index 0 to read.');
  if (!Number.isInteger(i) || i < 0 || i >= A.len)
    return nothing(
      A,
      title,
      'access',
      'array.get',
      `There is no index ${i}.`,
      `This array holds ${plural(A.len, 'value')}, at index 0 to ${A.len - 1}.`,
    );
  const rec = new ArrayRecorder(A, title, 'access', 'array.get');
  const start = rec.diagram();
  const slot = A.cells[i] as ArrSlot;
  rec.vars.set('I', i);
  rec.tones.set(slot.key, 'hit');
  rec.cost.jumps++;
  rec.push(
    'jump',
    `a[${i}] is ${slot.val}.`,
    `Every cell is 4 bytes and they sit side by side, so cell ${i} is at ${hex(A.base)} + 4 × ${i} = ${hex(A.addr(i))}. One sum, one jump: index ${i} costs the same as index 0, O(1).`,
    0,
    {
      focus: slot.key,
      jump: { from: rec.cell(0), to: rec.cell(i) },
      callout: { text: `${hex(A.base)} + 4 × ${i}`, tone: 'cobalt' },
    },
  );
  return { title, steps: rec.steps, start };
}

export function search(A: DynArray, val: number): Recording {
  const title = `Search for ${val}`;
  if (!A.len) return nothing(A, title, 'search', 'array.search', 'The array is empty.', `${val} is not here.`);
  const rec = new ArrayRecorder(A, title, 'search', 'array.search');
  const start = rec.diagram();
  for (let i = 0; i < A.len; i++) {
    const slot = A.cells[i] as ArrSlot;
    rec.vars.set('I', i);
    rec.cost.compares++;
    if (slot.val === val) {
      rec.tones.set(slot.key, 'hit');
      rec.push(
        'found',
        `Found ${val} at index ${i}.`,
        `${plural(rec.cost.compares, 'comparison')}. Jumping to an index is instant, but finding a value still means looking at each one in turn: O(n), just like a list.`,
        1,
        { focus: slot.key, callout: { text: `= ${val}`, tone: 'cobalt' } },
      );
      return { title, steps: rec.steps, start };
    }
    rec.push('scan', `a[${i}] is ${slot.val}, not ${val}.`, 'Move on to the next cell.', 1, {
      focus: slot.key,
      callout: { text: `${slot.val} ≠ ${val}` },
    });
  }
  rec.vars.clear();
  rec.push(
    'missing',
    `${val} is not in the array.`,
    `All ${plural(A.len, 'value')} checked: O(n). If the values were sorted, a binary search could jump to the middle and halve the search each time.`,
    2,
    { callout: { text: 'not found', tone: 'red' } },
  );
  return { title, steps: rec.steps, start };
}

export function insert(A: DynArray, i: number, val: number): Recording {
  const where = i === 0 ? 'at the front' : i === A.len ? 'at the end' : `at index ${i}`;
  const title = `Insert ${val} ${where}`;
  const cx: OpKey = i === 0 ? 'insHead' : i === A.len ? 'insTail' : 'insAt';
  if (!Number.isInteger(i) || i < 0 || i > A.len)
    return nothing(
      A,
      title,
      cx,
      'array.insert',
      `There is no index ${i} to insert at.`,
      `This array holds ${plural(A.len, 'value')}, so a new value can go at index 0 to ${A.len}.`,
    );
  if (A.len >= MAX_ARRAY)
    return nothing(A, title, cx, 'array.insert', `The plinth holds ${MAX_ARRAY} cells.`, 'Delete a value first.');
  const rec = new ArrayRecorder(A, title, cx, 'array.insert');
  const start = rec.diagram();
  if (A.len === A.cap) grow(rec);
  for (let j = A.len; j > i; j--) {
    const slot = A.cells[j - 1] as ArrSlot;
    A.cells[j] = slot;
    A.cells[j - 1] = null;
    rec.vars.set('J', j);
    rec.cost.shifts++;
    rec.push(
      'shift',
      `Shift ${slot.val} right, from a[${j - 1}] to a[${j}].`,
      `Opening a gap at index ${i} means moving every value after it, one cell each, starting from the end so nothing is overwritten. ${plural(rec.cost.shifts, 'shift')} so far.`,
      5,
      { focus: slot.key },
    );
  }
  rec.vars.delete('J');
  const slot = A.newSlot(val);
  A.cells[i] = slot;
  rec.vars.set('I', i);
  rec.tones.set(slot.key, 'new');
  rec.cost.writes++;
  rec.push('write', `Write ${val} into a[${i}].`, `a[${i}] = ${val}.`, 6, { focus: slot.key });
  A.len++;
  rec.tones.delete(slot.key);
  rec.vars.clear();
  const shifted = rec.cost.shifts - rec.copies;
  rec.push(
    'done',
    `${val} is at index ${i}.`,
    (shifted
      ? `${plural(shifted, 'value')} shifted to make room: O(n). A linked list would change two pointers instead, once it had walked to the spot.`
      : 'Nothing had to shift, because the gap was already at the end. Appending is O(1) while there is room.') +
      (rec.copies ? ` The grow copied ${plural(rec.copies, 'value')} as well.` : ''),
    7,
    { focus: slot.key },
  );
  return { title, steps: rec.steps, start };
}

/** Copy the full array into a block twice the size, then free the old block. */
function grow(rec: ArrayRecorder): void {
  const A = rec.A;
  const G: Growing = {
    id: `A${A.block + 1}`,
    cap: A.cap * 2,
    base: A.base + 4 * A.cap + 0x10,
    cells: Array.from({ length: A.cap * 2 }, () => null),
  };
  rec.growing = G;
  rec.push(
    'grow',
    `The array is full: ${A.len} of ${A.cap} cells.`,
    `The bytes right after it belong to something else, so it cannot just get longer. Ask for a new block of ${G.cap} cells, at ${hex(G.base)}.`,
    1,
    { focus: cellRef(G.id, 0) },
  );
  for (let j = 0; j < A.len; j++) {
    const slot = A.cells[j] as ArrSlot;
    G.cells[j] = slot;
    A.cells[j] = null;
    rec.cost.shifts++;
    rec.copies++;
    rec.push('copy', `Copy ${slot.val} into the new block.`, `b[${j}] = a[${j}].`, 2, { focus: slot.key });
  }
  A.cells = G.cells;
  A.cap = G.cap;
  A.base = G.base;
  A.block++;
  rec.growing = null;
  rec.push(
    'retire',
    'Free the old block.',
    `The copy cost O(n), but it only happens each time the array doubles, so spread over every append it averages out to O(1): amortized constant time.`,
    3,
  );
}

export function remove(A: DynArray, i: number): Recording {
  const title = `Delete index ${i}`;
  const cx: OpKey = i === 0 ? 'delHead' : i === A.len - 1 ? 'delTail' : 'delAt';
  if (!A.len) return nothing(A, title, cx, 'array.delete', 'The array is empty.', 'There is nothing to delete.');
  if (!Number.isInteger(i) || i < 0 || i >= A.len)
    return nothing(
      A,
      title,
      cx,
      'array.delete',
      `There is no index ${i}.`,
      `This array holds ${plural(A.len, 'value')}, at index 0 to ${A.len - 1}.`,
    );
  const rec = new ArrayRecorder(A, title, cx, 'array.delete');
  const start = rec.diagram();
  const gone = A.cells[i] as ArrSlot;
  A.cells[i] = null;
  rec.vars.set('I', i);
  rec.push('lift', `Take ${gone.val} out of a[${i}].`, 'That leaves a hole in the middle of the block.', 0, {
    focus: rec.cell(i),
    callout: { text: String(gone.val), tone: 'red' },
  });
  rec.vars.delete('I');
  for (let j = i; j < A.len - 1; j++) {
    const slot = A.cells[j + 1] as ArrSlot;
    A.cells[j] = slot;
    A.cells[j + 1] = null;
    rec.vars.set('J', j);
    rec.cost.shifts++;
    rec.push(
      'shift',
      `Shift ${slot.val} left, from a[${j + 1}] to a[${j}].`,
      `An array cannot have holes: every value after the gap moves down one. ${plural(rec.cost.shifts, 'shift')} so far.`,
      2,
      { focus: slot.key },
    );
  }
  A.len--;
  rec.vars.clear();
  rec.push(
    'done',
    `${gone.val} is gone.`,
    rec.cost.shifts
      ? `${plural(rec.cost.shifts, 'value')} shifted left: O(n). A linked list just points around the node, once it has walked there.`
      : 'It was the last value, so nothing had to move: deleting from the end of an array is O(1).',
    3,
  );
  return { title, steps: rec.steps, start };
}

export function reverse(A: DynArray): Recording {
  const title = 'Reverse';
  if (!A.len)
    return nothing(A, title, 'reverse', 'array.reverse', 'The array is empty.', 'It reads the same both ways.');
  const rec = new ArrayRecorder(A, title, 'reverse', 'array.reverse');
  const start = rec.diagram();
  let L = 0,
    R = A.len - 1;
  rec.vars.set('L', L);
  rec.vars.set('R', R);
  rec.push(
    'start',
    'L starts at the front, R at the back.',
    'Swap the two ends, then step both inward until they meet. An array reverses by moving values; a linked list by turning pointers.',
    0,
    { focus: rec.cell(L) },
  );
  while (L < R) {
    const a = A.cells[L] as ArrSlot,
      b = A.cells[R] as ArrSlot;
    A.cells[L] = b;
    A.cells[R] = a;
    rec.cost.shifts += 2;
    rec.push('swap', `Swap ${a.val} and ${b.val}.`, `a[${L}] and a[${R}] trade places.`, 2, { focus: a.key });
    L++;
    R--;
    rec.vars.set('L', Math.min(L, A.len - 1));
    rec.vars.set('R', Math.max(R, 0));
    rec.push(
      'advance',
      L < R ? `L moves to ${L}, R to ${R}.` : L === R ? `L and R meet at ${L}.` : 'L and R have passed each other.',
      L < R ? 'Both step toward the middle.' : 'Every pair is swapped; the middle value, if any, stays put.',
      L < R ? 3 : 1,
      { focus: rec.cell(Math.min(L, A.len - 1)) },
    );
  }
  rec.vars.clear();
  rec.push('done', 'Reversed.', `${plural(Math.floor(A.len / 2), 'swap')}: O(n) time, and no extra memory.`, -1);
  return { title, steps: rec.steps, start };
}
