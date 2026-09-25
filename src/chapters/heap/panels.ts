// The cards beside the sculpture: the code being run with its current line lit,
// the cost table (a heap against sorted and unsorted arrays), heapify's work row by
// row, the work chart (what every operation actually cost), Graph Net's map during
// Dijkstra, the inspector for a clicked key, the legend and the chips.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { codeTitle, listing, type CodeKey } from './code';
import type { DItem, Diagram, OpKey, Step, Tone } from './diagram';
import { KNOTS, STRINGS, START, type NetState } from './dijkstra';
import {
  heightOf,
  leftOf,
  parentOf,
  pushBound,
  heapifyBound,
  rightOf,
  rowOf,
  rowsFor,
  type Entry,
  type Order,
} from './heap';
import { words } from './ops';
import { HEX } from './palette';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const INK = '#1B1A17',
  OP = '#2346A8',
  BUILD = '#B07B08',
  GRID = 'rgba(27, 26, 23, 0.14)',
  MUTED = '#57524A',
  PAPER = '#F8F5EE';

/** A disc like the ones on the plinth, for the panels. */
export function discSVG(label: string, tone: Tone, size = 26): string {
  const r = size / 2,
    H = HEX[tone],
    gh = label.length > 1 ? size * 0.34 : size * 0.44;
  const stroke =
    tone === 'out'
      ? ` stroke="${H.rim}" stroke-width="1.6"`
      : tone === 'look'
        ? ` stroke="${H.rim}" stroke-width="2.6"`
        : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 1.4}" fill="${H.fill}"${stroke}/>${glyphSVG(label, r, r, gh, H.glyph, 15)}</svg>`;
}

/* ---------------- code ---------------- */

export class CodeCard {
  /** undefined until the first show(), so the empty state is drawn once. */
  private sig: string | undefined = undefined;
  private lines: HTMLLIElement[] = [];
  private readonly title: HTMLElement;
  private readonly list: HTMLOListElement;

  constructor(title: HTMLElement, list: HTMLOListElement) {
    this.title = title;
    this.list = list;
  }

  show(key: CodeKey | null, order: Order, line: number): void {
    const sig = key ? `${key}:${order}` : '';
    if (sig !== this.sig) {
      this.sig = sig;
      this.title.textContent = key ? codeTitle(key, order) : 'The code';
      this.title.classList.toggle('mono', !!key);
      this.list.innerHTML = key
        ? listing(key, order)
            .map(l => `<li>${esc(l).replace(/\/\/.*$/, m => `<i>${m}</i>`)}</li>`)
            .join('')
        : '<li class="none">Pick an operation to see its code.</li>';
      this.lines = [...this.list.querySelectorAll('li')];
    }
    this.lines.forEach((li, k) => li.classList.toggle('on', k === line));
  }
}

/* ---------------- cost: a heap against the arrays ---------------- */

const ROWS: readonly { op: OpKey; label: (o: Order) => string; heap: string; sorted: string; unsorted: string }[] = [
  { op: 'peek', label: o => `Peek ${words(o).top}`, heap: 'O(1)', sorted: 'O(1)', unsorted: 'O(n)' },
  { op: 'push', label: () => 'Push', heap: 'O(log n)', sorted: 'O(n)', unsorted: 'O(1)' },
  { op: 'pop', label: o => `Pop ${words(o).top}`, heap: 'O(log n)', sorted: 'O(1)', unsorted: 'O(n)' },
  { op: 'lower', label: () => 'Change key', heap: 'O(log n)', sorted: 'O(n)', unsorted: 'O(1)' },
  { op: 'build', label: () => 'Build', heap: 'O(n)', sorted: 'O(n log n)', unsorted: 'O(n)' },
];

const cx = (v: string) =>
  `<span class="${v === 'O(1)' ? 'fast' : v === 'O(log n)' ? 'mid' : 'slow'}">${v
    .replace('O(', '<i>O</i>(')
    .replace(/\bn\b/g, '<i>n</i>')}</span>`;

