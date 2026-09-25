// The cards beside the sculpture: the code being run with its current line lit,
// the cost table, the work chart (what every operation actually cost), the
// inspector for a clicked key, the legend, and the chips under the narration.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { CODE, codeTitle, type CodeKey } from './code';
import type { Diagram, OpKey, Step, Tone } from './diagram';
import { hashCode } from './hash';
import { fmtLoad } from './ops';
import { HEX } from './palette';
import type { Entry, Strategy } from './table';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A disc like the ones on the plinth, for the panels. */
export function discSVG(label: string, tone: Tone, size = 26): string {
  const r = size / 2,
    H = HEX[tone],
    gh = label.length > 1 ? size * 0.34 : size * 0.44;
  const stroke = tone === 'query' ? ` stroke="${H.rim}" stroke-width="1.6"` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 1.2}" fill="${H.fill}"${stroke}/>${glyphSVG(label, r, r, gh, H.glyph, 15)}</svg>`;
}

/* ---------------- code ---------------- */

export class CodeCard {
  /** undefined until the first show(), so the empty state is drawn once. */
  private key: CodeKey | null | undefined = undefined;
  private lines: HTMLLIElement[] = [];
  private readonly title: HTMLElement;
  private readonly list: HTMLOListElement;

  constructor(title: HTMLElement, list: HTMLOListElement) {
    this.title = title;
    this.list = list;
  }

  show(key: CodeKey | null, line: number): void {
    if (key !== this.key) {
      this.key = key;
      this.title.textContent = key ? codeTitle(key) : 'The code';
      this.title.classList.toggle('mono', !!key);
      this.list.innerHTML = key
        ? CODE[key].map(l => `<li>${esc(l).replace(/\/\/.*$/, m => `<i>${m}</i>`)}</li>`).join('')
        : '<li class="none">Pick an operation to see its code.</li>';
      this.lines = [...this.list.querySelectorAll('li')];
    }
    this.lines.forEach((li, k) => li.classList.toggle('on', k === line));
  }
}

/* ---------------- cost table ---------------- */

const ROWS: readonly { op: OpKey; label: string; avg: string; worst: string }[] = [
  { op: 'search', label: 'Search', avg: 'O(1)', worst: 'O(n)' },
  { op: 'insert', label: 'Insert', avg: 'O(1)*', worst: 'O(n)' },
  { op: 'delete', label: 'Delete', avg: 'O(1)', worst: 'O(n)' },
  { op: 'resize', label: 'Resize', avg: 'O(n)', worst: 'O(n)' },
];

const NOTES: Readonly<Record<Strategy, string[]>> = {
  chain: [
    'Average: a search looks at about 1 + α keys, where α = n / m is the load factor. Keep α under ¾ and that is a constant.',
    '* Amortized: a resize moves every key, but only after the table has doubled, so each insert pays a constant share.',
    'Worst: every key in one bucket, a chain of n. Java’s HashMap turns a chain of 8 into a balanced tree, which caps it at O(log n).',
  ],
  probe: [
    'Average: a miss looks at about ½(1 + 1/(1 − α)²) slots (Knuth): 2.5 at α = ½, 8.5 at α = ¾. Probing hates a full table.',
    '* Amortized: a resize moves every key, but only after the table has doubled, so each insert pays a constant share.',
    'Worst: one run of n full slots. Deletes leave tombstones, which lengthen runs until the next rehash.',
  ],
};

/** The cost of each operation, average and worst, with the current one lit. */
export function costHTML(strategy: Strategy, op: OpKey | null): string {
  const cell = (v: string) => {
    const o = v.replace(/\*$/, ''),
      star = v.endsWith('*') ? '<sup>*</sup>' : '';
    return `<span class="${o === 'O(1)' ? 'fast' : 'slow'}">${o.replace('O(', '<i>O</i>(').replace('(n)', '(<i>n</i>)')}</span>${star}`;
  };
  return `<table><thead><tr><th scope="col"><span class="sr">Operation</span></th><th scope="col" class="col">Average</th><th scope="col">Worst</th></tr></thead><tbody>${ROWS.map(
    r =>
      `<tr${r.op === op ? ' class="on"' : ''}><th scope="row">${r.label}</th><td class="col">${cell(r.avg)}</td><td>${cell(r.worst)}</td></tr>`,
  ).join('')}</tbody></table><div class="cx-notes">${NOTES[strategy].map(n => `<p>${n}</p>`).join('')}</div>`;
}

