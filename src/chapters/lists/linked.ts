// Linked nodes in memory, shared by the singly and doubly linked lists and the
// stack, and the recorder that snapshots them step by step. Plain data: no DOM.

import type { CodeKey } from './code';
import type { OpKey } from './complexity';
import {
  cloneDiagram,
  zeroCost,
  type Cost,
  type DFlag,
  type DItem,
  type Diagram,
  type DWire,
  type Step,
  type StepKind,
  type Structure,
  type Tone,
} from './diagram';
import { Memory } from './memory';

export interface LNode {
  id: number;
  val: number;
  addr: number;
  next: number | null;
  prev: number | null;
}

/** Values taken off a stack or queue, newest last. The tray keeps the last few. */
export interface OutEntry {
  key: string;
  val: number;
}
export const TRAY_SIZE = 7;

/**
 * Nodes that live at addresses in a Memory and point at each other. The chain is
 * whatever you reach by following `next` from `head`; a node nothing reaches is
 * garbage until it is released.
 */
export class LinkedList {
  readonly structure: 'singly' | 'doubly' | 'stack';
  readonly doubly: boolean;
  readonly mem: Memory;
  /** How a value is written on its disc. */
  readonly labelOf: (val: number) => string;
  nodes = new Map<number, LNode>();
  head: number | null = null;
  tail: number | null = null;
  /** Stack only: what has been popped, for the tray. */
  out: OutEntry[] = [];
  private nextId = 1;
  private readonly prefix: string;

  constructor(structure: 'singly' | 'doubly' | 'stack', seed: number, labelOf: (val: number) => string = String) {
    this.structure = structure;
    this.labelOf = labelOf;
    this.doubly = structure === 'doubly';
    this.prefix = { singly: 'S', doubly: 'D', stack: 'K' }[structure];
    this.mem = new Memory(seed);
  }

  /** The item id a node is drawn as. */
  key(id: number): string {
    return `${this.prefix}${id}`;
  }

  node(id: number): LNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`No node ${id}`);
    return n;
  }

  /** Node ids from head to tail, following next. */
  order(): number[] {
    const out: number[] = [],
      seen = new Set<number>();
    let c = this.head;
    while (c != null && !seen.has(c)) {
      seen.add(c);
      out.push(c);
      c = this.nodes.get(c)?.next ?? null;
    }
    return out;
  }

  get size(): number {
    return this.order().length;
  }

  values(): number[] {
    return this.order().map(id => this.node(id).val);
  }

  /** A new, unlinked node somewhere in memory. */
  create(val: number): LNode {
    const n: LNode = { id: this.nextId++, val, addr: this.mem.alloc(), next: null, prev: null };
    this.nodes.set(n.id, n);
    return n;
  }

  release(id: number): void {
    const n = this.nodes.get(id);
    if (!n) return;
    this.mem.release(n.addr);
    this.nodes.delete(id);
  }

  /** Append without recording anything: for the opening contents. */
  quickAppend(val: number): void {
    const n = this.create(val);
    if (this.tail != null) {
      this.node(this.tail).next = n.id;
      if (this.doubly) n.prev = this.tail;
    } else this.head = n.id;
    this.tail = n.id;
  }

  /** Push onto the head without recording anything (stacks). */
  quickPushHead(val: number): void {
    const n = this.create(val);
    n.next = this.head;
    this.head = n.id;
    if (this.tail == null) this.tail = n.id;
  }

  clear(): void {
    for (const id of [...this.nodes.keys()]) this.release(id);
    this.head = this.tail = null;
    this.out = [];
  }
}

/** A named pointer as the recorder tracks it. */
interface Hand {
  to: number | null;
  nullAt?: DFlag['nullAt'];
}

/** Variables drawn as cobalt hands; the node under CUR or GONE is painted as the node in hand. */
const HANDS = new Set(['CUR', 'GONE']);

/**
 * Records one operation on a LinkedList: after each change it snapshots the
 * nodes, their pointers, the named pointers and where each node sits in the drawing.
 */