/** A heap against a sorted and an unsorted array, with the current operation lit. */
export function costHTML(op: OpKey | null, order: Order): string {
  return `<table><thead><tr><th scope="col"><span class="sr">Operation</span></th><th scope="col" class="col">Heap</th><th scope="col">Sorted</th><th scope="col">Unsorted</th></tr></thead><tbody>${ROWS.map(
    r =>
      `<tr${r.op === op ? ' class="on"' : ''}><th scope="row">${r.label(order)}</th><td class="col">${cx(r.heap)}</td><td>${cx(r.sorted)}</td><td>${cx(r.unsorted)}</td></tr>`,
  ).join(
    '',
  )}</tbody></table><div class="cx-notes"><p>Sorted and Unsorted are plain arrays, kept in order or not. A sorted array pops in O(1) but pays O(n) to push; an unsorted one pushes in O(1) but searches all n to pop. A heap does both in O(log n): only one path from a leaf to the top is ever in order.</p><p>A heap is no good for search: nothing says which subtree holds a key, so finding one is O(n).</p></div>`;
}

/* ---------------- heapify's work, row by row ---------------- */

/**
 * Where the work of building a heap can go, row by row: heapify sinks each key at
 * most its height (big near the top, where keys are few), n pushes lift each key at
 * most its row (big near the bottom, where keys are many).
 */
