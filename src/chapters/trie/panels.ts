// The cards beside the sunburst: the words an operation found (autocomplete,
// suggestions), the code being run with its line lit, how many steps a lookup
// takes as the dictionary grows, what the speed costs in memory, which structure
// to use when, the inspector for a clicked node, the legend and the chips.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { LISTINGS, TITLES, type CodeKey } from './code';
import type { Chip, Listing } from './diagram';
import { binarySteps } from './ops';
import { HEX } from './palette';
import { SLOTS, shapeOf, letterCount, type Dict } from './trie';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const commas = (n: number): string => n.toLocaleString('en-US');
const GRID = 'rgba(27, 26, 23, 0.14)';

/** A letter disc like the ones on the sunburst, for the panels. */
export function discSVG(label: string, size = 26, fill: string = HEX.ink, ring = false): string {
  const r = size / 2;
  const gh = label.length > 1 ? size * 0.3 : size * 0.44;
  const mark = ring
    ? `<circle cx="${r}" cy="${r}" r="${r - 1.6}" fill="none" stroke="${HEX.gold}" stroke-width="2.4"/>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - (ring ? 4.2 : 1)}" fill="${fill}"/>${mark}${glyphSVG(label || ' ', r, r, gh, fill === HEX.gold ? HEX.ink : HEX.light, 15)}</svg>`;
}

/* ---------------- the words found ---------------- */

const SHOW = 40;

/** The suggestions card: every word under the prefix (autocomplete), or the words one edit away. */
export function listHTML(list: Listing | null, total: number): string {
  if (!list)
    return `<p class="ls-note">Type a word: every word it could become appears here, A to Z, as fast as you type.</p><p class="ls-hint">Try <b>CA</b>, <b>TO</b> or <b>DOE</b>.</p>`;
  const words = list.words.slice(0, SHOW);
  const more = list.words.length - words.length;
  const item = (w: string, k: number) => {
    const p = list.kind === 'complete' && w.startsWith(list.prefix) ? list.prefix.length : 0;
    const d = list.d?.[k];
    return `<li${list.kind === 'found' ? ' class="found"' : ''}><button type="button" data-w="${w}"><b>${esc(w.slice(0, p))}</b>${esc(w.slice(p))}</button>${d != null ? `<span class="d">${d === 0 ? 'same' : plural(d, 'edit')}</span>` : ''}</li>`;
  };
  const cls = list.kind === 'suggest' ? 'ls-words sugg' : 'ls-words';
  return `<p class="ls-note">${esc(list.note)}${list.kind === 'complete' ? ` <span class="faint">of ${commas(total)}</span>` : ''}</p>${
    words.length ? `<ul class="${cls}">${words.map(item).join('')}</ul>` : ''
  }${more > 0 ? `<p class="ls-more">and ${commas(more)} more</p>` : ''}`;
}

/* ---------------- code ---------------- */

export class CodeCard {
  private sig: string | undefined = undefined;
  private lines: HTMLLIElement[] = [];
  private readonly title: HTMLElement;
  private readonly list: HTMLOListElement;

  constructor(title: HTMLElement, list: HTMLOListElement) {
    this.title = title;
    this.list = list;
  }

  show(key: CodeKey, line: number): void {
    if (key !== this.sig) {
      this.sig = key;
      this.title.textContent = TITLES[key];
      this.list.innerHTML = LISTINGS[key]
        .map(l => `<li>${esc(l).replace(/\/\/.*$/, m => `<i>${m}</i>`)}</li>`)
        .join('');
      this.lines = [...this.list.querySelectorAll('li')];
    }
    this.lines.forEach((li, k) => li.classList.toggle('on', k === line));
  }
}

/* ---------------- steps to find a word, as the dictionary grows ---------------- */

const NS = [10, 100, 1000, 10000, 100000];

/**
 * Steps to find a word of L letters among n words, n from 10 to 100,000, on log
 * scales: checking every word grows with n, binary search in a sorted list with
 * log₂ n, and a trie not at all. The three dictionaries on the plinth are marked.
 */
