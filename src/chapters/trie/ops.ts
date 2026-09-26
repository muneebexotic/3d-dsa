// The recordings. Each operation runs on a real trie and records a step at every
// point worth seeing, with plain-English narration: the words zipping together
// ring by ring, a prefix typed letter by letter, search, insert, delete, spell
// check, and one search run on all three dictionaries at once.

import { plural } from '../../core/math';
import type { CodeKey } from './code';
import {
  calm,
  fanKey,
  type Callout,
  type Chip,
  type FanKey,
  type FanState,
  type Listing,
  type OpKey,
  type Recording,
  type SpellState,
  type Step,
  type StepKind,
} from './diagram';
import {
  ALPHABET,
  Trie,
  letterCount,
  nextRow,
  nodeCount,
  shapeOf,
  slotOf,
  withWord,
  withoutWord,
  type Dict,
  type Suggestion,
} from './trie';
import { SIZES, type Size } from './words';

/* ---------------- helpers ---------------- */

const TRIES = new WeakMap<Dict, Trie>();
/** A trie holding a dictionary's words, built once and only read. */
export function trieOf(d: Dict): Trie {
  let t = TRIES.get(d);
  if (!t) TRIES.set(d, (t = new Trie(d.words)));
  return t;
}

/** Every word under a prefix, A to Z. */
export const completions = (d: Dict, prefix: string): string[] => trieOf(d).complete(prefix);