export function rowsHTML(n: number): string {
  const R = rowsFor(n);
  if (n < 2) return '<p class="rw-empty">Heapify a few keys to see where the work goes.</p>';
  const rows = Array.from({ length: R }, (_, r) => {
    const keys = Math.min(2 ** r, n - (2 ** r - 1));
    const first = 2 ** r - 1;
    // every key in a row can sink as far as the deepest one below it
    let sink = 0;
    for (let i = first; i < first + keys; i++) sink += heightOf(i, n);
    return { r, keys, sink, climb: keys * r };
  });
  const max = Math.max(1, ...rows.map(x => Math.max(x.sink, x.climb)));
  const W = 260,
    mid = 130,
    half = 92,
    rowH = 20,
    top = 18,
    H = top + R * rowH + 26;
  let g = `<text x="${mid - 8}" y="11" text-anchor="end" class="hd">heapify: sink</text><text x="${mid + 8}" y="11" class="hd">push each: climb</text>`;
  rows.forEach((x, k) => {
    const y = top + k * rowH,
      bh = 12,
      rl = (x.sink / max) * half,
      rr = (x.climb / max) * half;
    const rad = (w: number) => Math.min(4, w / 2, bh / 2);
    if (rl > 0.5) {
      const r = rad(rl);
      g += `<path d="M${mid - 2} ${y} H${mid - 2 - rl + r} Q${mid - 2 - rl} ${y} ${mid - 2 - rl} ${y + r} V${y + bh - r} Q${mid - 2 - rl} ${y + bh} ${mid - 2 - rl + r} ${y + bh} H${mid - 2} Z" fill="${BUILD}"><title>Row ${x.r}: ${plural(x.keys, 'key')}, heapify sinks them at most ${x.sink} rows in all</title></path>`;
    }
    if (rr > 0.5) {
      const r = rad(rr);
      g += `<path d="M${mid + 2} ${y} H${mid + 2 + rr - r} Q${mid + 2 + rr} ${y} ${mid + 2 + rr} ${y + r} V${y + bh - r} Q${mid + 2 + rr} ${y + bh} ${mid + 2 + rr - r} ${y + bh} H${mid + 2} Z" fill="${OP}"><title>Row ${x.r}: ${plural(x.keys, 'key')}, pushes lift them at most ${x.climb} rows in all</title></path>`;
    }
    g += `<text x="${mid - 6 - rl}" y="${y + 9.5}" text-anchor="end" class="v">${x.sink}</text><text x="${mid + 6 + rr}" y="${y + 9.5}" class="v">${x.climb}</text>`;
    g += `<text x="4" y="${y + 9.5}" class="rl">row ${x.r}</text><text x="${W - 4}" y="${y + 9.5}" text-anchor="end" class="rl">${x.keys}</text>`;
  });
  const yT = top + R * rowH + 14;
  g += `<line x1="${mid}" x2="${mid}" y1="${top - 4}" y2="${top + R * rowH - 4}" stroke="${MUTED}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  g += `<text x="${mid - 8}" y="${yT}" text-anchor="end" class="tot">≤ ${heapifyBound(n)}</text><text x="${mid + 8}" y="${yT}" class="tot">≤ ${pushBound(n)}</text>`;
  const table = rows
    .map(x => `<tr><td>Row ${x.r}</td><td>${x.keys}</td><td>${x.sink}</td><td>${x.climb}</td></tr>`)
    .join('');
  return `<div class="rw-legend" aria-hidden="true"><span><i class="sw re"></i>Heapify</span><span><i class="sw op"></i>n pushes</span><span class="rw-k">keys</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The most swaps each row can need for ${n} keys: heapify at most ${heapifyBound(n)} in all, pushing one at a time at most ${pushBound(n)}.">${g}</svg>
    <p class="rw-sum">Most keys are near the bottom. Heapify only sinks them, and there is little room below; pushes lift them, and there is a long way up.</p>
    <table class="sr"><caption>Most swaps per row</caption><thead><tr><th>Row</th><th>Keys</th><th>Heapify</th><th>Pushes</th></tr></thead><tbody>${table}</tbody></table>`;
}

/* ---------------- the work chart ---------------- */

const SHOW = 40;

const verb: Record<Entry['kind'], string> = { push: 'Push', pop: 'Pop', build: 'Heapify', lower: 'Lower' };
const keyName = (e: Entry) => (e.tag ? `${e.tag} ${e.key}` : String(e.key));
const describe = (e: Entry) =>
  e.kind === 'build'
    ? `Heapify ${plural(e.key, 'key')}: ${plural(e.swaps, 'swap')}, at most ${e.bound}`
    : `${verb[e.kind]} ${keyName(e)}: ${plural(e.swaps, 'swap')}, at most ${e.bound}`;

const niceMax = (v: number) => (v <= 4 ? 4 : v <= 6 ? 6 : v <= 8 ? 8 : v <= 10 ? 10 : Math.ceil(v / 5) * 5);

/**
 * What every operation actually cost, in swaps: one column each, oldest on the
 * left, over a pale track as tall as the most it could have needed. A push or pop
 * never outgrows the height of the tree; a heapify never outgrows n.
 */
export class WorkChart {
  private readonly svg: SVGSVGElement;
  private readonly tip: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly table: HTMLElement;
  private entries: Entry[] = [];
  private sig = '';

  constructor(host: HTMLElement) {
    host.innerHTML = `<div class="wc-legend" aria-hidden="true"><span><i class="sw op"></i>Push, pop</span><span><i class="sw re"></i>Heapify</span><span><i class="sw tr"></i>Most it could need</span></div>
      <div class="wc-plot"><svg viewBox="0 0 260 110" role="img"></svg><div class="wc-tip" hidden></div></div>
      <p class="wc-sum"></p><table class="sr"><caption>Swaps per operation</caption><tbody></tbody></table>`;
    this.svg = host.querySelector('svg') as SVGSVGElement;
    this.tip = host.querySelector('.wc-tip') as HTMLElement;
    this.summary = host.querySelector('.wc-sum') as HTMLElement;
    this.table = host.querySelector('tbody') as HTMLElement;
    const hover = (e: Event) => {
      const t = (e.target as Element).closest?.('[data-i]');
      if (!t) return this.hideTip();
      this.showTip(Number(t.getAttribute('data-i')), t as SVGGraphicsElement);
    };
    this.svg.addEventListener('pointermove', hover);
    this.svg.addEventListener('focusin', hover);
    this.svg.addEventListener('pointerleave', () => this.hideTip());
    this.svg.addEventListener('focusout', () => this.hideTip());
  }

  private hideTip(): void {
    this.tip.hidden = true;
  }

  private showTip(i: number, el: SVGGraphicsElement): void {
    const e = this.entries[i];
    if (!e) return;
    this.tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${plural(e.swaps, 'swap')}`;
    const s = document.createElement('span');
    s.textContent = `${e.kind === 'build' ? `Heapify ${e.key}` : `${verb[e.kind]} ${keyName(e)}`} · at most ${e.bound}`;
    this.tip.append(b, s);
    this.tip.hidden = false;
    const host = this.svg.getBoundingClientRect(),
      r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - host.left;
    this.tip.style.left = `${Math.max(0, Math.min(host.width - 116, x - 58))}px`;
  }

  /** Show the ledger up to `upto` entries. */
  render(ledger: readonly Entry[], upto: number): void {
    const all = ledger.slice(0, upto);
    const sig = `${all.length}:${all.map(e => `${e.swaps}/${e.bound}`).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.entries = all;
    const offset = Math.max(0, all.length - SHOW),
      shown = all.slice(offset);
    const W = 260,
      H = 110,
      top = 10,
      base = H - 14,
      left = 22,
      right = W - 6;
    const max = niceMax(Math.max(4, ...shown.map(e => Math.max(e.bound, e.swaps))));
    const y = (v: number) => base - (v / max) * (base - top);
    const slot = (right - left) / Math.max(12, shown.length);
    const bw = Math.min(18, Math.max(2, slot - 2));
    let g = '';
    for (const t of shown.length ? [0, max / 2, max] : [0])
      g += `<line x1="${left}" x2="${right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${GRID}" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${left - 5}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" class="tk">${t}</text>`;
    const col = (h: number, x0: number, fill: string, op = 1) => {
      if (h <= 0.2) return '';
      const r = Math.min(4, bw / 2, h),
        y0 = base - h;
      return `<path d="M${x0} ${base} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} H${x0 + bw - r} Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} V${base} Z" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
    };
    shown.forEach((e, j) => {
      const i = offset + j,
        cxm = left + slot * (j + 0.5),
        x0 = cxm - bw / 2;
      const c = e.kind === 'build' ? BUILD : OP;
      g += col(base - y(e.bound), x0, c, 0.16);
      g += col(base - y(e.swaps), x0, c);
      g += `<rect data-i="${i}" x="${(cxm - slot / 2).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${base - top}" fill="transparent" tabindex="-1"><title>${esc(describe(e))}</title></rect>`;
    });
    g += `<line x1="${left}" x2="${right}" y1="${base}" y2="${base}" stroke="${MUTED}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (!shown.length)
      g += `<text x="${(left + right) / 2}" y="${(top + base) / 2 + 3}" text-anchor="middle" class="empty">Push or pop to see what it costs.</text>`;
    this.svg.innerHTML = g;
    const last = all[all.length - 1];
    this.svg.setAttribute(
      'aria-label',
      all.length
        ? `Swaps per operation for the last ${shown.length} operations, each within the most it could need.`
        : 'No operations yet.',
    );
    const single = all.filter(e => e.kind !== 'build');
    this.summary.textContent = all.length
      ? `${single.length ? 'None climbed or sank past the height of the tree. ' : ''}Last: ${describe(last)}.`
      : '';
    this.table.textContent = '';
    for (const e of shown) {
      const tr = document.createElement('tr'),
        td = document.createElement('td');
      td.textContent = describe(e);
      tr.appendChild(td);
      this.table.appendChild(tr);
    }
  }
}