export function stepsSVG(L: number, word: string, sizes: readonly number[], current: number): string {
  const W = 260,
    H = 158,
    left = 34,
    right = W - 58,
    top = 10,
    base = H - 20;
  const lx = (n: number) => left + ((Math.log10(n) - 1) / 4) * (right - left);
  const ly = (v: number) => base - (Math.log10(Math.max(1, v)) / 5) * (base - top);
  let g = '';
  for (const v of [1, 10, 100, 1000, 10000, 100000]) {
    const y = ly(v).toFixed(1);
    g += `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${GRID}" vector-effect="non-scaling-stroke"/>`;
    g += `<text x="${left - 4}" y="${(ly(v) + 3).toFixed(1)}" text-anchor="end" class="tk">${v >= 1000 ? `${v / 1000}k` : v}</text>`;
  }
  for (const n of NS)
    g += `<text x="${lx(n).toFixed(1)}" y="${base + 13}" text-anchor="middle" class="tk">${n >= 1000 ? `${n / 1000}k` : n}</text>`;
  const curve = (f: (n: number) => number) => {
    let d = '';
    for (let e = 1; e <= 5.0001; e += 0.05) {
      const n = 10 ** e;
      d += `${d ? 'L' : 'M'}${lx(n).toFixed(1)} ${ly(f(n)).toFixed(1)}`;
    }
    return d;
  };
  const every = (n: number) => n,
    binary = (n: number) => binarySteps(n),
    trie = () => L;
  // the current size, as a faint rule
  g += `<line x1="${lx(current).toFixed(1)}" x2="${lx(current).toFixed(1)}" y1="${top}" y2="${base}" stroke="${HEX.cobalt}" stroke-width="1" opacity="0.3" vector-effect="non-scaling-stroke"/>`;
  g += `<path d="${curve(every)}" fill="none" stroke="${HEX.ink}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6" vector-effect="non-scaling-stroke"/>`;
  g += `<path d="${curve(binary)}" fill="none" stroke="${HEX.goldDeep}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  g += `<path d="${curve(trie)}" fill="none" stroke="${HEX.cobalt}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  for (const n of sizes) {
    const on = n === current;
    for (const [f, col] of [
      [binary, HEX.goldDeep],
      [trie, HEX.cobalt],
    ] as const)
      g += `<circle cx="${lx(n).toFixed(1)}" cy="${ly(f(n)).toFixed(1)}" r="${on ? 3.6 : 2.6}" fill="${col}" stroke="#F8F5EE" stroke-width="1.5"/>`;
  }
  // direct labels at the right end, nudged apart
  const ends = [
    { text: 'every word', y: ly(1e5), cls: 'ref' },
    { text: 'binary search', y: ly(binary(1e5)), cls: 'nm bs' },
    { text: 'trie', y: ly(L), cls: 'nm on' },
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11);
  for (const e of ends) g += `<text x="${right + 4}" y="${(e.y + 3).toFixed(1)}" class="${e.cls}">${e.text}</text>`;
  const rows = sizes.map(n => `<tr><th>${commas(n)}</th><td>${n}</td><td>${binary(n)}</td><td>${L}</td></tr>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    `Steps to find ${word}: checking every word takes up to n steps, binary search about log₂ n, a trie always ${L}. At 2,000 words: 2,000, ${binary(2000)} and ${L}.`,
  )}">${g}</svg>
  <div class="st-legend"><span><i class="ln tr"></i>trie: ${plural(L, 'step')}, one per letter</span><span><i class="ln bs"></i>binary search: log₂ n words</span><span><i class="ln ev"></i>check every word</span></div>
  <table class="sr"><caption>Steps to find ${esc(word)}</caption><thead><tr><th>Words</th><th>Every word</th><th>Binary search</th><th>Trie</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------------- what the speed costs ---------------- */

export interface MemoryStats {
  words: number;
  letters: number;
  nodes: number;
  slots: number;
  used: number;
  /** Bytes: written out, a trie with 26 slots a node, and a trie that keeps only the children it has. */
  bytes: { list: number; array: number; compact: number };
}

const PTR = 8;

export function memoryOf(d: Dict): MemoryStats {
  const S = shapeOf(d);
  const nodes = S.ids.length;
  const letters = letterCount(d),
    words = d.words.length;
  return {
    words,
    letters,
    nodes: nodes - 1,
    slots: nodes * SLOTS,
    used: nodes - 1,
    bytes: {
      list: letters + words,
      array: nodes * (SLOTS * PTR + 1),
      compact: nodes * 2 + (nodes - 1) * (1 + PTR),
    },
  };
}

const kb = (b: number): string =>
  b < 1024
    ? `${b} B`
    : b < 1024 * 1024
      ? `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`
      : `${(b / 1048576).toFixed(1)} MB`;

/** The memory card: slots in use, and three ways to store the same words, in bytes. */
export function memoryHTML(m: MemoryStats): string {
  const share = (100 * m.used) / m.slots;
  const bars: [string, number, string][] = [
    ['Written out, one after another', m.bytes.list, 'ls'],
    ['Trie, 26 slots in every node', m.bytes.array, 'ar'],
    ['Trie, only the children it has', m.bytes.compact, 'cp'],
  ];
  const max = Math.max(...bars.map(b => b[1]));
  const rows = bars
    .map(
      ([name, v, cls]) =>
        `<div class="mb"><div class="mb-top"><span>${name}</span><b>${kb(v)}</b></div><div class="mb-track"><i class="${cls}" style="width:${Math.max(0.6, (100 * v) / max).toFixed(2)}%"></i></div></div>`,
    )
    .join('');
  return `<p class="mm-lead"><b>${commas(m.nodes + 1)} nodes × 26 slots = ${commas(m.slots)} slots.</b> Only ${commas(m.used)} hold a child: ${share < 1 ? share.toFixed(2) : share.toFixed(1)}%. The rest are empty, and they are what makes each step one lookup.</p>
  ${rows}
  <p class="mm-note">With 8-byte pointers, the trie that finds any word in one step per letter needs about ${Math.round(m.bytes.array / m.bytes.list)} times the memory of the words written out. Keeping only the children a node has saves most of it, but then each step must search its list; a radix tree also merges chains like O-O-N into one edge.</p>`;
}

/* ---------------- which structure when ---------------- */

export function whenHTML(): string {
  const rows: [string, string, string, string, string][] = [
    ['Trie', 'L', 'L + k', 'yes', 'most'],
    ['Hash set', 'L', 'n · L', 'no', 'less'],
    ['Sorted list', 'L log n', 'L log n + k', 'yes', 'least'],
    ['Plain list', 'n · L', 'n · L', 'no', 'least'],
  ];
  const big = (v: string) =>
    v.replace(/\bn\b/g, '<i>n</i>').replace(/\bL\b/g, '<i>L</i>').replace(/\bk\b/g, '<i>k</i>');
  const body = rows
    .map(
      ([name, find, pre, order, space], i) =>
        `<tr${i === 0 ? ' class="on"' : ''}><th scope="row">${name}</th><td>${big(find)}</td><td>${big(pre)}</td><td>${order}</td><td>${space}</td></tr>`,
    )
    .join('');
  return `<table><caption>Letters read for a word of <i>L</i> letters among <i>n</i>; <i>k</i> words found</caption><thead><tr><th scope="col"><span class="sr">Structure</span></th><th scope="col">Find</th><th scope="col">Prefix</th><th scope="col">A–Z</th><th scope="col">Space</th></tr></thead><tbody>${body}</tbody></table>
  <div class="cx-notes"><p><b>A trie wins</b> when you ask about beginnings: autocomplete, spell check, a phone's predictive text, routing tables that match the longest prefix of an address. A hash set finds a whole word just as fast, but to list the words that start with CA it has to check every word it holds.</p></div>`;
}