/** "A, B and C", or the first few and how many more. */
export function listOf(words: readonly string[], max = 6, and = 'and'): string {
  if (!words.length) return '';
  if (words.length > max) return `${words.slice(0, max - 1).join(', ')} ${and} ${words.length - max + 1} more`;
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} ${and} ${words[words.length - 1]}`;
}

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const ordinal = (k: number): string => ORD[k] ?? `${k}th`;
const commas = (n: number): string => n.toLocaleString('en-US');
const pluralOf = (word: string): string => (/(ch|sh|s|x)$/.test(word) ? `${word}es` : `${word}s`);
const count = (n: number, word: string): string => (n === 1 ? `one ${word}` : `${commas(n)} ${pluralOf(word)}`);
/** The same, to start a sentence. */
const Count = (n: number, word: string): string => {
  const s = count(n, word);
  return s[0].toUpperCase() + s.slice(1);
};
/** Worst case for binary search in a sorted list of n words. */
export const binarySteps = (n: number): number => Math.ceil(Math.log2(n + 1));

/** The deepest node a word's letters lead to, and the letter that found no slot (if any). */
function reach(d: Dict, word: string): { depth: number; ch: string | null } {
  const shape = shapeOf(d);
  let k = 0;
  while (k < word.length && shape.index.has(word.slice(0, k + 1))) k++;
  return { depth: k, ch: k < word.length ? word[k] : null };
}

/** Builds one recording's steps, carrying the state of each sunburst from step to step. */
class Recorder {
  readonly steps: Step[] = [];
  fans: FanState[];
  readonly op: string;
  readonly code: CodeKey;

  constructor(fans: FanState[], op: string, code: CodeKey) {
    this.fans = fans;
    this.op = op;
    this.code = code;
  }

  /** Change one sunburst's state for the next step and later ones. */
  set(k: number, patch: Partial<FanState>): void {
    this.fans = this.fans.map((f, i) => (i === k ? { ...f, ...patch } : f));
  }

  push(
    kind: StepKind,
    head: string,
    body: string,
    line: number,
    extra: { callout?: Callout | null; chips?: Chip[]; list?: Listing | null; code?: CodeKey } = {},
  ): void {
    this.steps.push({
      kind,
      op: this.op,
      head,
      body,
      code: extra.code ?? this.code,
      line,
      fans: this.fans,
      callout: extra.callout ?? null,
      chips: extra.chips ?? [],
      list: extra.list ?? null,
    });
  }
}

const stepChip = (k: number): Chip => ({ text: plural(k, 'step'), tone: 'cobalt' });

/* ---------------- sharing the beginnings ---------------- */

/**
 * The opening: every word starts as its own ray of letters, then the rays zip
 * together one ring at a time, wherever words begin alike.
 */
export function zip(d: Dict, size: Size): Recording {
  const key = fanKey(size),
    n = d.words.length,
    letters = letterCount(d),
    nodes = nodeCount(d);
  const maxLen = Math.max(...d.words.map(w => w.length));
  const at = (s: number) => d.words.filter(w => w.length >= s);
  const distinct = (s: number) => new Set(at(s).map(w => w.slice(0, s)));
  // the last ring where anything is shared: after it, every word's letters are its own
  let last = 0;
  for (let s = 1; s <= maxLen; s++) if (distinct(s).size < at(s).length) last = s;
  const R = new Recorder([{ ...calm(key, d), zip: 0 }], `Share · ${commas(n)} words`, 'node');
  let saved = 0;
  for (let s = 1; s <= last; s++) {
    const L = at(s).length,
      M = distinct(s).size;
    saved += L - M;
    // the beginning that the most words share at this ring
    const counts = new Map<string, number>();
    for (const w of at(s)) counts.set(w.slice(0, s), (counts.get(w.slice(0, s)) ?? 0) + 1);
    const [top, topN] = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const example = completions(d, top);
    const firsts = [...distinct(1)].sort();
    R.set(0, { zip: s === last ? null : s, focus: null });
    let body: string;
    if (s === 1)
      body = `The ${commas(n)} words begin with only ${M} different letters${M <= 8 ? ` (${listOf(firsts, 8)})` : ''}, so each first letter is stored once. Words that begin alike now leave the centre on one ray.`;
    else
      body = `A letter is shared only by words that share every letter before it too. ${top} is now one node for ${count(topN, 'word')}: ${listOf(example, 5)}.`;
    if (s === last)
      body += ` After the ${ordinal(s)} letter no two words begin alike, so there is nothing more to share.`;
    R.push('zip', `The ${ordinal(s)} letters: ${commas(L)} become ${commas(M)}.`, body, 1, {
      callout: { fan: key, at: top, text: `${top} · ${count(topN, 'word')}`, tone: 'cobalt' },
      chips: [{ text: `${commas(letters - saved)} nodes`, tone: 'cobalt' }, { text: `${commas(saved)} letters saved` }],
    });
  }
  R.set(0, { zip: null });
  R.push(
    'zip',
    `${commas(letters)} letters became ${commas(nodes)} nodes.`,
    `That is a trie: one node per beginning, however many words share it, and a gold ring wherever a word ends. Every node keeps a slot for each of the 26 letters, so reading a word is one step per letter. Type one to follow it.`,
    0,
    { chips: [{ text: `${commas(nodes)} nodes`, tone: 'done' }, { text: `${commas(n)} words` }] },
  );
  return {
    title: `${commas(n)} words`,
    op: 'zip',
    word: '',
    start: [{ ...calm(key, d), zip: 0 }],
    steps: R.steps,
    intro: {
      head: `${commas(n)} words, written out: ${commas(letters)} letters.`,
      body: `Each word is its own ray from the centre, one ring per letter, A to Z from left to right. Many of them begin the same way. Play to share those beginnings, one ring at a time.`,
      list: null,
    },
  };
}

/** The trie at rest, waiting for a word. */
export function still(d: Dict, size: Size): Recording {
  return {
    title: `${commas(d.words.length)} words`,
    op: 'type',
    word: '',
    start: [calm(fanKey(size), d)],
    steps: [],
    intro: {
      head: `${commas(d.words.length)} words in ${commas(nodeCount(d))} nodes.`,
      body: 'Type a word, or just press a letter: each letter is one step out from the centre, and the sunburst lights every word you could mean.',
      list: null,
    },
  };
}

/* ---------------- autocomplete: a prefix, typed letter by letter ---------------- */

function completeListing(d: Dict, prefix: string): Listing {
  const words = completions(d, prefix);
  return {
    kind: 'complete',
    prefix,
    words,
    note: `${words.length === 1 ? 'One word starts' : `${commas(words.length)} of ${commas(d.words.length)} words start`} with ${prefix}`,
  };
}

function missListing(d: Dict, text: string, stop: number): Listing {
  const sugg = trieOf(d).suggest(text, 1);
  return {
    kind: 'suggest',
    prefix: '',
    words: sugg.map(s => s.word),
    d: sugg.map(s => s.d),
    note: sugg.length
      ? `No word starts with ${text.slice(0, stop + 1)}. One edit away:`
      : `No word starts with ${text.slice(0, stop + 1)}, and none is one edit away.`,
  };
}

/**
 * Type a prefix one letter at a time: each letter is one step down, and the lit
 * wedge is every word it could still become. The steps for CA are the first two
 * steps for CAR, so typing one more letter only plays one more step.
 */
export function typeAhead(d: Dict, size: Size, text: string): Recording {
  if (!text) return still(d, size);
  const key = fanKey(size),
    N = d.words.length;
  const R = new Recorder([calm(key, d)], `Type ${text}`, 'complete');
  const { depth } = reach(d, text);
  for (let k = 1; k <= text.length; k++) {
    const P = text.slice(0, k),
      ch = text[k - 1];
    if (k <= depth) {
      const words = completions(d, P),
        c = words.length;
      const isWord = d.set.has(P);
      R.set(0, { path: P, at: P, wedge: P, focus: P, lit: words, miss: null });
      let body: string;
      if (k === 1)
        body = `One step: the root keeps a slot for every letter, and ${ch} is slot ${slotOf(ch)}, so it is found by its place, not by searching. Everything in the lit wedge starts with ${P}; the other ${commas(N - c)} words are never looked at.`;
      else {
        body = `${k} letters, ${k} steps. `;
        if (isWord)
          body +=
            c > 1
              ? `${P} is a word itself, with a gold ring, and ${count(c - 1, 'more word')} carry on from it.`
              : `${P} is a word, and the only one left.`;
        else if (c === 1) body += `Only ${words[0]} is left: autocomplete can finish the word.`;
        else if (c === completions(d, P.slice(0, -1)).length)
          body += `Every word under ${P.slice(0, -1)} goes on with ${ch}, so the wedge keeps all ${c}.`;
        else body += `The wedge has narrowed to ${listOf(words, 5)}.`;
      }
      R.push('walk', `${P}: ${c === 1 ? 'one word starts' : `${commas(c)} words start`} with ${P}.`, body, 2, {
        callout: { fan: key, at: P, text: `${P} · ${commas(c)}`, tone: 'cobalt' },
        chips: [stepChip(k), { text: count(c, 'word') }],
        list: completeListing(d, P),
      });
    } else {
      const Q = text.slice(0, depth),
        gone = text[depth];
      R.set(0, {
        path: Q,
        at: Q,
        wedge: null,
        focus: Q || null,
        lit: [],
        miss: { at: Q, ch: gone },
      });
      const first = k === depth + 1;
      const sugg = trieOf(d).suggest(text.slice(0, k), 1);
      R.push(
        'miss',
        first ? `No word starts with ${P}.` : `Still no word starts with ${P}.`,
        first
          ? `${Q ? `${Q} has` : 'The root has'} nothing in its ${gone} slot, so the path stops here, after ${plural(depth + 1, 'step')}.${
              sugg.length
                ? ` Spell check would offer ${listOf(
                    sugg.map(s => s.word),
                    4,
                  )}.`
                : ''
            }`
          : `Once the path runs out, no later letter can bring it back.${
              sugg.length
                ? ` One edit away: ${listOf(
                    sugg.map(s => s.word),
                    4,
                  )}.`
                : ''
            }`,
        4,
        {
          callout: { fan: key, at: Q, text: `no ${gone}`, tone: 'red' },
          chips: [stepChip(depth + 1), { text: 'no words', tone: 'hot' }],
          list: missListing(d, text.slice(0, k), depth),
        },
      );
    }
  }
  return {
    title: `Type ${text}`,
    op: 'type',
    word: text,
    start: [calm(key, d)],
    steps: R.steps,
    intro: {
      head: `Type a word.`,
      body: `Each letter you type is one step out from the centre, and the sunburst lights every word you could mean.`,
      list: null,
    },
  };
}

/* ---------------- search ---------------- */

/** Walk a word's letters as far as they go, one step each, on sunburst k of the recorder. */
function walkSteps(R: Recorder, k: number, d: Dict, word: string, line: number, verb: string): number {
  const key = R.fans[k].key,
    { depth } = reach(d, word);
  for (let j = 1; j <= depth; j++) {
    const P = word.slice(0, j),
      ch = word[j - 1];
    const c = completions(d, P).length;
    R.set(k, { path: P, at: P, focus: P });
    const body =
      j === 1
        ? `${verb} starts at the root and follows one slot per letter. The letter says which slot, so there is nothing to search among: ${ch} is slot ${slotOf(ch)}.`
        : c > 1
          ? `Step ${j}. ${commas(c)} words begin with ${P}, and the path is the same for all of them.`
          : `Step ${j}. Only one word begins with ${P}.`;
    R.push('walk', `${P}: follow ${ch}.`, body, line, {
      callout: { fan: key, at: P, text: P, tone: 'cobalt' },
      chips: [stepChip(j)],
    });
  }
  return depth;
}

export function search(d: Dict, size: Size, word: string): Recording {
  const key = fanKey(size),
    N = d.words.length,
    L = word.length;
  const R = new Recorder([calm(key, d)], `Search ${word}`, 'search');
  const depth = walkSteps(R, 0, d, word, 2, 'A search');
  if (depth < L) {
    const Q = word.slice(0, depth),
      ch = word[depth];
    R.set(0, { path: Q, at: Q, focus: Q || null, miss: { at: Q, ch } });
    R.push(
      'miss',
      `${word} is not here: no word starts with ${word.slice(0, depth + 1)}.`,
      `${Q ? `${Q} has` : 'The root has'} nothing in its ${ch} slot, so the search stops after ${plural(depth + 1, 'step')}, without reading the rest of the word.`,
      4,
      {
        callout: { fan: key, at: Q, text: `no ${ch}`, tone: 'red' },
        chips: [stepChip(depth + 1), { text: 'not found', tone: 'hot' }],
        list: missListing(d, word, depth),
      },
    );
  } else if (d.set.has(word)) {
    R.set(0, { lit: [word] });
    const other = size === 2000 ? 'or among 20' : 'or among 2,000';
    R.push(
      'found',
      `Found ${word}: ${plural(L, 'letter')}, ${plural(L, 'step')}.`,
      `It ends on a gold word mark. The search took one step per letter and never looked at the other ${commas(N - 1)} words; ${other}, it would take the same ${plural(L, 'step')}.`,
      5,
      {
        callout: { fan: key, at: word, text: `${word}: a word`, tone: 'cobalt' },
        chips: [stepChip(L), { text: 'found', tone: 'done' }],
        list: { kind: 'found', prefix: word, words: [word], note: `${word} is a word` },
      },
    );
  } else {
    const more = completions(d, word);
    R.set(0, { wedge: word, lit: more });
    R.push(
      'prefix',
      `${word} is only the start of a word.`,
      `The path is all here, but its last node has no word mark: ${word} leads on to ${listOf(more, 4)}. The mark is what tells a word from a prefix.`,
      5,
      {
        callout: { fan: key, at: word, text: 'no word mark', tone: 'ink' },
        chips: [stepChip(L), { text: 'not a word', tone: 'hot' }],
        list: completeListing(d, word),
      },
    );
  }
  return { title: `Search ${word}`, op: 'search', word, start: [calm(key, d)], steps: R.steps, intro: introFor(word) };
}

const introFor = (word: string) => ({
  head: word,
  body: 'Play to follow it letter by letter.',
  list: null,
});

/* ---------------- insert ---------------- */

export function insert(d: Dict, size: Size, word: string): Recording {
  const key = fanKey(size),
    L = word.length;
  const R = new Recorder([calm(key, d)], `Insert ${word}`, 'insert');
  const { depth } = reach(d, word);
  for (let j = 1; j <= depth; j++) {
    const P = word.slice(0, j);
    const shared = completions(d, P);
    R.set(0, { path: P, at: P, focus: P });
    R.push(
      'walk',
      `${P}: already here.`,
      j === 1
        ? `Insert follows the word from the root, like a search. ${P} is already a node, shared by ${count(shared.length, 'word')}, so nothing new is needed yet.`
        : `${P} is already a node, shared by ${count(shared.length, 'word')}: ${listOf(shared, 4)}.`,
      4,
      { callout: { fan: key, at: P, text: `${P} · shared`, tone: 'cobalt' }, chips: [stepChip(j)] },
    );
  }
  if (d.set.has(word)) {
    R.push(
      'none',
      `${word} is already here.`,
      `The path is there and its last node already has a word mark, so there is nothing to add.`,
      5,
      { chips: [stepChip(L), { text: '0 new nodes' }] },
    );
    return {
      title: `Insert ${word}`,
      op: 'insert',
      word,
      start: [calm(key, d)],
      steps: R.steps,
      intro: introFor(word),
    };
  }
  const fresh: string[] = [];
  for (let j = depth + 1; j <= L; j++) {
    const P = word.slice(0, j),
      Q = word.slice(0, j - 1),
      ch = word[j - 1];
    fresh.push(P);
    R.set(0, { path: P, at: P, focus: P, draft: P, fresh: [...fresh] });
    R.push(
      'grow',
      `${P}: a new node.`,
      `${Q ? `${Q} has` : 'The root has'} nothing in its ${ch} slot yet, so insert makes a node and puts it there (slot ${slotOf(ch)}).${j === depth + 1 && j < L ? ' From here on every letter is new.' : ''}`,
      3,
      {
        callout: { fan: key, at: P, text: `new ${ch}`, tone: 'ink' },
        chips: [stepChip(j), { text: `+${plural(fresh.length, 'node')}`, tone: 'hot' }],
      },
    );
  }
  const nd = withWord(d, word);
  R.set(0, { dict: nd, draft: null, marked: word, lit: [word], path: word, at: word, focus: word });
  const made = fresh.length,
    kin = depth ? completions(d, word.slice(0, depth)) : [];
  const body =
    made === 0
      ? `Every letter was already here on the way to ${listOf(completions(d, word), 3)}, so insert only sets the word mark.`
      : depth > 0
        ? `The last node gets its word mark. Its first ${plural(depth, 'letter')} were already here, shared with ${listOf(kin, 3)}, so it cost only ${count(made, 'node')}, not ${L}.`
        : `The last node gets its word mark. No word began like it, so every letter needed a node of its own.`;
  R.push(
    'mark',
    made ? `${word} is in: ${count(made, 'new node')}.` : `${word} is in, and it cost no nodes.`,
    body,
    5,
    {
      callout: { fan: key, at: word, text: 'word mark', tone: 'cobalt' },
      chips: [
        stepChip(L),
        { text: `+${plural(made, 'node')}`, tone: made ? 'hot' : undefined },
        { text: `${commas(nd.words.length)} words`, tone: 'done' },
      ],
      list: { kind: 'found', prefix: word, words: [word], note: `${word} is now a word` },
    },
  );
  return { title: `Insert ${word}`, op: 'insert', word, start: [calm(key, d)], steps: R.steps, intro: introFor(word) };
}

/* ---------------- delete ---------------- */

export function remove(d: Dict, size: Size, word: string): Recording {
  const key = fanKey(size),
    L = word.length;
  const R = new Recorder([calm(key, d)], `Delete ${word}`, 'remove');
  const depth = walkSteps(R, 0, d, word, 0, 'Delete');
  if (!d.set.has(word)) {
    const Q = word.slice(0, depth);
    if (depth < L) R.set(0, { miss: { at: Q, ch: word[depth] } });
    R.push(
      'none',
      `${word} is not stored, so there is nothing to delete.`,
      depth < L
        ? `${Q ? `${Q} has` : 'The root has'} nothing in its ${word[depth]} slot.`
        : `The path is here, but it ends without a word mark: ${word} is only the start of ${listOf(completions(d, word), 3)}.`,
      2,
      { chips: [stepChip(Math.min(L, depth + 1)), { text: 'not found', tone: 'hot' }] },
    );
    return {
      title: `Delete ${word}`,
      op: 'remove',
      word,
      start: [calm(key, d)],
      steps: R.steps,
      intro: introFor(word),
    };
  }
  const nd = withoutWord(d, word);
  R.set(0, { dict: nd, draft: word, marked: word, lit: [] });
  R.push(
    'unmark',
    `Take the word mark off ${word}.`,
    `${word} is no longer a word here. Its nodes may still be needed by other words, so check them from the end back toward the root.`,
    3,
    { callout: { fan: key, at: word, text: 'mark off', tone: 'ink' }, chips: [stepChip(L)] },
  );
  let pruned = 0;
  for (let j = L; j >= 0; j--) {
    const P = word.slice(0, j);
    const below = completions(nd, P);
    if (j === 0 || below.length) {
      R.set(0, { at: P, path: P, focus: P || null, doomed: null, draft: null, marked: null });
      const head = j === 0 ? 'Stop at the root.' : `Stop at ${P}: it stays.`;
      const body =
        j === 0
          ? `No other word began with ${word[0]}, so every node ${word} had is gone.`
          : nd.set.has(P)
            ? `${P} is a word itself, so its node stays, and so does everything above it.`
            : `${P} still leads to ${listOf(below, 3)}, so it stays, and so does everything above it.`;
      R.push('keep', head, body, 6, {
        callout: j ? { fan: key, at: P, text: 'stays', tone: 'cobalt' } : null,
        chips: [
          { text: pruned ? `−${plural(pruned, 'node')}` : 'no nodes removed', tone: pruned ? 'hot' : undefined },
          { text: `${commas(nd.words.length)} words`, tone: 'done' },
        ],
      });
      break;
    }
    pruned++;
    const Q = word.slice(0, j - 1);
    R.set(0, { draft: Q || null, doomed: P, at: Q, path: Q, focus: Q || null, marked: null });
    R.push(
      'prune',
      `${P}: take it away.`,
      `${P} is not a word, and nothing hangs below it any more, so the ${word[j - 1]} slot in ${Q || 'the root'} is emptied.`,
      7,
      {
        callout: { fan: key, at: Q, text: `−${word[j - 1]}`, tone: 'red' },
        chips: [{ text: `−${plural(pruned, 'node')}`, tone: 'hot' }],
      },
    );
  }
  return { title: `Delete ${word}`, op: 'remove', word, start: [calm(key, d)], steps: R.steps, intro: introFor(word) };
}

/* ---------------- spell check ---------------- */

export function spell(d: Dict, size: Size, word: string): Recording {
  const key = fanKey(size),
    L = word.length;
  const R = new Recorder([calm(key, d)], `Spell check ${word}`, 'spell');
  if (d.set.has(word)) {
    const depth = walkSteps(R, 0, d, word, 2, 'A search');
    R.set(0, { lit: [word] });
    R.push(
      'found',
      `${word} is spelled right.`,
      `It is in the dictionary: the search ended on a word mark after ${plural(depth, 'step')}. Spell check only looks further when a word is not found.`,
      5,
      {
        code: 'search',
        callout: { fan: key, at: word, text: `${word}: a word`, tone: 'cobalt' },
        chips: [stepChip(L), { text: 'found', tone: 'done' }],
        list: { kind: 'found', prefix: word, words: [word], note: `${word} is spelled right` },
      },
    );
    return {
      title: `Spell check ${word}`,
      op: 'spell',
      word,
      start: [calm(key, d)],
      steps: R.steps,
      intro: introFor(word),
    };
  }
  // where a plain search would stop
  const { depth } = reach(d, word);
  const Q = word.slice(0, depth);
  R.set(0, { path: Q, at: Q, focus: Q || null, miss: depth < L ? { at: Q, ch: word[depth] } : null });
  R.push(
    'miss',
    `${word} is not a word.`,
    `${depth < L ? `Following it, the path runs out after ${plural(depth, 'letter')}: ${Q || 'the root'} has no ${word[depth]}.` : `The path is all here, but no word ends on it.`} To guess what was meant, look for every word one edit away: one letter changed, added or dropped, or two letters swapped.`,
    0,
    {
      callout: depth < L ? { fan: key, at: Q, text: `no ${word[depth]}`, tone: 'red' } : null,
      chips: [{ text: 'not found', tone: 'hot' }],
    },
  );
  // the search: one ring at a time, every branch still within one edit
  const trie = trieOf(d);
  const shape = shapeOf(d);
  const seen = new Map<string, number>([['', 0]]);
  const cut: string[] = [];
  const found: Suggestion[] = [];
  let frontier: { prefix: string; row: number[]; before: number[] | null }[] = [
    { prefix: '', row: Array.from({ length: L + 1 }, (_, j) => j), before: null },
  ];
  let ring = 0;
  while (frontier.length) {
    ring++;
    const next: typeof frontier = [];
    const newFound: string[] = [];
    let cutHere = 0;
    for (const { prefix, row, before } of frontier) {
      const node = trie.find(prefix);
      if (!node) continue;
      node.next.forEach((child, s) => {
        if (!child) return;
        const r = nextRow(row, word, ALPHABET[s], before, prefix[prefix.length - 1] ?? '');
        const low = Math.min(...r);
        seen.set(child.prefix, low);
        if (child.isWord && r[L] <= 1) {
          found.push({ word: child.prefix, d: r[L] });
          newFound.push(child.prefix);
        }
        if (low <= 1) next.push({ prefix: child.prefix, row: r, before: row });
        else {
          cut.push(child.prefix);
          cutHere++;
        }
      });
    }
    frontier = next;
    const st: SpellState = { word, ring, seen: new Map(seen), cut: [...cut] };
    R.set(0, { spell: st, miss: null, at: null, path: '', focus: null, lit: found.map(f => f.word) });
    const alive = next.length;
    const body =
      ring === 1
        ? `Each node keeps a row of edit distances: how far its letters are from the start of ${word}. ${cutHere ? `${Count(cutHere, 'branch')} ${cutHere === 1 ? 'is' : 'are'} already two edits off and can never come back, so ${cutHere === 1 ? 'it is' : 'they are'} cut, and nothing below ${cutHere === 1 ? 'it' : 'them'} is visited.` : 'Every first letter is still within one edit.'}`
        : `${newFound.length ? `Found ${listOf(newFound, 4)}: one edit from ${word}. ` : ''}${cutHere ? `${Count(cutHere, 'more branch')} cut.` : 'Nothing cut on this ring.'}${alive ? '' : ' No branch is left in reach, so the search is over.'}`;
    R.push(
      'spell',
      `Ring ${ring}: ${alive ? `${count(alive, 'branch')} still in reach` : 'no branch left in reach'}.`,
      body,
      alive ? 8 : 9,
      {
        chips: [
          { text: `${commas(seen.size - 1)} of ${commas(shape.ids.length - 1)} nodes visited`, tone: 'cobalt' },
          { text: `${commas(cut.length)} cut` },
        ],
      },
    );
  }
  found.sort((a, b) => a.d - b.d || (a.word < b.word ? -1 : 1));
  R.set(0, { lit: found.map(f => f.word) });
  const visited = seen.size - 1,
    total = shape.ids.length - 1;
  R.push(
    'suggest',
    found.length === 1
      ? `One word is one edit away.`
      : found.length
        ? `${Count(found.length, 'word')} are one edit away.`
        : `No word is one edit from ${word}.`,
    `${
      found.length
        ? `Did you mean ${listOf(
            found.map(f => f.word),
            6,
            'or',
          )}? `
        : ''
    }The search visited ${commas(visited)} of ${commas(total)} nodes: every beginning shared by many words was checked once, and every branch that went wrong was cut the moment it was two edits off.`,
    6,
    {
      chips: [
        { text: `${commas(visited)} of ${commas(total)} visited`, tone: 'cobalt' },
        { text: count(found.length, 'suggestion'), tone: found.length ? 'done' : 'hot' },
      ],
      list: {
        kind: 'suggest',
        prefix: '',
        words: found.map(f => f.word),
        d: found.map(f => f.d),
        note: found.length ? `One edit from ${word}:` : `Nothing within one edit of ${word}.`,
      },
    },
  );
  return {
    title: `Spell check ${word}`,
    op: 'spell',
    word,
    start: [calm(key, d)],
    steps: R.steps,
    intro: introFor(word),
  };
}

/* ---------------- three sizes: one search, 20, 200 and 2,000 words ---------------- */

export function three(dicts: Readonly<Record<Size, Dict>>, word: string): Recording {
  const start = SIZES.map(s => calm(fanKey(s), dicts[s]));
  const R = new Recorder(start, `Search ${word} · three sizes`, 'search');
  const L = word.length;
  const reached = SIZES.map(s => reach(dicts[s], word).depth);
  const big: FanKey = 'f2000';
  for (let j = 1; j <= L; j++) {
    const P = word.slice(0, j),
      ch = word[j - 1];
    reached.forEach((r, k) => {
      if (j <= r) R.set(k, { path: P, at: P, focus: P });
      else if (j === r + 1) {
        const Q = word.slice(0, r);
        R.set(k, { path: Q, at: Q, focus: Q || null, miss: { at: Q, ch } });
      }
    });
    if (reached.every(r => r < j)) break;
    const body =
      j === 1
        ? `Twenty words, two hundred, two thousand: each sunburst finds the ${ch} slot at its root in one step. More words make a sunburst denser, never bigger, so the number of words never comes into it.`
        : `${j} letters, ${j} steps${reached.some(r => r < j) ? ' wherever the path goes on' : ' in all three'}. ${commas(completions(dicts[2000], P).length)} of the 2,000 words begin with ${P}, and the step costs the same.`;
    R.push('walk', `${P}: one step in each.`, body, 2, {
      callout: reached[2] >= j ? { fan: big, at: P, text: P, tone: 'cobalt' } : null,
      chips: [stepChip(j)],
    });
  }
  const has = SIZES.map(s => dicts[s].set.has(word));
  SIZES.forEach((_, k) => {
    if (has[k]) R.set(k, { lit: [word] });
  });
  const list = SIZES.map((s, k) => `${commas(s)}: ${has[k] ? 'found' : 'not there'}`).join(', ');
  const where = has.every(Boolean)
    ? `${word} costs ${plural(L, 'step')} whether it is among 20, 200 or 2,000 words.`
    : `${list}. Found or not, no search took more than ${plural(L, 'step')}.`;
  R.push(
    has.some(Boolean) ? 'found' : 'miss',
    has.every(Boolean) ? `${word}: ${plural(L, 'step')} in each.` : `${word}: at most ${plural(L, 'step')} in each.`,
    `A trie takes one step per letter, so ${where} A list would check up to 20, 200 and 2,000 words; binary search in a sorted list ${binarySteps(20)}, ${binarySteps(200)} and ${binarySteps(2000)} words, each compared letter by letter.`,
    5,
    {
      callout: has[2] ? { fan: big, at: word, text: `${plural(L, 'step')}`, tone: 'cobalt' } : null,
      chips: [stepChip(L), { text: 'n never counted', tone: 'done' }],
      list: { kind: 'found', prefix: word, words: has.some(Boolean) ? [word] : [], note: list },
    },
  );
  return {
    title: `${word} · three sizes`,
    op: 'three',
    word,
    start,
    steps: R.steps,
    intro: {
      head: `Twenty words, two hundred, two thousand.`,
      body: `The same seven rings in each: the longest word sets the size, not the number of words. Play to search all three for ${word} at once.`,
      list: null,
    },
  };
}

/** The recording for an operation. */
export function record(op: OpKey, dicts: Readonly<Record<Size, Dict>>, size: Size, word: string): Recording {
  const d = dicts[size];
  switch (op) {
    case 'zip':
      return zip(d, size);
    case 'type':
      return typeAhead(d, size, word);
    case 'search':
      return search(d, size, word);
    case 'insert':
      return insert(d, size, word);
    case 'remove':
      return remove(d, size, word);
    case 'spell':
      return spell(d, size, word);
    case 'three':
      return three(dicts, word);
  }
}
