// The cards beside the sculpture: the code being run with its current line lit,
// the cost table, the inspector for a clicked disc or cell, the legend, and the
// chips under the narration.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { CODE, codeTitle, type CodeKey } from './code';
import { BOX_NOTES, BOX_TABLE, SEQ_NOTES, SEQ_TABLE, isSeq, type OpKey } from './complexity';
import type { Cost, Diagram, DItem, Step, Structure, Tone } from './diagram';
import { addrText } from './memory';
import { HEX } from './palette';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A disc like the ones on the plinth, for the panels. */
export function discSVG(label: string, tone: Tone, size = 26): string {
  const r = size / 2,
    H = HEX[tone],
    gh = label.length > 1 ? size * 0.34 : size * 0.44;
  const stroke = tone === 'out' ? ` stroke="${H.rim}" stroke-width="1.6"` : '';
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

/* ---------------- cost ---------------- */

const COLS: Record<'seq' | 'box', [string, string][]> = {
  seq: [
    ['array', 'Array'],
    ['singly', 'Singly'],
    ['doubly', 'Doubly'],
  ],
  box: [
    ['stack', 'Stack'],
    ['queue', 'Queue'],
  ],
};

/** The cost of every operation on this family of structures, with the current one lit. */
export function costHTML(structure: Structure, op: OpKey | null): string {
  const seq = isSeq(structure);
  const cols = COLS[seq ? 'seq' : 'box'];
  const rows = seq ? SEQ_TABLE : BOX_TABLE;
  const notes = seq ? SEQ_NOTES : BOX_NOTES;
  const cell = (v: string) => {
    const [o, rest] = [v.replace(/[*†]$/, ''), v.match(/[*†]$/)?.[0] ?? ''];
    return `<span class="${o === 'O(1)' ? 'fast' : 'slow'}">${o.replace('O(', '<i>O</i>(').replace('(n)', '(<i>n</i>)')}</span>${rest ? `<sup>${rest}</sup>` : ''}`;
  };
  return `<table><thead><tr><th scope="col"><span class="sr">Operation</span></th>${cols
    .map(([k, name]) => `<th scope="col"${k === structure ? ' class="col"' : ''}>${name}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr${r.op === op ? ' class="on"' : ''}><th scope="row">${r.label}</th>${cols
          .map(
            ([k]) => `<td${k === structure ? ' class="col"' : ''}>${cell((r.cost as Record<string, string>)[k])}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody></table><div class="cx-notes">${notes.map(n => `<p>${n}</p>`).join('')}</div>`;
}

/* ---------------- chips under the narration ---------------- */

/** What this operation has cost so far, as chips. */
export function costChips(step: Step | null, structure: Structure, tray: string[]): string {
  if (!step) return tray.length ? trayChips(structure, tray) : '';
  if (step.code === 'bridge.search') {
    if (step.kind === 'done')
      return '<a class="chip cobalt link" href="/graphs/">Open No. 2 · Graph Net →</a><span class="chip-note">BFS and DFS on bigger nets</span>';
    return tray.length
      ? `<span class="chip-note">Visited</span>${tray.map(v => `<span class="chip">${v}</span>`).join('')}`
      : '';
  }
  const c: Cost = step.cost;
  const out: string[] = [];
  const chip = (n: number, word: string, cls = '', after = '') =>
    n ? `<span class="chip${cls ? ' ' + cls : ''}">${plural(n, word)}${after}</span>` : '';
  if (structure === 'stack' || structure === 'queue') {
    if (tray.length) return trayChips(structure, tray);
    return chip(c.writes, 'pointer write');
  }
  out.push(
    chip(c.jumps, 'jump', 'cobalt'),
    chip(c.hops, 'hop'),
    chip(c.compares, 'comparison'),
    chip(c.shifts, 'value', 'hot', ' moved'),
    chip(c.writes, structure === 'array' ? 'write' : 'pointer write', 'cobalt'),
  );
  return out.join('');
}

function trayChips(structure: Structure, tray: string[]): string {
  const rule = structure === 'stack' ? 'last in, first out' : 'first in, first out';
  return `<span class="chip-note">Out, in order</span>${tray.map(v => `<span class="chip done">${v}</span>`).join('')}<span class="chip-note">· ${rule}</span>`;
}

/* ---------------- inspector ---------------- */

export interface InspectorView {
  disc: string;
  title: string;
  sub: string;
  cells: [string, string][];
  note: string;
}

/** Follow `next` pointers from the HEAD (or TOP) flag through a diagram. */
function chainOrder(d: Diagram): string[] {
  const head = d.flags.find(f => f.id === 'HEAD' || f.id === 'TOP')?.to ?? null;
  const next = new Map(d.wires.filter(w => w.role === 'next').map(w => [w.from, w.to]));
  const out: string[] = [],
    seen = new Set<string>();
  let c = head;
  while (c != null && !seen.has(c)) {
    seen.add(c);
    out.push(c);
    c = next.get(c) ?? null;
  }
  return out;
}

/** What the inspector shows for a disc or an empty cell, or null if it is gone. */
export function inspect(d: Diagram, key: string): InspectorView | null {
  const items = new Map(d.items.map(i => [i.id, i]));
  const it = items.get(key);
  const describe = (ref: string | null) => {
    if (ref == null) return 'null';
    const t = items.get(ref);
    return t ? `${t.label}${t.addr != null ? ` @ ${addrText(t.addr)}` : ''}` : '?';
  };
  if (!it) {
    if (!key.startsWith('c:')) return null;
    const [, blockId, idx] = key.split(':'),
      b = d.blocks.find(x => x.id === blockId),
      i = Number(idx);
    if (!b) return null;
    const flags = d.flags.filter(f => f.to === key).map(f => f.label);
    return {
      disc: `<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><rect x="4" y="12" width="48" height="32" rx="6" fill="#F8F5EE" stroke="#1B1A17" stroke-width="1.4" stroke-dasharray="4 3"/></svg>`,
      title: `Cell ${i} · empty`,
      sub: flags.length
        ? `${flags.join(' and ')} ${flags.length > 1 ? 'point' : 'points'} here`
        : b.kind === 'ring'
          ? 'free for the next enqueue'
          : 'reserved, not in use',
      cells: [
        ['Index', String(i)],
        ['Address', addrText(b.base + 4 * i)],
      ],
      note:
        b.kind === 'ring'
          ? `Cell ${i} of a ring of ${b.cap}. After cell ${b.cap - 1} comes cell 0.`
          : `Cells ${b.len} to ${b.cap - 1} are room to grow without copying.`,
    };
  }
  const p = it.place;
  const fl = d.flags.filter(f => f.to === key).map(f => f.label);
  const flagNote = fl.length ? `${fl.join(', ')} ${fl.length > 1 ? 'point' : 'points'} here` : '';
  if (p.at === 'chain' || p.at === 'stack') {
    const next = d.wires.find(w => w.from === key && w.role === 'next');
    const prev = d.wires.find(w => w.from === key && w.role === 'prev');
    const order = chainOrder(d),
      i = order.indexOf(key);
    const stack = p.at === 'stack';
    const cells: [string, string][] = [
      ['Value', it.label],
      ['Address', it.addr != null ? addrText(it.addr) : '—'],
      [stack ? 'Next (below)' : 'Next', describe(next?.to ?? null)],
    ];
    if (prev) cells.push(['Prev', describe(prev.to)]);
    const where =
      i < 0
        ? 'not reachable from ' + (stack ? 'TOP' : 'HEAD')
        : stack
          ? i === 0
            ? 'the top'
            : `${plural(i, 'node')} below the top`
          : `index ${i}, ${plural(i, 'hop')} from HEAD`;
    return {
      disc: discSVG(it.label, it.tone, 56),
      title: `${it.label} · ${stack ? 'stack node' : 'list node'}`,
      sub: [where, flagNote].filter(Boolean).join(' · '),
      cells,
      note:
        i < 0
          ? 'Nothing that the program can reach points at this node.'
          : `A node is a value plus ${prev ? 'two pointers' : 'one pointer'}: ${prev ? 'next and prev are' : 'next is'} just ${prev ? 'addresses' : 'an address'} of other nodes, or null.`,
    };
  }
  if (p.at === 'cell') {
    const b = d.blocks.find(x => x.id === p.block);
    const addr = b ? b.base + 4 * p.index : 0;
    const ring = b?.kind === 'ring';
    return {
      disc: discSVG(it.label, it.tone, 56),
      title: `${it.label} · ${ring ? 'in the ring' : 'array value'}`,
      sub: [`cell ${p.index}`, flagNote].filter(Boolean).join(' · '),
      cells: [
        ['Value', it.label],
        ['Index', String(p.index)],
        ['Address', addrText(addr)],
        ['Pointers', 'none'],
      ],
      note: ring
        ? 'A ring buffer is a plain array; FRONT and BACK are indexes into it, and they wrap round with % cap.'
        : `No pointers: the address is ${b ? addrText(b.base) : 'base'} + 4 × ${p.index}, because the cells sit side by side.`,
    };
  }
  return {
    disc: discSVG(it.label, it.tone, 56),
    title: `${it.label} · taken out`,
    sub: `no. ${p.index + 1} out`,
    cells: [
      ['Value', it.label],
      ['Out', `no. ${p.index + 1}`],
    ],
    note:
      d.tray === 'VISITED' ? 'The order the search visited its knots.' : 'The tray keeps the order values came out in.',
  };
}

/* ---------------- legend ---------------- */

const ICON = {
  wire: `<svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true"><path d="M4 16 Q17 -2 28 14" fill="none" stroke="#1B1A17" stroke-width="1.8"/><path d="M24.5 9.5 L30 16.5 L22 15 Z" fill="#1B1A17"/><circle cx="4" cy="16" r="2.4" fill="#1B1A17"/></svg>`,
  prev: `<svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true"><path d="M30 6 Q17 24 6 8" fill="none" stroke="#6F6960" stroke-width="1.8"/><path d="M9.5 12.5 L4 5.5 L12 7 Z" fill="#6F6960"/><circle cx="30" cy="6" r="2.4" fill="#1B1A17"/></svg>`,
  nul: `<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><path d="M4 6 H13 V12" fill="none" stroke="#1B1A17" stroke-width="1.8"/><path d="M7 13 H19 M9.5 16.5 H16.5 M11.5 20 H14.5" stroke="#1B1A17" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  flag: `<svg width="40" height="22" viewBox="0 0 40 22" aria-hidden="true"><rect x="1" y="4" width="38" height="14" rx="7" fill="#F8F5EE" stroke="#1B1A17" stroke-width="1.2"/>${glyphSVG('HEAD', 20, 11, 7, '#1B1A17', 16)}</svg>`,
  hand: `<svg width="36" height="22" viewBox="0 0 36 22" aria-hidden="true"><rect x="1" y="4" width="34" height="14" rx="7" fill="#2346A8"/>${glyphSVG('CUR', 18, 11, 7, '#FFFFFF', 16)}</svg>`,
};

function lg(icon: string, label: string, sub: string): string {
  return `<div class="lg">${icon}<div><b>${label}</b><span>${sub}</span></div></div>`;
}

export function legendHTML(structure: Structure, small: boolean): string {
  const disc = (t: Tone, l: string) => discSVG(l, t, small ? 22 : 28);
  const parts: string[] = [];
  if (structure === 'array' || structure === 'queue') {
    parts.push(lg(disc('rest', '7'), 'Value', 'in its cell'));
  } else {
    parts.push(lg(ICON.wire, 'Pointer', structure === 'stack' ? 'next, pointing down' : 'next'));
    if (structure === 'doubly') parts.push(lg(ICON.prev, 'Prev', 'the way back'));
    parts.push(lg(ICON.nul, 'Null', 'points at nothing'));
  }
  parts.push(lg(ICON.flag, 'Field', 'a pointer the structure keeps'));
  parts.push(lg(ICON.hand, 'Variable', 'a pointer the code holds'));
  if (!small) {
    parts.push(lg(disc('cur', '8'), 'In hand', 'the node being looked at'));
    parts.push(lg(disc('new', '5'), 'New', 'allocated, not linked yet'));
    parts.push(lg(disc('gone', '3'), 'Leaving', 'about to be unlinked'));
  }
  return parts.join('');
}

export const STRUCTURE_NAME: Readonly<Record<Structure, string>> = {
  array: 'Array',
  singly: 'Singly linked list',
  doubly: 'Doubly linked list',
  stack: 'Stack',
  queue: 'Queue',
};

/** The line under the title: how big the structure is. */
export function statsLine(d: Diagram): string {
  const inPlace = (at: DItem['place']['at']) => d.items.filter(i => i.place.at === at).length;
  switch (d.structure) {
    case 'array': {
      const b = d.blocks[0];
      return b ? `${b.len} of ${plural(b.cap, 'cell')}` : 'empty';
    }
    case 'queue': {
      const b = d.blocks[0];
      return b ? `${b.len} waiting · ring of ${b.cap}` : 'empty';
    }
    case 'stack':
      return `${plural(inPlace('stack'), 'node')} on the stack`;
    default:
      return `${plural(chainOrder(d).length, 'node')} · ${d.structure === 'singly' ? 'singly' : 'doubly'} linked`;
  }
}