/* ---------------- the work chart ---------------- */

const SHOW = 40;
const INK = '#1B1A17',
  OP = '#2346A8',
  REHASH = '#B07B08',
  GRID = 'rgba(27, 26, 23, 0.14)',
  MUTED = '#57524A';

const verb: Record<Entry['kind'], string> = {
  insert: 'Insert',
  search: 'Search',
  delete: 'Delete',
  rehash: 'Rehash',
};
const describe = (e: Entry) =>
  e.kind === 'rehash'
    ? `Rehash: ${plural(e.work, 'key')} moved`
    : `${verb[e.kind]} ${e.key}: ${e.work} ${e.work === 1 ? 'look' : 'looks'}`;

/** Round up to a clean axis maximum. */
const niceMax = (v: number) => (v <= 4 ? 4 : v <= 6 ? 6 : v <= 8 ? 8 : v <= 10 ? 10 : Math.ceil(v / 5) * 5);

/**
 * What every operation actually cost: one column each, oldest on the left, with the
 * running average as a line. Most columns are short; a rehash is a spike; the average
 * stays flat, until the keys stop cooperating.
 */
export class WorkChart {
  private readonly svg: SVGSVGElement;
  private readonly tip: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly table: HTMLElement;
  private entries: Entry[] = [];
  private offset = 0;
  private sig = '';

  constructor(host: HTMLElement) {
    host.innerHTML = `<div class="wc-legend" aria-hidden="true"><span><i class="sw op"></i>Operation</span><span><i class="sw re"></i>Rehash</span><span><i class="ln"></i>Average so far</span></div>
      <div class="wc-plot"><svg viewBox="0 0 260 120" role="img"></svg><div class="wc-tip" hidden></div></div>
      <p class="wc-sum"></p><table class="sr"><caption>Work per operation</caption><tbody></tbody></table>`;
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
    b.textContent = e.kind === 'rehash' ? `${e.work} moved` : `${e.work} ${e.work === 1 ? 'look' : 'looks'}`;
    const s = document.createElement('span');
    s.textContent = `${e.kind === 'rehash' ? 'Rehash' : `${verb[e.kind]} ${e.key}`} · α ${fmtLoad(e.n, e.m)}`;
    this.tip.append(b, s);
    this.tip.hidden = false;
    const host = this.svg.getBoundingClientRect(),
      r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - host.left;
    this.tip.style.left = `${Math.max(0, Math.min(host.width - 110, x - 55))}px`;
  }