/* ---------------- the inspector ---------------- */

export interface Inspection {
  disc: string;
  title: string;
  sub: string;
  cells: [string, string][];
  note: string;
}

/** A clicked node: what it spells, whether a word ends there, and what its slots hold. */
export function inspect(d: Dict, id: string): Inspection | null {
  if (id.includes('|')) return null;
  const S = shapeOf(d);
  const i = S.index.get(id);
  if (i == null) return null;
  const kids = S.kids[i].map(k => S.ch[k]);
  const words = S.below[i];
  const isWord = !!S.word[i];
  if (i === 0)
    return {
      disc: discSVG('', 40, HEX.gold),
      title: 'The root',
      sub: 'the empty beginning every word shares',
      cells: [
        ['First letters', `${kids.length} of 26 slots`],
        ['Words below', commas(words)],
      ],
      note: `Its slots hold ${kids.join(', ') || 'nothing'}. Every search starts here.`,
    };
  return {
    disc: discSVG(S.ch[i], 40, HEX.ink, isWord),
    title: id,
    sub: `${isWord ? 'a word' : 'a prefix, not a word'} · ring ${S.depth[i]}`,
    cells: [
      ['Steps to reach', plural(S.depth[i], 'step')],
      ['Words from here', commas(words)],
      ['Slots in use', `${kids.length} of 26`],
      ['Word mark', isWord ? 'yes' : 'no'],
    ],
    note: kids.length
      ? `Its slots ${kids.join(', ')} hold children; the other ${26 - kids.length} are empty.`
      : `A leaf: all 26 of its slots are empty.`,
  };
}

/* ---------------- legend, chips, masthead ---------------- */

export function legendHTML(full: boolean): string {
  const disc = (fill: string, ring: string | null, glyph: string = HEX.light) =>
    `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">${ring ? `<circle cx="11" cy="11" r="9.6" fill="none" stroke="${ring}" stroke-width="2.2"/>` : ''}<circle cx="11" cy="11" r="${ring ? 6.6 : 8}" fill="${fill}"/>${glyphSVG('A', 11, 11, 7, glyph, 16)}</svg>`;
  const path = `<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><path d="M3 13 L27 3" stroke="${HEX.cobalt}" stroke-width="2.4" stroke-linecap="round"/><circle cx="27" cy="3" r="2.6" fill="${HEX.cobalt}"/></svg>`;
  const empty = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8.5" fill="#F8F5EE" stroke="${HEX.red}" stroke-width="1.8" stroke-dasharray="3 2.4"/></svg>`;
  const items: [string, string, string][] = [
    [disc(HEX.ink, HEX.gold), 'A word ends', 'a gold ring: the word mark'],
    [path, 'The path', 'one step per letter from the gold centre'],
    [disc(HEX.gold, null, HEX.ink), 'A new node', 'made by an insert'],
    [empty, 'An empty slot', 'where the path runs out'],
  ];
  return items
    .map(([svg, b, s]) => `<div class="lg">${svg}<div><b>${b}</b>${full ? '' : `<span>${s}</span>`}</div></div>`)
    .join('');
}

export const chipsHTML = (chips: readonly Chip[]): string =>
  chips.map(c => `<span class="chip${c.tone ? ` ${c.tone}` : ''}">${esc(c.text)}</span>`).join('');

/** The masthead's small line. */
export const statsLine = (d: Dict): string =>
  `${commas(d.words.length)} words · ${commas(shapeOf(d).ids.length - 1)} nodes`;
