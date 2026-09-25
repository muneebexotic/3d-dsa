// The AVL tree. Every operation runs instantly and records each step with a
// snapshot of the whole tree, so the page can animate it and rewind it.
// No DOM and no Three.js, so it is tested on its own.

import { plural } from '../../core/math';

export type Side = 'l' | 'r';
export type Kase = 'LL' | 'RR' | 'LR' | 'RL';
export type RotDir = 'left' | 'right';

export interface TreeNode {
  v: number;
  l: number | null;
  r: number | null;
  h: number;
  bf: number;
}
/** The whole tree at one moment. */
export interface Snap {
  root: number | null;
  n: Record<number, TreeNode>;
}

/** Where the value in hand is. */
export interface Visitor {
  v: number;
  /** Above the root. */
  top?: boolean;
  /** Resting above this node. */
  at?: number;
  /** At an empty hook. */
  hook?: { p: number; side: Side };
  /** Merging into this node (found). */
  merge?: number;
  fall?: boolean;
  shake?: boolean;
}
export interface Rotation {
  dir: RotDir;
  /** The node that goes down. */
  z: number;
  /** The node that comes up. */
  y: number;
  /** The subtree that changes sides. */
  t2: number | null;
  p: number | null;
  side: Side | null;
}

export type AvlStepKind =
  | 'start'
  | 'compare'
  | 'descend'
  | 'place'
  | 'update'
  | 'imbalance'
  | 'rotate'
  | 'found'
  | 'missing'
  | 'duplicate'
  | 'remove'
  | 'replace'
  | 'succ'
  | 'done'
  | 'clear';

export interface AvlStep {
  kind: AvlStepKind;
  /** The operation this step belongs to, e.g. "Insert 42". */
  op: string;
  snap: Snap;
  /** Nodes on the cobalt path. */
  path: number[];
  head: string;
  body: string;
  focus?: number | null;
  visitor?: Visitor;
  cmp?: { a: number; b: number; side: Side };
  cmpN?: number;
  from?: number;
  placed?: number;
  co?: { h: number; bf: number };
  child?: number;
  grand?: number | null;
  kase?: Kase;
  chip?: Kase;
  rot?: Rotation;
  part?: 1 | 2;
  removed?: number;
  lifted?: number | null;
  succ?: number;
}
type StepDetail = Omit<AvlStep, 'kind' | 'op' | 'snap' | 'path'>;

export const fmtBf = (b: number): string => (b > 0 ? `+${b}` : b < 0 ? `−${-b}` : '0');
const sideName = (s: Side) => (s === 'l' ? 'left' : 'right');

export class AVL {
  n: Record<number, TreeNode> = {};
  root: number | null = null;
  next = 1;

  get count(): number {
    return Object.keys(this.n).length;
  }
  h(id: number | null): number {
    return id == null ? 0 : this.n[id].h;
  }
  snap(): Snap {
    const n: Record<number, TreeNode> = {};
    for (const k in this.n) {
      const o = this.n[k];
      n[k] = { v: o.v, l: o.l, r: o.r, h: o.h, bf: o.bf };
    }
    return { root: this.root, n };
  }
  has(v: number): boolean {
    let c = this.root;
    while (c != null) {
      const o = this.n[c];
      if (o.v === v) return true;
      c = v < o.v ? o.l : o.r;
    }
    return false;
  }
  fix(id: number): void {
    const o = this.n[id];
    o.h = 1 + Math.max(this.h(o.l), this.h(o.r));
    o.bf = this.h(o.l) - this.h(o.r);
  }
  link(p: number | null, side: Side | null, id: number | null): void {
    if (p == null || side == null) this.root = id;
    else this.n[p][side] = id;
  }
  rotRight(z: number, p: number | null, side: Side | null): { y: number; t2: number | null } {
    const Z = this.n[z],
      y = Z.l as number,
      Y = this.n[y],
      t2 = Y.r;
    Z.l = t2;
    Y.r = z;
    this.link(p, side, y);
    this.fix(z);
    this.fix(y);
    return { y, t2 };
  }
  rotLeft(z: number, p: number | null, side: Side | null): { y: number; t2: number | null } {
    const Z = this.n[z],
      y = Z.r as number,
      Y = this.n[y],
      t2 = Y.l;
    Z.r = t2;
    Y.l = z;
    this.link(p, side, y);
    this.fix(z);
    this.fix(y);
    return { y, t2 };
  }
  /** Insert without keeping the steps (used for the opening tree). */
  quickInsert(v: number): void {
    opInsert(this, v);
  }
}

