// A trie. Every node keeps one slot per letter, A to Z, and a mark for a word
// that ends there, so following a word is one step per letter, however many words
// are stored. Words that begin alike share the nodes for their beginning.
//
// Two views of the same thing live here: the Trie class, which the recordings run
// on step by step, and Shape, the nodes of a set of words laid out in alphabetical
// order, which is what the sculpture draws. Plain data: no drawing.

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const SLOTS = 26;
export const slotOf = (ch: string): number => ch.charCodeAt(0) - 65;
/** Letters only, in capitals: what a word box accepts. */
export const clean = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, '');

export class TrieNode {
  /** One slot per letter: the child for that letter, or null. */
  readonly next: (TrieNode | null)[] = new Array<TrieNode | null>(SLOTS).fill(null);
  isWord = false;
  /** The letters on the path from the root. */
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  /** How many slots hold a child. */
  get used(): number {
    let n = 0;
    for (const c of this.next) if (c) n++;
    return n;
  }
}

/** A word within reach of a misspelling, and how many edits away it is. */
export interface Suggestion {
  word: string;
  d: number;
}

export class Trie {
  readonly root = new TrieNode('');
  /** Words stored. */
  size = 0;
  /** Nodes, the root included. */
  nodes = 1;

  constructor(words: Iterable<string> = []) {
    for (const w of words) this.insert(w);
  }

  /** The node a prefix leads to, or null where the path runs out. */
  find(prefix: string): TrieNode | null {
    let node: TrieNode | null = this.root;
    for (const ch of prefix) {
      node = node.next[slotOf(ch)];
      if (!node) return null;
    }
    return node;
  }

  has(word: string): boolean {
    return !!this.find(word)?.isWord;
  }

  /** Store a word. Returns how many nodes it needed. */
  insert(word: string): number {
    let node = this.root,
      made = 0;
    for (const ch of word) {
      const s = slotOf(ch);
      let next = node.next[s];
      if (!next) {
        next = node.next[s] = new TrieNode(node.prefix + ch);
        made++;
      }
      node = next;
    }
    if (!node.isWord) {
      node.isWord = true;
      this.size++;
    }
    this.nodes += made;
    return made;
  }

  /** Forget a word, and every node that led only to it. Returns the nodes removed, or -1 if it was not stored. */
  remove(word: string): number {
    const path: TrieNode[] = [this.root];
    for (const ch of word) {
      const next = path[path.length - 1].next[slotOf(ch)];
      if (!next) return -1;
      path.push(next);
    }
    const last = path[path.length - 1];
    if (!last.isWord) return -1;
    last.isWord = false;
    this.size--;
    let cut = 0;
    for (let k = path.length - 1; k > 0; k--) {
      const node = path[k];
      if (node.isWord || node.used > 0) break;
      path[k - 1].next[slotOf(word[k - 1])] = null;
      cut++;
    }
    this.nodes -= cut;
    return cut;
  }

  /** Every word below a node, in slot order: A to Z. */
  collect(node: TrieNode, out: string[] = []): string[] {
    if (node.isWord) out.push(node.prefix);
    for (const c of node.next) if (c) this.collect(c, out);
    return out;
  }

  /** Every word that starts with a prefix, A to Z. */
  complete(prefix: string): string[] {
    const node = this.find(prefix);
    return node ? this.collect(node) : [];
  }

  list(): string[] {
    return this.collect(this.root);
  }

