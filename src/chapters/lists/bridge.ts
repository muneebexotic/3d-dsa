// The bridge to No. 2: one search loop that takes knots out of a box and puts
// their neighbors in. With a stack as the box it dives (DFS); with a queue it
// spreads in rings (BFS). Only take() differs.

import { plural } from '../../core/math';
import {
  cloneDiagram,
  knotRef,
  zeroCost,
  type DNet,
  type Diagram,
  type KnotState,
  type Recording,
  type Step,
} from './diagram';
import { ChainRecorder, LinkedList } from './linked';
import { RingQueue, ringDiagram } from './queue';

export type BridgeKind = 'dfs' | 'bfs';

/** The little graph: seven knots, one loop, so each search has one knot it meets twice. */
export const BRIDGE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const BRIDGE_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [4, 6],
  [5, 6],
];

/** Neighbors in alphabetical order. */
export function neighbors(k: number): number[] {
  const out: number[] = [];
  for (const [a, b] of BRIDGE_EDGES) {
    if (a === k) out.push(b);
    else if (b === k) out.push(a);
  }
  return out.sort((p, q) => p - q);
}

const label = (k: number): string => BRIDGE_LABELS[k];

interface Box {
  put(k: number): string;
  take(): { k: number; key: string };
  readonly size: number;
  diagram(tones: Map<string, 'cur'>): Diagram;
  /** The taken disc goes onto the tray of visited knots. */
  keep(key: string, k: number): void;
}

function stackBox(): Box {
  const S = new LinkedList('stack', 5, label);
  const rec = new ChainRecorder(S, '', 'push', 'bridge.search');
  return {
    put(k) {
      const n = S.create(k);
      n.next = S.head;
      S.head = n.id;
      rec.tidy();
      return S.key(n.id);
    },
    take() {
      const id = S.head as number,
        n = S.node(id);
      S.head = n.next;
      S.release(id);
      rec.tidy();
      return { k: n.val, key: S.key(id) };
    },
    get size() {
      return S.size;
    },
    diagram() {
      return rec.diagram();
    },
    keep(key, k) {
      S.out.push({ key, val: k });
    },
  };
}

function queueBox(): Box {
  const Q = new RingQueue(label);
  return {
    put(k) {
      const slot = Q.newSlot(k);
      Q.cells[Q.back] = slot;
      Q.back = (Q.back + 1) % Q.cap;
      Q.size++;
      return slot.key;
    },
    take() {
      const slot = Q.cells[Q.front];
      if (!slot) throw new Error('Queue is empty');
      Q.cells[Q.front] = null;
      Q.front = (Q.front + 1) % Q.cap;
      Q.size--;
      return { k: slot.val, key: slot.key };
    },
    get size() {
      return Q.size;
    },
    diagram() {
      return ringDiagram(Q);
    },
    keep(key, k) {
      Q.out.push({ key, val: k });
    },
  };
}

/** Run the loop with a stack (DFS) or a queue (BFS), from knot A. */
export function bridgeSearch(kind: BridgeKind): Recording & { order: string[] } {
  const dfs = kind === 'dfs';
  const box = dfs ? stackBox() : queueBox();
  const boxName = dfs ? 'stack' : 'queue';
  const title = dfs ? 'A stack drives DFS' : 'A queue drives BFS';
  const st: KnotState[] = BRIDGE_LABELS.map(() => 'unseen');
  const hot = new Set<string>();
  const cost = zeroCost();
  const steps: Step[] = [];
  const order: string[] = [];
  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const net = (): DNet => ({
    knots: BRIDGE_LABELS.map((l, k) => ({ id: knotRef(l), label: l, st: st[k] })),
    edges: BRIDGE_EDGES.map(([a, b]) => ({
      a: knotRef(label(a)),
      b: knotRef(label(b)),
      hot: hot.has(edgeKey(a, b)),
    })),
  });
  const snap = (): Diagram => {
    const d = box.diagram(new Map());
    return { ...d, structure: dfs ? 'stack' : 'queue', net: net(), tray: 'VISITED' };
  };
  const push = (kind: Step['kind'], head: string, body: string, line: number, extra: Partial<Step> = {}) => {
    steps.push({
      kind,
      op: title,
      cx: kind === 'put' ? 'push' : 'pop',
      diag: cloneDiagram(snap()),
      head,
      body,
      code: 'bridge.search',
      line,
      cost: { ...cost },
      ...extra,
    });
    hot.clear();
  };
  const start = snap();

  const put = (k: number, from: number | null, line: number) => {
    const key = box.put(k);
    if (st[k] === 'unseen') st[k] = 'wait';
    if (from != null) hot.add(edgeKey(from, k));
    cost.writes++;
    const where = dfs ? 'on top of the stack' : 'at the back of the queue';
    push(
      'put',
      from == null ? `Put ${label(k)} ${where}.` : `${label(k)} is not visited yet: put it ${where}.`,
      from == null
        ? `The search starts from ${label(k)}. From here on, the loop is the same whatever the box is: take a knot out, visit it, put its unvisited neighbors in.`
        : `${plural(box.size, 'knot')} waiting in the ${boxName}.`,
      line,
      { focus: key, fly: { from: knotRef(label(k)), item: key } },
    );
  };

  put(0, null, 0);
  let active: number | null = null;
  while (box.size) {
    const { k, key } = box.take();
    cost.compares++;
    if (st[k] === 'done' || st[k] === 'active') {
      push(
        'skip',
        `Take ${label(k)}: already visited, skip it.`,
        `${label(k)} went into the ${boxName} twice, once from each neighbor, before it was visited. The second copy is thrown away.`,
        3,
        { focus: knotRef(label(k)), callout: { text: 'visited', tone: 'red' } },
      );
      continue;
    }
    if (active != null) st[active] = 'done';
    st[k] = 'active';
    active = k;
    order.push(label(k));
    box.keep(key, k);
    push(
      'take',
      `Take ${label(k)} from the ${dfs ? 'top' : 'front'}: visit no. ${order.length}.`,
      dfs
        ? `A stack hands back the newest knot, so the search keeps diving down the path it just found. Visited so far: ${order.join(' ')}.`
        : `A queue hands back the oldest knot, so the search finishes each ring before the next. Visited so far: ${order.join(' ')}.`,
      4,
      { focus: knotRef(label(k)) },
    );
    for (const y of neighbors(k)) if (st[y] !== 'done' && st[y] !== 'active') put(y, k, 6);
  }
  if (active != null) st[active] = 'done';
  push(
    'done',
    `The ${boxName} is empty: ${order.join(' ')}.`,
    dfs
      ? 'DFS dived round the whole loop before backing up for D. Make take() hand back the oldest knot instead, and the same loop is BFS.'
      : 'BFS went ring by ring: A, then one string away, then two, then three. Make take() hand back the newest knot instead, and the same loop is DFS.',
    1,
  );
  return { title, steps, start, order };
}