/* ---------------- Graph Net's map, during Dijkstra ---------------- */

/** The Textbook graph as Graph Net draws it, painted with where the run stands. */
export function netSVG(net: NetState): string {
  const xs = KNOTS.map(k => k.x),
    zs = KNOTS.map(k => k.z);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z0 = Math.min(...zs),
    z1 = Math.max(...zs);
  const W = 260,
    H = 150,
    pad = 18;
  const px = (x: number) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const pz = (z: number) => pad + 4 + ((z - z0) / (z1 - z0)) * (H - 2 * pad - 8);
  const at = new Map(KNOTS.map(k => [k.label, k]));
  let g = '';
  for (const [a, b, w] of STRINGS) {
    const A = at.get(a),
      B = at.get(b);
    if (!A || !B) continue;
    const hot = net.edge && ((net.edge[0] === a && net.edge[1] === b) || (net.edge[0] === b && net.edge[1] === a));
    g += `<line x1="${px(A.x).toFixed(1)}" y1="${pz(A.z).toFixed(1)}" x2="${px(B.x).toFixed(1)}" y2="${pz(B.z).toFixed(1)}" stroke="${hot ? OP : 'rgba(27,26,23,0.35)'}" stroke-width="${hot ? 2.4 : 1.2}"/>`;
    const mx = (px(A.x) + px(B.x)) / 2,
      my = (pz(A.z) + pz(B.z)) / 2;
    g += `<text x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" class="w${hot ? ' hot' : ''}">${w}</text>`;
  }
  for (const k of KNOTS) {
    const x = px(k.x),
      y = pz(k.z);
    const settled = net.settled.includes(k.label),
      queued = net.queued.includes(k.label),
      cur = net.cur === k.label;
    const fill = cur ? OP : settled ? INK : PAPER;
    const stroke = queued ? OP : INK;
    const d = net.dist[k.label];
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${fill}" stroke="${stroke}" stroke-width="${queued ? 2.4 : 1.4}"/>`;
    g += glyphSVG(k.label, x, y, 8, cur || settled ? '#FFFFFF' : INK, 16);
    g += `<text x="${x.toFixed(1)}" y="${(y - 13).toFixed(1)}" text-anchor="middle" class="d">${d === Infinity || d == null ? '∞' : d}</text>`;
  }
  const status = `From ${START}: ${net.settled.length ? `settled ${net.settled.join(', ')}` : 'nothing settled yet'}. In the queue: ${net.queued.length ? net.queued.join(', ') : 'nothing'}.`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(status)}">${g}</svg><div class="net-key"><span><i class="k set"></i>settled</span><span><i class="k q"></i>ticket in the heap</span><span><i class="k cur"></i>working</span></div>`;
}