interface Ctx {
  path: number[];
  cmp: number;
}
type Push = (kind: AvlStepKind, o: StepDetail) => void;

function recorder(t: AVL, op: string): { steps: AvlStep[]; ctx: Ctx; push: Push } {
  const steps: AvlStep[] = [],
    ctx: Ctx = { path: [], cmp: 0 };
  const push: Push = (kind, o) => steps.push({ kind, op, snap: t.snap(), path: ctx.path.slice(), ...o });
  return { steps, ctx, push };
}

export const CASE_NOTE: Readonly<Record<Kase, string>> = {
  LL: 'single right rotation',
  RR: 'single left rotation',
  LR: 'left, then right',
  RL: 'right, then left',
};

/** Walk back up from the deepest changed node, fixing heights and rotating where needed. */
function retrace(t: AVL, anc: number[], push: Push, ctx: Ctx): void {
  const total = () => t.count;
  for (let i = anc.length - 1; i >= 0; i--) {
    const id = anc[i];
    const o = t.n[id];
    const h0 = o.h;
    t.fix(id);
    const parent = i > 0 ? anc[i - 1] : null;
    const ps: Side | null = parent == null ? null : t.n[parent].l === id ? 'l' : 'r';
    if (Math.abs(o.bf) <= 1) {
      const hTxt = o.h === h0 ? `height stays ${o.h}` : `height ${h0} → ${o.h}`;
      const bTxt =
        o.bf === 0
          ? 'Both sides are equally tall.'
          : `It leans ${o.bf > 0 ? 'left' : 'right'} by one level. That is still allowed.`;
      push('update', {
        focus: id,
        head: `Back at ${o.v}: ${hTxt}, balance ${fmtBf(o.bf)}.`,
        body: bTxt,
        co: { h: o.h, bf: o.bf },
      });
      if (o.h === h0) {
        ctx.path = [];
        push('done', {
          head: 'Balanced.',
          body: `${o.v}'s height did not change, so nothing above it can change either. ${plural(ctx.cmp, 'comparison')} for ${total()} values.`,
        });
        return;
      }
      continue;
    }
    const heavy: Side = o.bf > 0 ? 'l' : 'r';
    push('update', {
      focus: id,
      head: `Back at ${o.v}: balance ${fmtBf(o.bf)}.`,
      body: `Its ${sideName(heavy)} side is now two levels taller. The AVL rule allows a difference of one at most.`,
      co: { h: o.h, bf: o.bf },
    });
    const c = o[heavy] as number,
      C = t.n[c];
    const kase: Kase = o.bf > 0 ? (C.bf >= 0 ? 'LL' : 'LR') : C.bf <= 0 ? 'RR' : 'RL';
    const grand = kase === 'LR' ? C.r : kase === 'RL' ? C.l : null;
    let why: string;
    if (kase === 'LL' || kase === 'RR') {
      const d = kase === 'LL' ? 'right' : 'left',
        lean = kase === 'LL' ? 'left' : 'right';
      why =
        C.bf === 0
          ? `Its ${lean} child ${C.v} is level (0), so one ${d} rotation around ${o.v} is enough. This is the ${kase} case.`
          : `Its ${lean} child ${C.v} leans ${lean} too (${fmtBf(C.bf)}), so this is the ${kase} case. One ${d} rotation around ${o.v} fixes it.`;
    } else {
      const lean = kase === 'LR' ? 'left' : 'right',
        other = kase === 'LR' ? 'right' : 'left';
      why = `But its ${lean} child ${C.v} leans the other way (${fmtBf(C.bf)}). That bend is the ${kase} case: rotate ${other} around ${C.v}, then ${lean === 'left' ? 'right' : 'left'} around ${o.v}.`;
    }
    push('imbalance', {
      focus: id,
      child: c,
      grand,
      kase,
      head: `${o.v} is ${o.bf > 0 ? 'left' : 'right'}-heavy (balance ${fmtBf(o.bf)}).`,
      body: why,
      chip: kase,
    });
    let top: number;
    const rotText = (dir: RotDir, z: number, y: number, t2: number | null, part: 0 | 1 | 2) => {
      const Z = t.n[z],
        Y = t.n[y],
        zSide = dir === 'left' ? 'left' : 'right';
      const moved =
        t2 != null
          ? ` ${t.n[t2].v} moves across, from ${Y.v}'s ${zSide === 'left' ? 'left' : 'right'} to ${Z.v}'s ${zSide === 'left' ? 'right' : 'left'}. It still sits between them in sorted order.`
          : '';
      const head = part ? `Step ${part} of 2: rotate ${dir} around ${Z.v}.` : `Rotate ${dir} around ${Z.v}.`;
      const lead =
        part === 1
          ? `${Y.v} swings up above ${Z.v}, which straightens the bend into the ${kase === 'LR' ? 'LL' : 'RR'} shape.`
          : `${Y.v} swings up into ${Z.v}'s place and ${Z.v} swings down to become its ${zSide} child.`;
      return { head, body: `${lead}${moved} New heights: ${Z.v} is ${Z.h}, ${Y.v} is ${Y.h}.` };
    };
    if (kase === 'LL' || kase === 'RR') {
      const dir: RotDir = kase === 'LL' ? 'right' : 'left';
      const r = dir === 'right' ? t.rotRight(id, parent, ps) : t.rotLeft(id, parent, ps);
      push('rotate', {
        focus: r.y,
        rot: { dir, z: id, y: r.y, t2: r.t2, p: parent, side: ps },
        kase,
        chip: kase,
        ...rotText(dir, id, r.y, r.t2, 0),
      });
      top = r.y;
    } else {
      const d1: RotDir = kase === 'LR' ? 'left' : 'right',
        d2: RotDir = kase === 'LR' ? 'right' : 'left';
      const r1 = d1 === 'left' ? t.rotLeft(c, id, heavy) : t.rotRight(c, id, heavy);
      push('rotate', {
        focus: r1.y,
        rot: { dir: d1, z: c, y: r1.y, t2: r1.t2, p: id, side: heavy },
        kase,
        chip: kase,
        part: 1,
        ...rotText(d1, c, r1.y, r1.t2, 1),
      });
      const r2 = d2 === 'right' ? t.rotRight(id, parent, ps) : t.rotLeft(id, parent, ps);
      push('rotate', {
        focus: r2.y,
        rot: { dir: d2, z: id, y: r2.y, t2: r2.t2, p: parent, side: ps },
        kase,
        chip: kase,
        part: 2,
        ...rotText(d2, id, r2.y, r2.t2, 2),
      });
      top = r2.y;
    }
    anc[i] = top;
    if (t.n[top].h === h0) {
      ctx.path = [];
      push('done', {
        head: 'Balanced again.',
        body: `The rotated subtree is back to height ${h0}, so nothing above it changes. ${plural(ctx.cmp, 'comparison')} for ${total()} values.`,
      });
      return;
    }
  }
  ctx.path = [];
  push('done', {
    head: 'Done.',
    body: `Every node up to the top is within ±1. ${plural(ctx.cmp, 'comparison')} for ${total()} values.`,
  });
}