  /** Show the ledger up to `upto` entries. */
  render(ledger: readonly Entry[], upto: number): void {
    const all = ledger.slice(0, upto);
    const sig = `${all.length}:${all.map(e => e.work).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.offset = Math.max(0, all.length - SHOW);
    this.entries = all;
    const shown = all.slice(this.offset);
    const W = 260,
      H = 120,
      top = 12,
      base = H - 14,
      left = 22,
      right = W - 44;
    // the average over every operation so far (a rehash counts as the insert that caused it)
    const avg: number[] = [];
    let sum = 0,
      ops = 0;
    for (const e of all) {
      sum += e.work;
      if (e.kind !== 'rehash') ops++;
      avg.push(sum / Math.max(1, ops));
    }
    const max = niceMax(Math.max(4, ...shown.map(e => e.work), ...avg.slice(this.offset)));
    const y = (v: number) => base - (v / max) * (base - top);
    const slot = (right - left) / Math.max(12, shown.length);
    const bw = Math.min(18, Math.max(2, slot - 2));
    let g = '';
    for (const t of shown.length ? [0, max / 2, max] : [0])
      g += `<line x1="${left}" x2="${right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${GRID}" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${left - 5}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" class="tk">${t}</text>`;
    shown.forEach((e, j) => {
      const i = this.offset + j,
        cx = left + slot * (j + 0.5),
        h = base - y(e.work),
        r = Math.min(4, bw / 2, h);
      const x0 = cx - bw / 2,
        y0 = base - h;
      // a rounded data end, square at the baseline
      const d = `M${x0} ${base} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} H${x0 + bw - r} Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} V${base} Z`;
      g += `<path d="${d}" fill="${e.kind === 'rehash' ? REHASH : OP}"/>`;
      g += `<rect data-i="${i}" x="${(cx - slot / 2).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${base - top}" fill="transparent" tabindex="-1"><title>${esc(describe(e))}</title></rect>`;
    });
    if (shown.length > 1) {
      const pts = shown.map((_, j) => `${(left + slot * (j + 0.5)).toFixed(1)},${y(avg[this.offset + j]).toFixed(1)}`);
      g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    }
    if (shown.length) {
      const j = shown.length - 1,
        a = avg[this.offset + j];
      const cx = left + slot * (j + 0.5);
      g += `<circle cx="${cx.toFixed(1)}" cy="${y(a).toFixed(1)}" r="3" fill="${INK}" stroke="#F8F5EE" stroke-width="2"/>`;
      g += `<text x="${right + 6}" y="${(y(a) + 3).toFixed(1)}" class="avg">avg ${a.toFixed(1)}</text>`;
    }
    g += `<line x1="${left}" x2="${right}" y1="${base}" y2="${base}" stroke="${MUTED}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (!shown.length)
      g += `<text x="${(left + right) / 2}" y="${(top + base) / 2 + 3}" text-anchor="middle" class="empty">Run an operation to see what it costs.</text>`;
    this.svg.innerHTML = g;
    const last = all[all.length - 1];
    const peak = all.reduce<Entry | null>((p, e) => (!p || e.work > p.work ? e : p), null);
    this.svg.setAttribute(
      'aria-label',
      all.length
        ? `Work per operation for the last ${shown.length} operations. Average ${avg[avg.length - 1].toFixed(1)}; largest ${peak?.work ?? 0}.`
        : 'No operations yet.',
    );
    this.summary.textContent = all.length
      ? `${plural(all.filter(e => e.kind !== 'rehash').length, 'operation')}, average ${avg[avg.length - 1].toFixed(1)} looks each${last ? ` · last: ${describe(last)}` : ''}.`
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

/* ---------------- chips under the narration ---------------- */

/** What this operation has cost so far, as chips. */
export function costChips(step: Step | null, strategy: Strategy): string {
  if (!step) return '';
  const c = step.cost;
  const chip = (n: number, word: string, cls = '', after = '') =>
    n ? `<span class="chip${cls ? ' ' + cls : ''}">${plural(n, word)}${after}</span>` : '';
  return [
    c.hashes ? `<span class="chip cobalt">${c.hashes === 1 ? '1 hash' : `${c.hashes} hashes`}</span>` : '',
    strategy === 'chain' ? chip(c.compares, 'comparison') : chip(c.probes, 'probe'),
    chip(c.moves, 'key', 'hot', ' moved'),
  ].join('');
}

/* ---------------- inspector ---------------- */

export interface InspectorView {
  disc: string;
  title: string;
  sub: string;
  cells: [string, string][];
  note: string;
}

/** What the inspector shows for a key's disc, or null if it is gone. */
export function inspect(d: Diagram, key: string): InspectorView | null {
  const it = d.items.find(i => i.id === key);
  if (!it) return null;
  const k = it.key,
    h = hashCode(k, d.hash),
    live = d.rings.find(r => r.role === 'live');
  const m = live?.m ?? d.m,
    home = h % m;
  const p = it.place;
  const hashCell: [string, string] = ['Hash', d.hash === 'plain' ? `${h}` : `${h} (scrambled)`];
  if (p.at === 'hub' || p.hover || p.lifted || p.ring !== live?.id)
    return {
      disc: discSVG(String(k), it.tone, 56),
      title: `${k} · on the move`,
      sub: p.at === 'hub' ? 'on the hub, being hashed' : 'between buckets',
      cells: [['Key', String(k)], hashCell, ['Bucket', `${h} mod ${m} = ${home}`]],
      note: 'Pause at the end of the operation to see where it settles.',
    };
  if (d.strategy === 'chain') {
    const chain = d.items
      .filter(
        i =>
          i.place.at === 'bucket' &&
          i.place.ring === p.ring &&
          i.place.index === p.index &&
          !i.place.hover &&
          !i.place.lifted,
      )
      .sort((a, b) => (a.place.at === 'bucket' && b.place.at === 'bucket' ? a.place.level - b.place.level : 0))
      .map(i => i.key);
    const depth = chain.indexOf(k) + 1;
    return {
      disc: discSVG(String(k), it.tone, 56),
      title: `${k} · in bucket ${p.index}`,
      sub: depth === 1 ? 'first in its chain' : `${plural(depth - 1, 'key')} below it in the chain`,
      cells: [
        ['Key', String(k)],
        hashCell,
        ['Bucket', `${h} mod ${m} = ${home}`],
        ['To find it', plural(depth, 'comparison')],
      ],
      note:
        chain.length > 1
          ? `Bucket ${p.index} holds ${chain.join(', ')}: they all collided here, so a search walks the chain from the bottom.`
          : `Alone in bucket ${p.index}: one hash and one comparison find it.`,
    };
  }
  const dist = (p.index - home + m) % m;
  return {
    disc: discSVG(String(k), it.tone, 56),
    title: `${k} · in slot ${p.index}`,
    sub: dist === 0 ? 'in its own bucket' : `${plural(dist, 'slot')} past its own bucket`,
    cells: [
      ['Key', String(k)],
      hashCell,
      ['Home', `${h} mod ${m} = ${home}`],
      ['To find it', plural(dist + 1, 'probe')],
    ],
    note:
      dist === 0
        ? 'Its home bucket was free when it arrived.'
        : `Its home, bucket ${home}, was taken when it arrived, so it walked on ${plural(dist, 'slot')}. Every search for it takes the same walk.`,
  };
}

/* ---------------- legend ---------------- */

const ICON = {
  wire: `<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true"><path d="M8 22 Q24 13 9 5" fill="none" stroke="#1B1A17" stroke-width="1.8"/><path d="M13.5 3 L6 4.5 L11.5 9 Z" fill="#1B1A17"/><circle cx="8" cy="22" r="2.4" fill="#1B1A17"/></svg>`,
  tomb: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="none" stroke="#D1361E" stroke-width="1.6" stroke-dasharray="3 2.4"/>${glyphSVG('DEL', 13, 13, 5.2, '#D1361E', 16)}</svg>`,
  hand: `<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true"><circle cx="8" cy="18" r="3" fill="#1B1A17"/><path d="M8 18 L24 6" stroke="#1B1A17" stroke-width="2.2" stroke-linecap="round"/><path d="M26 4.5 L19.5 6 L23.5 10.5 Z" fill="#1B1A17"/></svg>`,
  gauge: `<svg width="18" height="26" viewBox="0 0 18 26" aria-hidden="true"><rect x="5" y="2" width="8" height="22" rx="1.5" fill="#E5DFD3"/><rect x="5" y="12" width="8" height="12" rx="1.5" fill="#2346A8"/><rect x="2" y="7" width="14" height="2" fill="#D1361E"/></svg>`,
};

function lg(icon: string, label: string, sub: string): string {
  return `<div class="lg">${icon}<div><b>${label}</b><span>${sub}</span></div></div>`;
}

export function legendHTML(strategy: Strategy, small: boolean): string {
  const disc = (t: Tone, l: string) => discSVG(l, t, small ? 22 : 28);
  const parts: string[] = [lg(ICON.hand, 'Hand', 'points at hash mod m')];
  parts.push(
    strategy === 'chain'
      ? lg(ICON.wire, 'Pointer', 'the next key in a chain')
      : lg(ICON.tomb, 'Tombstone', 'deleted, keep looking'),
  );
  parts.push(lg(ICON.gauge, 'Load', 'α = n / m, grows at ¾'));
  if (!small) {
    parts.push(lg(disc('new', '5'), 'New key', 'on its way in'));
    parts.push(lg(disc('query', '5'), 'Looked for', 'the key a search wants'));
    parts.push(lg(disc('cur', '8'), 'Compared', 'the key being checked'));
    parts.push(lg(disc('gone', '3'), 'Leaving', 'being deleted'));
  }
  return parts.join('');
}

export const STRATEGY_NAME: Readonly<Record<Strategy, string>> = {
  chain: 'Separate chaining',
  probe: 'Linear probing',
};

/** The line under the title: how full the table is. */
export function statsLine(d: Diagram): string {
  return `${plural(d.n, 'key')} · ${d.m} buckets · load ${fmtLoad(d.n, d.m)}`;
}