/* ---------------- chips under the narration ---------------- */

export function costChips(step: Step | null): string {
  if (!step) return '';
  const c = step.cost;
  const chip = (n: number, one: string, many: string, cls = '') =>
    n ? `<span class="chip${cls ? ' ' + cls : ''}">${n} ${n === 1 ? one : many}</span>` : '';
  return [chip(c.compares, 'comparison', 'comparisons'), chip(c.swaps, 'swap', 'swaps', 'cobalt')].join('');
}

/* ---------------- inspector ---------------- */

export interface InspectorView {
  disc: string;
  title: string;
  sub: string;
  cells: [string, string][];
  note: string;
}

const inSlot = (d: Diagram, i: number): DItem | undefined =>
  d.items.find(it => it.place.at === 'slot' && it.place.i === i);
const nm = (it: DItem | undefined) => (it ? (it.tag ? `${it.tag} ${it.key}` : String(it.key)) : '');

/** What the inspector shows for a key's disc, or null if it is gone. */
export function inspect(d: Diagram, key: string): InspectorView | null {
  const it = d.items.find(i => i.id === key);
  if (!it) return null;
  const w = words(d.order),
    label = nm(it);
  if (it.place.at === 'out') {
    const j = it.place.j;
    return {
      disc: discSVG(String(it.key), 'out', 56),
      title: `${label} · out ${ordinal(j + 1)}`,
      sub: 'taken off the top',
      cells: [
        ['Key', label],
        ['Came out', ordinal(j + 1)],
      ],
      note: `Keys come off the top ${w.best} first, so the out tray is in order${it.tag ? ' of distance' : ''}.`,
    };
  }
  const i = it.place.i,
    p = parentOf(i),
    l = leftOf(i),
    r = rightOf(i);
  const par = i > 0 ? inSlot(d, p) : undefined;
  const kids = [l, r].filter(c => c < d.n);
  const cells: [string, string][] = [
    ['Slot', String(i)],
    ['Row', `${rowOf(i)} of ${rowsFor(d.n)}`],
    ['Parent', i === 0 ? 'none: the top' : `(${i} − 1) / 2 = ${p} · ${nm(par)}`],
    [
      'Children',
      kids.length
        ? kids.map((c, k) => `${k ? '2·' + i + ' + 2' : '2·' + i + ' + 1'} = ${c} · ${nm(inSlot(d, c))}`).join('<br>')
        : `none: 2·${i} + 1 = ${l} is past the end`,
    ],
  ];
  const cousins = d.items.filter(
    o => o.place.at === 'slot' && o.id !== it.id && rowOf(o.place.i) === rowOf(i) && o.place.i !== i,
  );
  const note =
    i === 0
      ? `The ${w.best} key: no parent above it, and every key below it is no ${w.better}.`
      : kids.length
        ? `No key below it is ${w.better} than ${label}, and its parent is no ${w.worse}. That is all a heap promises: nothing says ${label} is ${w.better} than keys in other branches.`
        : `A leaf. ${cousins.length ? `Its neighbours in the row can be ${w.better} or ${w.worse}: a heap only orders parents over children, never side to side.` : ''}`;
  return {
    disc: discSVG(String(it.key), it.tone, 56),
    title: `${label} · in slot ${i}`,
    sub: i === 0 ? `the top: the ${w.best} key` : kids.length ? `row ${rowOf(i)}` : `a leaf in row ${rowOf(i)}`,
    cells,
    note: note.trim(),
  };
}