export function opInsert(t: AVL, v: number, note = ''): AvlStep[] {
  const { steps, ctx, push } = recorder(t, `Insert ${v}`);
  if (t.root == null) {
    push('start', {
      head: `Insert ${v}.`,
      body: `The wall is empty, so ${v} will hang at the top as the root.${note}`,
      visitor: { v, top: true },
    });
    const id = t.next++;
    t.n[id] = { v, l: null, r: null, h: 1, bf: 0 };
    t.root = id;
    ctx.path = [id];
    push('place', {
      focus: id,
      placed: id,
      head: `${v} is the root.`,
      body: 'A lone node has height 1 and balance 0.',
    });
    ctx.path = [];
    push('done', { head: 'Done.', body: 'One value on the wall. Insert more and watch it keep its balance.' });
    return steps;
  }
  push('start', {
    head: `Insert ${v}.`,
    body: `It starts at the top and follows the wires down, comparing at each disc.${note}`,
    visitor: { v, top: true },
  });
  const anc: number[] = [];
  let cur = t.root;
  ctx.path = [cur];
  for (;;) {
    const o = t.n[cur];
    ctx.cmp++;
    if (v === o.v) {
      push('duplicate', {
        focus: cur,
        visitor: { v, at: cur, shake: true },
        head: `${v} is already in the tree.`,
        body: 'An AVL tree stores each key once, so the insert stops here. Nothing changes.',
      });
      ctx.path = [];
      push('done', { head: 'No change.', body: `${v} was found after ${plural(ctx.cmp, 'comparison')}.` });
      return steps;
    }
    const side: Side = v < o.v ? 'l' : 'r',
      dir = sideName(side);
    push('compare', {
      focus: cur,
      visitor: { v, at: cur },
      cmp: { a: v, b: o.v, side },
      head: `${v} ${side === 'l' ? '<' : '>'} ${o.v}, so go ${dir}.`,
      body:
        side === 'l'
          ? `Everything hanging to the left of ${o.v} is smaller than ${o.v}.`
          : `Everything hanging to the right of ${o.v} is larger than ${o.v}.`,
    });
    anc.push(cur);
    const nx = o[side];
    if (nx == null) {
      push('descend', {
        focus: cur,
        visitor: { v, hook: { p: cur, side } },
        from: cur,
        head: `${o.v}'s ${dir} hook is empty.`,
        body: `${v} will hang there as a new leaf.`,
      });
      const id = t.next++;
      t.n[id] = { v, l: null, r: null, h: 1, bf: 0 };
      o[side] = id;
      ctx.path.push(id);
      push('place', {
        focus: id,
        placed: id,
        head: `${v} hangs as ${o.v}'s ${dir} child.`,
        body: 'A new leaf has height 1 and balance 0. Now walk back up, updating each ancestor.',
      });
      break;
    }
    ctx.path.push(nx);
    push('descend', {
      focus: nx,
      visitor: { v, at: nx },
      from: cur,
      head: `Down the ${dir} wire to ${t.n[nx].v}.`,
      body: `${plural(ctx.cmp, 'comparison')} so far.`,
    });
    cur = nx;
  }
  retrace(t, anc, push, ctx);
  return steps;
}

