// The cards beside the loom: the code being run with its current line lit, the
// work each sort does on these threads (comparisons or writes), how that work grows
// with n, which sort to use when, the inspector for a followed thread, the legend
// and the placard's chips.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { LISTINGS } from './code';
import type { Mode, Recording, Step } from './diagram';
import { COL, dye, glyphOn, hexOf, shade } from './palette';
import { NAMES, SHORT, SORTS, STABLE, countSort, nlogn, pairs, type SortKey } from './sorts';
import { makeThreads, INPUT_NAMES, type InputKind, type Threads } from './threads';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const INK = '#1B1A17',
  OP = '#2346A8',
  GRID = 'rgba(27, 26, 23, 0.14)',
  MUTED = '#57524A',
  FAINT = '#8C857A';

/** A disc like the ones at the front of the loom, for the panels. */
export function discSVG(label: string, v: number, top: number, size = 26): string {
  const r = size / 2,
    t = shade(v, top);
  const gh = label.length > 1 ? size * 0.34 : size * 0.44;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="${hexOf(dye(t))}"/>${glyphSVG(label, r, r, gh, hexOf(glyphOn(t)), 15)}</svg>`;
}

/* ---------------- code ---------------- */

export const codeTitle = (key: SortKey): string => `${key}Sort(a)`;

export class CodeCard {
  private sig: string | undefined = undefined;
  private lines: HTMLLIElement[] = [];
  private readonly title: HTMLElement;
  private readonly list: HTMLOListElement;

  constructor(title: HTMLElement, list: HTMLOListElement) {
    this.title = title;
    this.list = list;
  }

  show(key: SortKey | null, line: number): void {
    const sig = key ?? '';
    if (sig !== this.sig) {
      this.sig = sig;
      this.title.textContent = key ? codeTitle(key) : 'The code';
      this.title.classList.toggle('mono', !!key);
      this.list.innerHTML = key
        ? LISTINGS[key].map(l => `<li>${esc(l).replace(/\/\/.*$/, m => `<i>${m}</i>`)}</li>`).join('')
        : '<li class="none">Pick one sort to watch its code run, line by line.</li>';
      this.lines = [...this.list.querySelectorAll('li')];
    }
    this.lines.forEach((li, k) => li.classList.toggle('on', k === line));
  }
}

/* ---------------- the work on these threads ---------------- */

export type Measure = 'comps' | 'writes';

export interface WorkRow {
  key: SortKey;
  total: number;
  /** Done so far: the whole total when the sort is not playing. */
  now: number;
  live: boolean;
}

const niceMax = (v: number): number => {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

/**
 * Six bars, one per sort: a pale track for all the work it needs on these threads
 * and a fill for the work done so far. For comparisons, marks at n log₂ n and at
 * every pair show the two families.
 */
export function workSVG(rows: readonly WorkRow[], n: number, measure: Measure, mode: Mode): string {
  const W = 260,
    rowH = 17,
    top = 16,
    left = 62,
    right = W - 30;
  const H = top + rows.length * rowH + 6;
  const refs = measure === 'comps' ? [nlogn(n), pairs(n)] : [];
  const max = niceMax(Math.max(...rows.map(r => r.total), ...refs, 4));
  const x = (v: number) => left + (v / max) * (right - left);
  let g = '';
  refs.forEach((v, k) => {
    const xv = x(v).toFixed(1);
    g += `<line x1="${xv}" x2="${xv}" y1="${top - 3}" y2="${H - 4}" stroke="${INK}" stroke-width="1" ${k === 0 ? 'stroke-dasharray="3 3"' : ''} vector-effect="non-scaling-stroke" opacity="0.55"/>`;
    // n log₂ n reads leftward from its line and every pair rightward, so the two never meet
    g += `<text x="${(x(v) + (k === 0 ? -3 : 3)).toFixed(1)}" y="${top - 6}" text-anchor="${k === 0 ? 'end' : 'start'}" class="ref">${k === 0 ? 'n log₂ n' : 'every pair'}</text>`;
  });
  rows.forEach((r, i) => {
    const y = top + i * rowH + 3,
      bh = rowH - 7;
    const col = r.live ? OP : MUTED;
    const track = x(r.total) - left,
      fill = x(r.now) - left;
    g += `<text x="${left - 6}" y="${y + bh - 1}" text-anchor="end" class="${r.live ? 'nm on' : 'nm'}">${SHORT[r.key]}</text>`;
    if (track > 0.5)
      g += `<rect x="${left}" y="${y}" width="${track.toFixed(1)}" height="${bh}" rx="2" fill="${col}" fill-opacity="0.16"/>`;
    if (fill > 0.5)
      g += `<rect x="${left}" y="${y}" width="${fill.toFixed(1)}" height="${bh}" rx="2" fill="${col}"${r.live ? '' : ' fill-opacity="0.75"'}/>`;
    const label = r.now < r.total ? `${r.now} / ${r.total}` : `${r.total}`;
    g += `<text x="${(x(r.total) + 4).toFixed(1)}" y="${y + bh - 1}" class="v${r.live ? ' on' : ''}">${label}</text>`;
  });
  const what = measure === 'comps' ? 'comparisons' : 'writes';
  const table = rows.map(r => `<tr><th>${NAMES[r.key]}</th><td>${r.now}</td><td>${r.total}</td></tr>`).join('');
  const lead =
    mode === 'race' ? `All six on the same ${n} threads.` : `The whole row, one bar per sort; the lit one is playing.`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${what} on ${n} threads: ${rows.map(r => `${SHORT[r.key]} ${r.total}`).join(', ')}`)}">${g}</svg>
    <p class="wc-sum">${lead} ${measure === 'comps' ? 'Comparisons are rows of cloth.' : 'Writes are keys put into the array: a swap is two, a shift one.'}</p>
    <table class="sr"><caption>${what}</caption><thead><tr><th>Sort</th><th>So far</th><th>In all</th></tr></thead><tbody>${table}</tbody></table>`;
}

/** The six rows for the work card: what each sort needs on these threads, and how far the playing ones are. */
export function workRows(rec: Recording, step: Step | null, th: Threads, measure: Measure): WorkRow[] {
  const playing = new Map(rec.looms.map((l, k) => [l.key, k]));
  return SORTS.map(key => {
    const k = playing.get(key);
    const c = countSort(key, th);
    const total = measure === 'comps' ? c.comps : c.writes;
    if (k == null) return { key, total, now: total, live: false };
    const run = rec.looms[k].run;
    let now = 0;
    if (step) {
      if (measure === 'comps') now = step.looms[k].rows;
      else if (step.ev) now = step.ev.writes;
      else {
        // a race: the writes made up to the rows woven
        const rows = step.looms[k].rows;
        const ev = run.events.filter(e => e.comps <= rows).pop();
        now = step.looms[k].done ? run.writes : (ev?.writes ?? 0);
      }
    }
    return { key, total, now, live: true };
  });
}

/* ---------------- growth with n ---------------- */

const GROW_N = [4, 8, 12, 16, 24, 32, 48, 64];
const growCache = new Map<InputKind, Record<SortKey, number[]>>();

/** Average comparisons for each sort at each n, on inputs of one kind. */
export function growth(kind: InputKind): Record<SortKey, number[]> {
  const cached = growCache.get(kind);
  if (cached) return cached;
  const out = {} as Record<SortKey, number[]>;
  const seeds = kind === 'reversed' ? [1] : [1, 2, 3, 4];
  for (const key of SORTS)
    out[key] = GROW_N.map(
      n => seeds.reduce((s, seed) => s + countSort(key, makeThreads(kind, n, seed)).comps, 0) / seeds.length,
    );
  growCache.set(kind, out);
  return out;
}

/**
 * Comparisons against n, from 4 keys to 64, on this kind of input: every pair and
 * n log₂ n as guides, the six sorts as lines, the one playing lit.
 */
export function growthSVG(kind: InputKind, n: number, lit: readonly SortKey[]): string {
  const data = growth(kind);
  const W = 260,
    H = 150,
    left = 30,
    right = W - 64,
    top = 8,
    base = H - 18;
  const maxN = 64,
    maxV = pairs(maxN);
  const x = (v: number) => left + (v / maxN) * (right - left);
  const y = (v: number) => base - (v / maxV) * (base - top);
  let g = '';
  for (const t of [0, 1000, 2000])
    g += `<line x1="${left}" x2="${right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${GRID}" vector-effect="non-scaling-stroke"/><text x="${left - 4}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" class="tk">${t}</text>`;
  for (const v of [8, 16, 24, 32, 48, 64])
    g += `<text x="${x(v).toFixed(1)}" y="${base + 12}" text-anchor="middle" class="tk">${v}</text>`;
  const curve = (f: (n: number) => number) => {
    let d = '';
    for (let v = 2; v <= maxN; v += 1) d += `${d ? 'L' : 'M'}${x(v).toFixed(1)} ${y(f(v)).toFixed(1)}`;
    return d;
  };
  g += `<path d="${curve(pairs)}" fill="none" stroke="${INK}" stroke-width="1.2" opacity="0.5" vector-effect="non-scaling-stroke"/>`;
  g += `<path d="${curve(nlogn)}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.55" vector-effect="non-scaling-stroke"/>`;
  g += `<text x="${(x(34) - 4).toFixed(1)}" y="${(y(pairs(34)) - 4).toFixed(1)}" text-anchor="end" class="ref">every pair</text>`;
  // the current n
  g += `<line x1="${x(n).toFixed(1)}" x2="${x(n).toFixed(1)}" y1="${top}" y2="${base}" stroke="${OP}" stroke-width="1" opacity="0.35" vector-effect="non-scaling-stroke"/>`;
  const line = (key: SortKey) =>
    GROW_N.map((v, i) => `${i ? 'L' : 'M'}${x(v).toFixed(1)} ${y(data[key][i]).toFixed(1)}`).join('');
  const quiet = SORTS.filter(k => !lit.includes(k)),
    loud = SORTS.filter(k => lit.includes(k));
  for (const key of quiet)
    g += `<path d="${line(key)}" fill="none" stroke="${FAINT}" stroke-width="1.2" opacity="0.7" vector-effect="non-scaling-stroke"/>`;
  for (const key of loud) {
    g += `<path d="${line(key)}" fill="none" stroke="${OP}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    GROW_N.forEach((v, i) => {
      g += `<circle cx="${x(v).toFixed(1)}" cy="${y(data[key][i]).toFixed(1)}" r="2.4" fill="${OP}"/>`;
    });
  }
  // direct labels at the right end, nudged apart so none overlap
  const ends = [
    { text: 'n log₂ n', y: y(nlogn(maxN)), cls: 'ref' },
    ...loud.map(key => ({ text: SHORT[key], y: y(data[key][GROW_N.length - 1]), cls: 'nm on' })),
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 10);
  for (const e of ends) g += `<text x="${right + 4}" y="${(e.y + 3).toFixed(1)}" class="${e.cls}">${e.text}</text>`;
  const table = SORTS.map(
    k => `<tr><th>${NAMES[k]}</th>${GROW_N.map((_, i) => `<td>${Math.round(data[k][i])}</td>`).join('')}</tr>`,
  ).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Comparisons as n grows from 4 to 64 on ${INPUT_NAMES[kind].toLowerCase()} input; at 64 keys: ${SORTS.map(k => `${SHORT[k]} ${Math.round(data[k][GROW_N.length - 1])}`).join(', ')}.`)}">${g}</svg>
    <table class="sr"><caption>Comparisons by n</caption><thead><tr><th>Sort</th>${GROW_N.map(v => `<th>${v}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table>`;
}

/* ---------------- which sort when ---------------- */

const BIG: Readonly<Record<SortKey, readonly [string, string, string, string]>> = {
  bubble: ['n', 'n²', 'n²', '1'],
  insertion: ['n', 'n²', 'n²', '1'],
  selection: ['n²', 'n²', 'n²', '1'],
  merge: ['n log n', 'n log n', 'n log n', 'n'],
  quick: ['n log n', 'n log n', 'n²', 'log n'],
  heap: ['n log n', 'n log n', 'n log n', '1'],
};

const WINS: Readonly<Record<SortKey, string>> = {
  bubble:
    'Hardly ever. It is the easiest to explain, and its early stop notices sorted input in one pass, but insertion sort does all it does, better.',
  insertion:
    'Small or nearly sorted arrays: it only pays for keys out of place. Real library sorts (Timsort, introsort) switch to it for short runs.',
  selection:
    'When writing costs far more than comparing: it makes at most n − 1 swaps. Its n² comparisons are paid on every input.',
  merge:
    'When you need a guarantee, stability, or data too big for memory: always O(n log n), and it merges sorted files as easily as arrays. The price is O(n) extra space.',
  quick:
    'Most arrays in memory: in place, cache-friendly and usually the fastest. A bad pivot makes it O(n²), so real ones choose it carefully and fall back to heap sort.',
  heap: 'When you need O(n log n) for certain and no extra memory. Slower than quick sort in practice and not stable; introsort uses it as a safety net.',
};

const big = (v: string): string => v.replace(/\bn\b/g, '<i>n</i>');

/** Best, average and worst comparisons, stability and extra space for all six, with one row lit. */
export function whenHTML(lit: SortKey | null, kind: InputKind): string {
  const rows = SORTS.map(k => {
    const [b, a, w, sp] = BIG[k];
    const cls = (v: string) => (v.includes('²') ? 'slow' : v === 'n' ? 'fast' : 'mid');
    return `<tr${k === lit ? ' class="on"' : ''}><th scope="row">${SHORT[k]}</th><td class="${cls(b)}">${big(b)}</td><td class="${cls(a)}">${big(a)}</td><td class="${cls(w)}">${big(w)}</td><td>${STABLE[k] ? 'yes' : '<span class="no">no</span>'}</td><td>${big(sp)}</td></tr>`;
  }).join('');
  const note = lit
    ? `<p><b>${NAMES[lit]} wins</b> ${WINS[lit].charAt(0).toLowerCase()}${WINS[lit].slice(1)}</p>`
    : `<p>Which sort wins depends on the input. On ${INPUT_NAMES[kind].toLowerCase()} threads, compare the cloths; then try another input.</p>`;
  return `<table><caption>Comparisons as <i>O</i>( ), and extra space</caption><thead><tr><th scope="col"><span class="sr">Sort</span></th><th scope="col">Best</th><th scope="col">Avg</th><th scope="col">Worst</th><th scope="col">Stable</th><th scope="col">Space</th></tr></thead><tbody>${rows}</tbody></table><div class="cx-notes">${note}</div>`;
}

/* ---------------- the inspector ---------------- */

export interface Inspection {
  disc: string;
  title: string;
  sub: string;
  cells: [string, string][];
  note: string;
}

/** A followed thread: where it started, where it is, how often it moved. */
export function inspect(rec: Recording, step: Step | null, t: number): Inspection | null {
  const th = rec.threads,
    thr = th.list[t];
  if (!thr) return null;
  const states = step ? step.looms : rec.start;
  const finalSlot = (k: number) => rec.looms[k].run.states[rec.looms[k].run.states.length - 1].indexOf(t);
  const moves = (k: number) => {
    const run = rec.looms[k].run,
      upto = states[k].rows;
    let m = 0;
    for (let p = 1; p <= Math.min(upto, run.states.length - 1); p++)
      if (run.states[p].indexOf(t) !== run.states[p - 1].indexOf(t)) m++;
    return m;
  };
  const disc = discSVG(thr.label, thr.v, th.top, 40);
  if (rec.mode === 'race') {
    return {
      disc,
      title: `${thr.label}`,
      sub: `started in slot ${t}, ends in slot ${finalSlot(0)}`,
      cells: rec.looms.map((l, k) => [SHORT[l.key], `${plural(moves(k), 'move')}`] as [string, string]),
      note: `Its thread is lit in all six cloths: follow how differently each sort carries the same key.`,
    };
  }
  const st = states[0];
  const now = st.arr.indexOf(t);
  const run = rec.looms[0].run;
  let compared = 0;
  const upto = st.rows;
  for (const ev of run.events) {
    if (ev.kind !== 'pick' || ev.comps > upto) continue;
    const before = run.states[ev.comps - 1];
    if (before[ev.i] === t || before[ev.j] === t) compared++;
  }
  return {
    disc,
    title: `${thr.label} · in slot ${now}`,
    sub: `started in slot ${t}${thr.twin ? `, twin ${thr.twin}` : ''}`,
    cells: [
      ['Started in', `slot ${t}`],
      ['Ends in', `slot ${finalSlot(0)}`],
      ['Compared', plural(compared, 'time')],
      ['Moved', plural(moves(0), 'time')],
    ],
    note: `Its thread is lit in the cloth: every bend is a move, every gold pick through it a comparison.`,
  };
}

/* ---------------- legend and chips ---------------- */

export function legendHTML(full: boolean): string {
  const thread = `<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><path d="M2 12 C10 12 12 4 20 4 L28 4" fill="none" stroke="${hexOf(dye(0.75))}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const pick = `<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><path d="M2 4 L28 4 M2 12 L28 12" stroke="${hexOf(dye(0.3))}" stroke-width="2" stroke-linecap="round"/><path d="M11 4 L17 12" stroke="${hexOf(COL.weft)}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const knot = `<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><path d="M2 4 C12 4 18 12 28 12 M2 12 C12 12 18 4 28 4" fill="none" stroke="${hexOf(dye(0.5))}" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="8" r="3.4" fill="${hexOf(COL.knot)}"/></svg>`;
  const items: [string, string, string][] = [
    [thread, 'A thread', 'one key: its height and shade are its value; a bend is a move'],
    [pick, 'A gold pick', 'one comparison: each is a row of cloth'],
    [knot, 'A knot', 'twins crossing: the sort is not stable'],
  ];
  return items
    .map(([svg, b, s]) => `<div class="lg">${svg}<div><b>${b}</b>${full ? '' : `<span>${s}</span>`}</div></div>`)
    .join('');
}

/** The chips under the narration: what the playing sort has spent so far. */
export function costChips(step: Step | null): string {
  if (!step || !step.ev) return '';
  const e = step.ev;
  return `<span class="chip">${plural(e.comps, 'comparison')}</span><span class="chip cobalt">${plural(e.writes, 'write')}</span>`;
}

/** The masthead's small line. */
export const statsLine = (th: Threads): string => `${th.n} threads · ${INPUT_NAMES[th.kind].toLowerCase()}`;