  /**
   * Every word at most `max` edits (a letter changed, added or dropped, or two
   * letters swapped) from `word`, nearest first. It walks the trie keeping one
   * row of the edit-distance table per node, and cuts a branch the moment every
   * entry in its row is over the limit: nothing below it can come back.
   */
  suggest(word: string, max = 1): Suggestion[] {
    const out: Suggestion[] = [];
    const first = Array.from({ length: word.length + 1 }, (_, j) => j);
    const visit = (node: TrieNode, row: readonly number[], before: readonly number[] | null) => {
      const prevCh = node.prefix[node.prefix.length - 1] ?? '';
      node.next.forEach((child, s) => {
        if (!child) return;
        const r = nextRow(row, word, ALPHABET[s], before, prevCh);
        if (child.isWord && r[word.length] <= max) out.push({ word: child.prefix, d: r[word.length] });
        if (Math.min(...r) <= max) visit(child, r, row);
      });
    };
    visit(this.root, first, null);
    return out.sort((a, b) => a.d - b.d || (a.word < b.word ? -1 : 1));
  }
}

/**
 * The next row of the edit-distance table, one letter `ch` deeper into the trie.
 * `row` is the parent's row; `before` is the grandparent's and `prevCh` the
 * parent's letter, so that two swapped letters count as one edit.
 */
export function nextRow(
  row: readonly number[],
  word: string,
  ch: string,
  before: readonly number[] | null = null,
  prevCh = '',
): number[] {
  const r = [row[0] + 1];
  for (let j = 1; j <= word.length; j++) {
    let v = Math.min(r[j - 1] + 1, row[j] + 1, row[j - 1] + (word[j - 1] === ch ? 0 : 1));
    if (before && j > 1 && word[j - 1] === prevCh && word[j - 2] === ch) v = Math.min(v, before[j - 2] + 1);
    r.push(v);
  }
  return r;
}

/** Edit distance between two words, a swap counting as one edit: the reference the trie search is checked against. */
export function editDistance(a: string, b: string): number {
  const D = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        D[i][j] = Math.min(D[i][j], D[i - 2][j - 2] + 1);
    }
  return D[a.length][b.length];
}

/* ---------------- a set of words, as the sculpture sees it ---------------- */

/** A set of words, A to Z. Snapshots share one of these until a word is added or removed. */
export interface Dict {
  readonly words: readonly string[];
  readonly set: ReadonlySet<string>;
}

export function dictOf(words: Iterable<string>): Dict {
  const set = new Set(words);
  return { words: [...set].sort(), set };
}
export const withWord = (d: Dict, w: string): Dict => (d.set.has(w) ? d : dictOf([...d.words, w]));
export const withoutWord = (d: Dict, w: string): Dict => (d.set.has(w) ? dictOf(d.words.filter(x => x !== w)) : d);