export function opSearch(t: AVL, v: number): AvlStep[] {
  const { steps, ctx, push } = recorder(t, `Search ${v}`);
  if (t.root == null) {
    push('start', { head: `Search for ${v}.`, body: 'The wall is empty.', visitor: { v, top: true } });
    push('missing', {
      visitor: { v, top: true, fall: true },
      head: `${v} is not in the tree.`,
      body: 'An empty tree holds nothing.',
    });
    return steps;
  }
  push('start', {
    head: `Search for ${v}.`,
    body: 'Start at the top and follow the wires, comparing at each disc.',
    visitor: { v, top: true },
  });
  let cur = t.root;
  ctx.path = [cur];
  for (;;) {
    const o = t.n[cur];
    ctx.cmp++;
    if (v === o.v) {
      push('found', {
        focus: cur,
        visitor: { v, merge: cur },
        cmpN: ctx.cmp,
        head: `Found ${v}.`,
        body: `${plural(ctx.cmp, 'comparison')} among ${t.count} values. The path can never be longer than the tree is tall, which is why search is O(log n).`,
      });
      ctx.path = [];
      push('done', {
        head: 'Done.',
        body: `Found in ${plural(ctx.cmp, 'comparison')}. A balanced tree with ${t.count} values is at most ${maxAvlHeight(t.count)} levels tall.`,
      });
      return steps;
    }
    const side: Side = v < o.v ? 'l' : 'r',
      dir = sideName(side);
    push('compare', {
      focus: cur,
      visitor: { v, at: cur },
      cmp: { a: v, b: o.v, side },
      head: `${v} ${side === 'l' ? '<' : '>'} ${o.v}, so go ${dir}.`,
      body:
        side === 'l'
          ? `If ${v} is here at all, it hangs to the left of ${o.v}.`
          : `If ${v} is here at all, it hangs to the right of ${o.v}.`,
    });
    const nx = o[side];
    if (nx == null) {
      push('missing', {
        focus: cur,
        visitor: { v, hook: { p: cur, side }, fall: true },
        from: cur,
        head: `${v} is not in the tree.`,
        body: `${o.v}'s ${dir} hook is empty, so there is nowhere left to look. ${plural(ctx.cmp, 'comparison')}.`,
      });
      ctx.path = [];
      push('done', {
        head: 'Done.',
        body: `Not found after ${plural(ctx.cmp, 'comparison')}. Even a miss only walks one path from top to bottom.`,
      });
      return steps;
    }
    ctx.path.push(nx);
    push('descend', {
      focus: nx,
      visitor: { v, at: nx },
      from: cur,
      head: `Down the ${dir} wire to ${t.n[nx].v}.`,
      body: `${plural(ctx.cmp, 'comparison')} so far.`,
    });
    cur = nx;
  }
}

