// The recorder: it watches an operation run on a HashTable and, after each
// change, snapshots a Diagram of the table plus whatever is in motion (a key on
// the hub, a key hovering over its bucket, a pointer being rewritten).

import type { CodeKey } from './code';
import {
  bucketRef,
  cloneDiagram,
  keyId,
  ringId,
  zeroCost,
  type Cost,
  type DItem,
  type DLink,
  type Diagram,
  type DRing,
  type DTomb,
  type OpKey,
  type Place,
  type Step,
  type StepKind,
  type Tone,
} from './diagram';
import { TOMB, type HashTable, type Slot } from './table';

/** The arrangement a rehash is emptying: the old ring, or the same ring lifted into the air. */
export interface OldTable {
  m: number;
  ring: string;
  lifted: boolean;
  chains: number[][];
  slots: Slot[];
}

/** A key drawn somewhere other than where the table keeps it. */
interface Extra {
  key: number;
  place: Place;
  tone: Tone;
}

export type StepExtra = Partial<Pick<Step, 'focus' | 'callout' | 'wind' | 'link' | 'path' | 'wave'>>;

const headLink = (ring: string, i: number, up: boolean) => `h:${ring}:${i}${up ? ':up' : ''}`;
const nextLink = (ring: string, k: number, up: boolean) => `n:${ring}:${k}${up ? ':up' : ''}`;

export class Recorder {
  readonly T: HashTable;
  readonly steps: Step[] = [];
  readonly cost: Cost = zeroCost();
  /** Keys on the hub, hovering, or on their way out. */
  readonly extras = new Map<string, Extra>();
  readonly tones = new Map<string, Tone>();
  /** Chain pointers aimed somewhere other than the table says: an unlink in progress (null hides the pointer). */
  readonly linkTo = new Map<string, string | null>();
  /** Pointers being written in the next step; cleared after each step. */
  readonly hot = new Set<string>();
  /** Pointers followed so far. */
  readonly trail = new Set<string>();
  hand = 0;
  lit: string | null = null;
  old: OldTable | null = null;
  op: string;
  cx: OpKey;
  code: CodeKey;

  constructor(T: HashTable, op: string, cx: OpKey, code: CodeKey) {
    this.T = T;
    this.op = op;
    this.cx = cx;
    this.code = code;
  }

  get live(): string {
    return ringId(this.T.m);
  }

  /** The pointer into the chain position `level` of bucket i: the bucket's own, or the next pointer below it. */
  linkInto(i: number, level: number): string {
    return level === 0 ? headLink(this.live, i, false) : nextLink(this.live, this.T.chains[i][level - 1], false);
  }

  /** Pointers into a chain's keys, from its bucket up. A lifted chain has left its bucket behind. */
  private chainLinks(ring: string, i: number, c: readonly number[], up: boolean, out: DLink[]): void {
    c.forEach((k, j) => {
      if (up && j === 0) return;
      const id = j === 0 ? headLink(ring, i, up) : nextLink(ring, c[j - 1], up);
      const from = j === 0 ? bucketRef(ring, i) : keyId(c[j - 1]);
      const to = this.linkTo.has(id) ? this.linkTo.get(id) : keyId(k);
      if (to == null) return;
      out.push({ id, from, to, hot: this.hot.has(id), trail: this.trail.has(id), lifted: up || undefined });
    });
  }

  private place(items: DItem[], ring: string, chains: number[][], slots: Slot[], lifted: boolean): void {
    const add = (k: number, index: number, level: number) => {
      const id = keyId(k);
      if (this.extras.has(id)) return;
      items.push({
        id,
        key: k,
        place: { at: 'bucket', ring, index, level, lifted: lifted || undefined },
        tone: this.tones.get(id) ?? 'rest',
      });
    };
    if (this.T.strategy === 'chain') chains.forEach((c, i) => c.forEach((k, j) => add(k, i, j)));
    else slots.forEach((v, i) => v != null && v !== TOMB && add(v, i, 0));
  }

  diagram(): Diagram {
    const T = this.T,
      live = this.live,
      O = this.old;
    const rings: DRing[] = [];
    if (O && !O.lifted) rings.push({ id: O.ring, m: O.m, role: 'old' });
    rings.push({ id: live, m: T.m, role: 'live' });
    const items: DItem[] = [];
    if (O) this.place(items, O.ring, O.chains, O.slots, O.lifted);
    this.place(items, live, T.chains, T.slots, false);
    for (const [id, e] of this.extras) items.push({ id, key: e.key, place: { ...e.place }, tone: e.tone });
    const tombs: DTomb[] = [];
    if (T.strategy === 'probe')
      T.slots.forEach((v, i) => v === TOMB && tombs.push({ id: `x:${live}:${i}`, ring: live, index: i }));
    const links: DLink[] = [];
    if (T.strategy === 'chain') {
      if (O) O.chains.forEach((c, i) => this.chainLinks(O.ring, i, c, O.lifted, links));
      T.chains.forEach((c, i) => this.chainLinks(live, i, c, false, links));
    }
    const oldN = O
      ? T.strategy === 'chain'
        ? O.chains.flat().length
        : O.slots.filter(v => v != null && v !== TOMB).length
      : 0;
    return {
      strategy: T.strategy,
      hash: T.hash,
      rings,
      items,
      tombs,
      links,
      hand: this.hand,
      lit: this.lit,
      n: T.n + oldN,
      m: T.m,
    };
  }

  /** Record a step; clears the hot pointers afterwards. */
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
      ledger: this.T.ledger.length,
      ...extra,
    });
    this.hot.clear();
  }

  /** Stop painting any key as the one in hand. */
  calm(): void {
    for (const [id, t] of this.tones) if (t === 'cur') this.tones.delete(id);
  }
}