/** The first word (A to Z) that starts with a prefix. */
export function firstWith(d: Dict, prefix: string): string | null {
  let lo = 0,
    hi = d.words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (d.words[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const w = d.words[lo];
  return w != null && w.startsWith(prefix) ? w : null;
}

/**
 * The nodes the sculpture draws, in the order a walk from A to Z meets them.
 * A node's id is its prefix ('' is the root). Before the words are zipped
 * together, each word's letters beyond the shared ones are its own nodes, with
 * ids like 'CA|CART': the A of CART, not yet shared.
 */
export interface Shape {
  ids: string[];
  index: Map<string, number>;
  /** Parent of each node (-1 for the root). */
  parent: Int32Array;
  depth: Uint8Array;
  /** The letter on the way in. */
  ch: string[];
  /** 1 where a word ends. */
  word: Uint8Array;
  /** Children, in order. */
  kids: number[][];
  /** Words ending at or below each node. */
  below: Int32Array;
  /** Nodes with no children: each gets its own slice of the fan. */
  leaves: number;
  maxDepth: number;
}

interface Proto {
  id: string;
  up: string | null;
  ch: string;
  word: boolean;
  depth: number;
  /** Children are ordered by this. */
  key: string;
}

function build(protos: Proto[]): Shape {
  const byId = new Map<string, Proto>();
  for (const p of protos) byId.set(p.id, p);
  const kidsOf = new Map<string, Proto[]>();
  for (const p of protos) {
    if (p.up == null) continue;
    const list = kidsOf.get(p.up);
    if (list) list.push(p);
    else kidsOf.set(p.up, [p]);
  }
  for (const list of kidsOf.values()) list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const ids: string[] = [],
    order: Proto[] = [];
  const walk = (p: Proto) => {
    ids.push(p.id);
    order.push(p);
    for (const c of kidsOf.get(p.id) ?? []) walk(c);
  };
  const root = byId.get('');
  if (!root) throw new Error('a shape needs a root');
  walk(root);
  const n = ids.length;
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const parent = new Int32Array(n),
    depth = new Uint8Array(n),
    word = new Uint8Array(n),
    below = new Int32Array(n);
  const kids: number[][] = ids.map(() => []);
  const ch: string[] = [];
  let maxDepth = 0,
    leaves = 0;
  order.forEach((p, i) => {
    parent[i] = p.up == null ? -1 : (index.get(p.up) ?? -1);
    if (parent[i] >= 0) kids[parent[i]].push(i);
    depth[i] = p.depth;
    word[i] = p.word ? 1 : 0;
    ch.push(p.ch);
    maxDepth = Math.max(maxDepth, p.depth);
  });
  for (let i = n - 1; i >= 0; i--) {
    below[i] += word[i];
    if (parent[i] >= 0) below[parent[i]] += below[i];
    if (!kids[i].length && i > 0) leaves++;
  }
  return { ids, index, parent, depth, ch, word, kids, below, leaves, maxDepth };
}

const trieProto = (p: string, isWord: boolean): Proto => ({
  id: p,
  up: p ? p.slice(0, -1) : null,
  ch: p ? p[p.length - 1] : '',
  word: isWord,
  depth: p.length,
  key: p,
});

const SHAPES = new WeakMap<Dict, Map<string, Shape>>();
function cached(d: Dict, key: string, make: () => Shape): Shape {
  let m = SHAPES.get(d);
  if (!m) SHAPES.set(d, (m = new Map()));
  let s = m.get(key);
  if (!s) m.set(key, (s = make()));
  return s;
}

/**
 * The trie of a set of words. `draft` is a word whose nodes stand without its
 * word mark: one being built by an insert, or one whose nodes a delete is still
 * taking away.
 */
export function shapeOf(d: Dict, draft: string | null = null): Shape {
  return cached(d, `t:${draft ?? ''}`, () => {
    const seen = new Set<string>(['']);
    const protos: Proto[] = [trieProto('', false)];
    const add = (w: string) => {
      for (let k = 1; k <= w.length; k++) {
        const p = w.slice(0, k);
        if (seen.has(p)) continue;
        seen.add(p);
        protos.push(trieProto(p, d.set.has(p)));
      }
    };
    for (const w of d.words) add(w);
    if (draft) add(draft);
    return build(protos);
  });
}

/**
 * The words part-way through being zipped together: the first `stage` letters
 * of every word are shared, and the rest of each word is still its own.
 */
export function zipShapeOf(d: Dict, stage: number): Shape {
  return cached(d, `z:${stage}`, () => {
    const seen = new Set<string>(['']);
    const protos: Proto[] = [trieProto('', false)];
    for (const w of d.words) {
      for (let k = 1; k <= w.length; k++) {
        const p = w.slice(0, k);
        if (k <= stage) {
          if (seen.has(p)) continue;
          seen.add(p);
          protos.push(trieProto(p, d.set.has(p)));
        } else
          protos.push({
            id: `${p}|${w}`,
            up: k - 1 <= stage ? p.slice(0, -1) : `${p.slice(0, -1)}|${w}`,
            ch: p[k - 1],
            word: k === w.length,
            depth: k,
            key: w,
          });
      }
    }
    return build(protos);
  });
}

/** Letters, written out one word after another. */
export const letterCount = (d: Dict): number => d.words.reduce((s, w) => s + w.length, 0);
/** Nodes in the trie, not counting the root. */
export const nodeCount = (d: Dict): number => shapeOf(d).ids.length - 1;