export function opDelete(t: AVL, v: number): AvlStep[] {
  const { steps, ctx, push } = recorder(t, `Delete ${v}`);
  if (t.root == null) {
    push('start', { head: `Delete ${v}.`, body: 'The wall is empty.', visitor: { v, top: true } });
    push('missing', {
      visitor: { v, top: true, fall: true },
      head: `${v} is not in the tree.`,
      body: 'Nothing to delete.',
    });
    return steps;
  }
  push('start', {
    head: `Delete ${v}.`,
    body: 'First find it: follow the wires down from the top.',
    visitor: { v, top: true },
  });
  const anc: number[] = [];
  let cur = t.root;
  ctx.path = [cur];
  for (;;) {
    const o = t.n[cur];
    ctx.cmp++;
    if (v === o.v) break;
    const side: Side = v < o.v ? 'l' : 'r',
      dir = sideName(side);
    push('compare', {
      focus: cur,
      visitor: { v, at: cur },
      cmp: { a: v, b: o.v, side },
      head: `${v} ${side === 'l' ? '<' : '>'} ${o.v}, so go ${dir}.`,
      body:
        side === 'l'
          ? `If ${v} is here, it hangs to the left of ${o.v}.`
          : `If ${v} is here, it hangs to the right of ${o.v}.`,
    });
    const nx = o[side];
    if (nx == null) {
      push('missing', {
        focus: cur,
        visitor: { v, hook: { p: cur, side }, fall: true },
        from: cur,
        head: `${v} is not in the tree.`,
        body: `${o.v}'s ${dir} hook is empty. Nothing to delete.`,
      });
      ctx.path = [];
      push('done', { head: 'No change.', body: `${v} is not here, so the tree stays as it is.` });
      return steps;
    }
    anc.push(cur);
    ctx.path.push(nx);
    push('descend', {
      focus: nx,
      visitor: { v, at: nx },
      from: cur,
      head: `Down the ${dir} wire to ${t.n[nx].v}.`,
      body: `${plural(ctx.cmp, 'comparison')} so far.`,
    });
    cur = nx;
  }
  const d = cur,
    D = t.n[d];
  const parent = anc.length ? anc[anc.length - 1] : null;
  const pside: Side | null = parent == null ? null : t.n[parent].l === d ? 'l' : 'r';
  const kids = Number(D.l != null) + Number(D.r != null);
  push('found', {
    focus: d,
    visitor: { v, merge: d },
    head: `Found ${v}.`,
    body:
      kids === 0
        ? 'It is a leaf, so it can simply be lifted off.'
        : kids === 1
          ? `It has one child, ${t.n[(D.l ?? D.r) as number].v}, which will move up into its place.`
          : 'It has two children. Its place goes to its successor: the smallest value in its right subtree.',
  });
  let chain: number[];
  if (kids < 2) {
    const c = D.l ?? D.r;
    t.link(parent, pside, c);
    delete t.n[d];
    ctx.path = ctx.path.filter(x => x !== d);
    push('remove', {
      removed: d,
      lifted: c,
      head: c == null ? `Lift ${v} off its hook.` : `Lift ${v} out; ${t.n[c].v} moves up.`,
      body:
        c == null
          ? 'A leaf has nothing hanging below it, so removing it is safe.'
          : `${t.n[c].v}'s whole subtree takes ${v}'s hook. Left-to-right order does not change.`,
    });
    chain = anc.slice();
  } else {
    let s = D.r as number,
      sp = d;
    const sPath: number[] = [];
    ctx.path.push(s);
    push('succ', {
      focus: s,
      head: `Successor: one step right, to ${t.n[s].v}.`,
      body:
        t.n[s].l != null
          ? 'Then go left as far as possible.'
          : `${t.n[s].v} has no left child, so it is the successor.`,
    });
    while (t.n[s].l != null) {
      sPath.push(s);
      sp = s;
      s = t.n[s].l as number;
      ctx.path.push(s);
      push('succ', {
        focus: s,
        head: `Left to ${t.n[s].v}.`,
        body:
          t.n[s].l != null
            ? 'Keep going left.'
            : `${t.n[s].v} has no left child, so it is the successor: the next value after ${v}.`,
      });
    }
    const S = t.n[s],
      sr = S.r;
    if (sp === d) {
      S.l = D.l;
    } else {
      t.n[sp].l = sr;
      S.l = D.l;
      S.r = D.r;
    }
    S.h = D.h; // it inherits the spot, and the spot's last known height, until the walk up reaches it
    S.bf = D.bf;
    t.link(parent, pside, s);
    delete t.n[d];
    ctx.path = ctx.path.filter(x => x !== d);
    push('replace', {
      removed: d,
      succ: s,
      focus: s,
      head: `${S.v} takes ${v}'s place.`,
      body: `${v} is lifted out and ${S.v} moves up into its spot. ${S.v} is larger than everything on the left and smaller than everything on the right, so the order holds.${sr != null && sp !== d ? ` ${t.n[sr].v} moves up to ${S.v}'s old hook.` : ''}`,
    });
    chain = anc.concat([s], sPath);
  }
  if (!chain.length) {
    ctx.path = [];
    push('done', {
      head: 'Done.',
      body: t.root == null ? 'The wall is empty again.' : 'The top of the tree changed, and it is still balanced.',
    });
    return steps;
  }
  retrace(t, chain, push, ctx);
  return steps;
}