const ordinal = (n: number): string => {
  const s =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${s}`;
};

/* ---------------- legend ---------------- */

const ICON = {
  wire: `<svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true"><path d="M14 5 L6 21 M14 5 L22 21" stroke="#1B1A17" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bad: `<svg width="28" height="26" viewBox="0 0 28 26" aria-hidden="true"><path d="M8 5 L20 21" stroke="#D1361E" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  arc: `<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true"><path d="M4 21 Q15 2 26 21" fill="none" stroke="#2346A8" stroke-width="1.8"/><path d="M26 21 L21.5 15.5 L28 16 Z" fill="#2346A8"/><rect x="1" y="21" width="6" height="4" rx="1" fill="#C9C0B0"/><rect x="23" y="21" width="6" height="4" rx="1" fill="#C9C0B0"/></svg>`,
  ghost: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="none" stroke="#57524A" stroke-width="1.6" stroke-dasharray="3 2.4"/></svg>`,
};

function lg(icon: string, label: string, sub: string): string {
  return `<div class="lg">${icon}<div><b>${label}</b><span>${sub}</span></div></div>`;
}

export function legendHTML(order: Order, small: boolean): string {
  const w = words(order);
  const disc = (t: Tone, l: string) => discSVG(l, t, small ? 22 : 28);
  const parts: string[] = [
    lg(ICON.wire, 'Wire', `parent no ${w.worse} than child`),
    lg(ICON.bad, 'Red wire', 'out of order here'),
    lg(ICON.arc, 'Arc', 'the index sum, in the array'),
  ];
  if (!small) {
    parts.push(lg(ICON.ghost, 'Next free slot', 'where a push goes'));
    parts.push(lg(disc('new', '5'), 'New key', 'on its way in'));
    parts.push(lg(disc('cur', '8'), 'Moving', 'the key being sifted'));
    parts.push(lg(disc('look', '3'), 'Compared', 'the key it is checked against'));
    parts.push(lg(disc('out', '1'), 'Out', `taken off the top, ${w.best} first`));
  }
  return parts.join('');
}

/** The line under the title. */
export function statsLine(d: Diagram): string {
  return `${plural(d.n, 'key')} · ${plural(rowsFor(d.n), 'row')}`;
}