export class ChainRecorder {
  readonly steps: Step[] = [];
  readonly cost: Cost = zeroCost();
  /** Where each node sits: its slot along the chain, or its level in a stack. */
  readonly slots = new Map<number, number>();
  /** Nodes drawn in front of the chain (lists) or hovering above it (stacks). */
  readonly loose = new Set<number>();
  readonly tones = new Map<number, Tone>();
  readonly vars = new Map<string, Hand>();
  /** Wires being written in the next step; cleared after each step. */
  readonly hot = new Set<string>();
  /** Wires followed so far. */
  readonly trail = new Set<string>();
  readonly L: LinkedList;
  private readonly op: string;
  private readonly cx: OpKey;
  private readonly code: CodeKey;

  constructor(L: LinkedList, op: string, cx: OpKey, code: CodeKey) {
    this.L = L;
    this.op = op;
    this.cx = cx;
    this.code = code;
    this.tidy();
  }

  /** Lay the chain out in order again: lists left to right, stacks bottom to top. */
  tidy(): void {
    this.slots.clear();
    this.loose.clear();
    const order = this.L.order();
    if (this.L.structure === 'stack') order.forEach((id, i) => this.slots.set(id, order.length - 1 - i));
    else order.forEach((id, i) => this.slots.set(id, i));
  }

  wireId(id: number, role: 'next' | 'prev'): string {
    return `${this.L.key(id)}.${role}`;
  }

  diagram(): Diagram {
    const L = this.L,
      stack = L.structure === 'stack';
    const inHand = new Set<number>();
    for (const [name, h] of this.vars) if (HANDS.has(name) && h.to != null) inHand.add(h.to);
    const items: DItem[] = [];
    const wires: DWire[] = [];
    for (const n of L.nodes.values()) {
      const key = L.key(n.id),
        slot = this.slots.get(n.id) ?? 0;
      items.push({
        id: key,
        label: L.labelOf(n.val),
        place: stack
          ? { at: 'stack', level: slot, hover: this.loose.has(n.id) }
          : { at: 'chain', slot, loose: this.loose.has(n.id) },
        tone: this.tones.get(n.id) ?? (inHand.has(n.id) ? 'cur' : 'rest'),
        addr: n.addr,
      });
      const roles: ('next' | 'prev')[] = L.doubly ? ['next', 'prev'] : ['next'];
      for (const role of roles) {
        const id = this.wireId(n.id, role),
          to = n[role];
        wires.push({
          id,
          from: key,
          role,
          to: to == null ? null : L.key(to),
          hot: this.hot.has(id),
          trail: this.trail.has(id),
        });
      }
    }
    for (const [i, e] of L.out.entries())
      items.push({ id: e.key, label: L.labelOf(e.val), place: { at: 'out', index: i }, tone: 'out', addr: null });
    const ref = (id: number | null) => (id == null ? null : L.key(id));
    const flags: DFlag[] = stack
      ? [{ id: 'TOP', label: 'TOP', kind: 'field', to: ref(L.head), nullAt: 'base' }]
      : [
          { id: 'HEAD', label: 'HEAD', kind: 'field', to: ref(L.head), nullAt: 'left' },
          { id: 'TAIL', label: 'TAIL', kind: 'field', to: ref(L.tail), nullAt: 'right' },
        ];
    for (const [name, h] of this.vars)
      flags.push({ id: name, label: name, kind: 'var', to: ref(h.to), nullAt: h.nullAt ?? 'right' });
    return {
      structure: L.structure as Structure,
      items,
      wires,
      flags,
      blocks: [],
      net: null,
      tray: stack ? 'OUT' : null,
    };
  }

  /** Record a step; clears the hot wires afterwards. */
  push(
    kind: StepKind,
    head: string,
    body: string,
    line: number,
    extra: Partial<Pick<Step, 'focus' | 'callout' | 'wire' | 'hop'>> = {},
  ): void {
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
    this.hot.clear();
  }

  /** Point a variable at a node (or at null). */
  hand(name: string, to: number | null, nullAt?: DFlag['nullAt']): void {
    this.vars.set(name, { to, nullAt });
  }
}