export function opClear(t: AVL): AvlStep[] {
  const { steps, push } = recorder(t, 'Clear');
  t.n = {};
  t.root = null;
  push('clear', { head: 'Cleared.', body: 'Every disc is lifted off the wall.' });
  return steps;
}

const DEMO = [30, 20, 10, 40, 50, 35, 15];
export const DEMO_INTRO = {
  head: 'Seven inserts, four rotations.',
  body: 'Watch for the red disc: each time one appears, the tree rotates it back into balance. The chips below tick off each case as it happens.',
};
const DEMO_NOTE: Readonly<Record<number, string>> = {
  10: ' Watch 30: this one tips it left twice over, the LL case.',
  50: ' This tips 30 the other way: the RR case.',
  35: ' This one makes a bend on the right: the RL case.',
  15: ' And the mirror image on the left: the LR case.',
};
/** Clear the wall, then seven inserts that show all four rotation cases. */
export function opDemo(t: AVL): AvlStep[] {
  const steps: AvlStep[] = [];
  if (t.root != null) steps.push(...opClear(t));
  for (const v of DEMO) steps.push(...opInsert(t, v, DEMO_NOTE[v] || ''));
  return steps;
}

/** The tallest an AVL tree with n nodes can be. */
export function maxAvlHeight(n: number): number {
  if (n <= 0) return 0;
  if (n < 2) return 1;
  let a = 1,
    b = 2,
    h = 2; // N(1) = 1, N(2) = 2
  for (;;) {
    const c = 1 + a + b;
    if (c > n) return h;
    a = b;
    b = c;
    h++;
  }
}
