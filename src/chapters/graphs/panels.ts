// The panels beside the net: the live queue, stack or priority queue (whose items
// fly in from their knots and back out to them), the race scoreboard, the About
// card and the legend.

import { glyphSVG } from '../../core/glyphs';
import { plural } from '../../core/math';
import { ALGOS, type AlgoKey, type DsKind, type NodeId, type Step, type VisitState } from './algorithms';
import { HEX_FILL, HEX_GLYPH } from './palette';
import { FOCUS_EDGE, type NetCtx } from './poses';
import type { GraphProgram, Mode, RaceStep } from './program';

export interface ScreenPoint {
  x: number;
  y: number;
}
/** Where a panel item's knot is on screen (key 'n<id>'), if anywhere. */
type PointFor = (key: string) => ScreenPoint | null;

interface FlipItem {
  key: string;
  /** Trusted HTML built from labels and numbers. */
  html: string;
  cls: string;
}
interface FlipEntry {
  el: HTMLDivElement;
  html: string;
  fresh: boolean;
}

/** A disc like the ones on the plinth, for the panels. */
export function discSVG(label: string, st: VisitState, size = 26): string {
  const r = size / 2,
    gh = label.length > 1 ? size * 0.32 : size * 0.42;
  const stroke = st === 'unseen' ? ' stroke="#1B1A17" stroke-width="1.6"' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 1.2}" fill="${HEX_FILL[st]}"${stroke}/>${glyphSVG(label, r, r, gh, HEX_GLYPH[st], 15)}</svg>`;
}

/** A list whose items slide to their new places, fly in from their knot, and fly back out to it. */
class FlipList {
  private readonly entries = new Map<string, FlipEntry>();
  private readonly el: HTMLElement;
  private readonly flyLayer: HTMLElement;

  constructor(el: HTMLElement, flyLayer: HTMLElement) {
    this.el = el;
    this.flyLayer = flyLayer;
  }

  update(items: FlipItem[], { from, to, dur }: { from?: PointFor; to?: PointFor; dur: number }): void {
    const first = new Map<string, DOMRect>();
    if (dur) for (const [k, e] of this.entries) first.set(k, e.el.getBoundingClientRect());
    const want = new Set(items.map(it => it.key));
    for (const [k, e] of [...this.entries])
      if (!want.has(k)) {
        this.entries.delete(k);
        if (dur) this.flyOut(e.el, first.get(k), to?.(k) ?? null, dur);
        e.el.remove();
      }
    let prev: HTMLDivElement | null = null;
    for (const it of items) {
      let e = this.entries.get(it.key);
      if (!e) {
        e = { el: document.createElement('div'), html: '', fresh: true };
        this.entries.set(it.key, e);
      }
      if (e.html !== it.html) {
        e.el.innerHTML = it.html;
        e.html = it.html;
      }
      if (e.el.className !== it.cls) e.el.className = it.cls;
      const next: ChildNode | null = prev ? prev.nextSibling : this.el.firstChild;
      if (next !== e.el) this.el.insertBefore(e.el, next);
      prev = e.el;
    }
    for (const [k, e] of this.entries) {
      if (!dur) {
        e.fresh = false;
        continue;
      }
      const last = e.el.getBoundingClientRect();
      if (!last.width) {
        e.fresh = false;
        continue;
      }
      if (e.fresh) {
        e.fresh = false;
        const p = from?.(k);
        const kf = p
          ? [
              {
                transform: `translate(${p.x - last.left - last.width / 2}px,${p.y - last.top - last.height / 2}px) scale(.35)`,
                opacity: 0,
              },
              { transform: 'none', opacity: 1 },
            ]
          : [
              { transform: 'scale(.7)', opacity: 0 },
              { transform: 'none', opacity: 1 },
            ];
        e.el.animate(kf, { duration: dur, easing: 'cubic-bezier(.2,.75,.25,1)' });
        continue;
      }
      const f = first.get(k);
      if (!f) continue;
      const dx = f.left - last.left,
        dy = f.top - last.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
        e.el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], {
          duration: dur,
          easing: 'cubic-bezier(.3,.7,.25,1)',
        });
    }
  }

  /** A removed item flies back to its knot (or just fades) from where it was. */
  private flyOut(node: HTMLElement, rect: DOMRect | undefined, p: ScreenPoint | null, dur: number): void {
    if (!rect || !rect.width) return;
    const wrap = document.createElement('div');
    wrap.className = `${this.el.parentElement?.className ?? ''} flying`;
    Object.assign(wrap.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      display: 'block',
    });
    const inner = document.createElement('div');
    inner.className = this.el.className;
    Object.assign(inner.style, { display: 'block', width: '100%', height: '100%' });
    const ghost = node.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, { width: '100%', height: '100%', boxSizing: 'border-box', margin: '0' });
    inner.appendChild(ghost);
    wrap.appendChild(inner);
    this.flyLayer.appendChild(wrap);
    const kf = p
      ? [
          { transform: 'none', opacity: 1 },
          {
            transform: `translate(${p.x - rect.left - rect.width / 2}px,${p.y - rect.top - rect.height / 2}px) scale(.3)`,
            opacity: 0,
          },
        ]
      : [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }];
    wrap.animate(kf, { duration: dur, easing: 'cubic-bezier(.5,0,.5,1)' }).onfinish = () => wrap.remove();
  }
}

const DS_META: Readonly<Record<DsKind, [title: string, sub: string]>> = {
  queue: ['Queue', 'first in, first out'],
  stack: ['Stack', 'last in, first out'],
  pq: ['Priority queue', 'cheapest first'],
};
const DONE_NOTE: Readonly<Record<AlgoKey, string>> = {
  dijkstra: 'Distances only ever rise in this list. That is the whole proof.',
  bfs: 'Layers only ever rise in this list: BFS finishes one before starting the next.',
  dfs: 'The order the thread first reached each knot.',
};

/** One algorithm's live data structure, and what it has processed so far. */
export class DSView {
  readonly root: HTMLElement;
  private readonly list: FlipList;
  private readonly done: FlipList;

  constructor(root: HTMLElement, flyLayer: HTMLElement) {
    this.root = root;
    root.innerHTML = `<div class="ds-head"><span class="eyebrow ds-title"></span><span class="ds-sub"></span></div>
      <div class="ds-wrap"><span class="qend">out</span><div class="dsl"></div><span class="qend">in</span></div>
      <div class="ds-empty"></div><div class="ds-more"></div>
      <div class="ds-done"><div class="ds-rule"></div><div class="eyebrow ds-dtitle"></div><div class="donel"></div><div class="ds-note"></div></div>`;
    this.list = new FlipList(this.q('.dsl'), flyLayer);
    this.done = new FlipList(this.q('.donel'), flyLayer);
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`DSView is missing ${sel}`);
    return el;
  }

  /** Show the structure after fine step i of this plinth; items animate over dur ms. */
  render(ctx: NetCtx, i: number, dur: number, race: boolean, screenOf: (id: NodeId) => ScreenPoint | null): void {
    const step: Step | null = i >= 0 ? ctx.steps[i] : null,
      prev = i > 0 ? ctx.steps[i - 1] : null;
    const L = (id: NodeId) => ctx.g.label(id),
      kind = ALGOS[ctx.algo].ds;
    const [title, sub] = DS_META[kind];
    this.root.className = 'dsv' + (race ? ' race' : '');
    this.q('.ds-title').textContent = race ? `${ALGOS[ctx.algo].name} · ${title.toLowerCase()}` : title;
    this.q('.ds-sub').textContent = sub;
    this.q('.ds-wrap').className = 'ds-wrap ' + kind;
    const ds = step ? step.ds : [],
      items: FlipItem[] = [];
    let more = '';
    if (kind === 'queue') {
      const MAX = race ? 10 : 14;
      let lastLayer: number | undefined;
      for (const d of ds.slice(0, MAX)) {
        if (lastLayer != null && d.key !== lastLayer) items.push({ key: 'L' + d.key, html: '', cls: 'qdiv' });
        lastLayer = d.key;
        items.push({ key: 'n' + d.id, html: discSVG(L(d.id), 'wait', 24) + `<b>${d.key}</b>`, cls: 'dsi' });
      }
      if (ds.length > MAX) more = `+${ds.length - MAX} more at the back`;
    } else if (kind === 'stack') {
      const MAX = race ? 5 : 9,
        rev = ds.slice().reverse();
      rev.slice(0, MAX).forEach((d, k) =>
        items.push({
          key: 'n' + d.id,
          cls: 'dsi' + (k === 0 ? ' first' : ''),
          html:
            discSVG(L(d.id), k === 0 ? 'active' : 'wait', 26) +
            `<div class="k"><b>${L(d.id)}</b><span>${k === 0 ? 'exploring from here' : `visit no. ${step?.tag[d.id]}`}</span></div>${k === 0 ? '<em>top</em>' : ''}`,
        }),
      );
      if (rev.length > MAX) more = `+${rev.length - MAX} more below`;
    } else {
      const MAX = race ? 5 : 8;
      const was = step && step.kind === 'improve' && prev ? prev.ds.findIndex(d => d.id === step.to) : -1;
      ds.slice(0, MAX).forEach((d, k) => {
        let note = '';
        if (step && step.kind === 'improve' && d.id === step.to)
          note =
            step.old === Infinity ? 'first ticket' : `was <s>${step.old}</s>${was < 0 || was > k ? ' · moved up' : ''}`;
        items.push({
          key: 'n' + d.id,
          cls: 'dsi' + (k === 0 ? ' first' : ''),
          html:
            discSVG(L(d.id), 'wait', 26) +
            `<div class="k"><b>${d.key}</b>${note ? `<span>${note}</span>` : `<span>${L(d.id)}’s ticket</span>`}</div>${k === 0 ? '<em>next</em>' : ''}`,
        });
      });
      if (ds.length > MAX) more = `+${ds.length - MAX} more tickets`;
    }
    this.q('.ds-empty').textContent = !step
      ? ctx.steps.length
        ? 'Empty until you press play.'
        : 'Nothing to run.'
      : ds.length
        ? ''
        : 'Empty.';
    this.q('.ds-more').textContent = more;
    const pos: PointFor = k => (k[0] === 'n' ? screenOf(Number(k.slice(1))) : null);
    this.list.update(items, { from: pos, to: pos, dur });
    // what has been processed, in order
    this.q('.ds-dtitle').textContent = ctx.algo === 'dijkstra' ? 'Lifted, in order' : 'Visited, in order';
    const order = step ? step.order : [],
      chips: FlipItem[] = [],
      CAP = 12;
    if (order.length > CAP) chips.push({ key: 'more', html: `+${order.length - CAP} earlier`, cls: 'dchip more' });
    for (const id of order.slice(-CAP)) {
      const v = ctx.algo === 'dijkstra' ? step?.lifted[id] : ctx.algo === 'bfs' ? step?.tag[id] : undefined;
      chips.push({
        key: 'n' + id,
        html: `${L(id)}${v != null ? ` <span>${v}</span>` : ''}`,
        cls: 'dchip' + (step?.st[id] === 'active' ? ' now' : ''),
      });
    }
    this.q('.ds-done').hidden = !order.length;
    this.q('.ds-note').textContent = DONE_NOTE[ctx.algo];
    this.done.update(chips, { from: pos, dur });
  }
}

/* ---------------- About, race score, legend ---------------- */

const ABOUT: Readonly<Record<AlgoKey, { use: string; cost: string; note: string; world: string }>> = {
  bfs: {
    use: 'for the fewest-strings route when every string counts the same, and to explore a graph layer by layer.',
    cost: 'O(V + E)',
    note: 'time; the queue can hold a whole layer at once.',
    world: 'friend-of-a-friend suggestions, web crawlers, and the fewest moves in a puzzle.',
  },
  dfs: {
    use: 'to explore everything reachable, find cycles, put tasks in dependency order, or walk a maze.',
    cost: 'O(V + E)',
    note: 'time; memory grows with the depth of the thread.',
    world: 'maze solvers, the mark phase of garbage collectors, and build tools resolving dependencies.',
  },
  dijkstra: {
    use: 'for the cheapest route when no string costs less than zero.',
    cost: 'O((V + E) log V)',
    note: 'with a binary heap as the priority queue.',
    world: 'turn-by-turn directions, and OSPF routing inside networks.',
  },
};

export function renderAbout(el: HTMLElement, algo: AlgoKey): void {
  const a = ABOUT[algo];
  el.innerHTML = `<div class="eyebrow">About ${ALGOS[algo].name}</div>
    <p><b>Use it</b> ${a.use}</p><p><b>Cost</b> <i>${a.cost}</i> ${a.note}</p><p><b>In the world</b> ${a.world}</p><p id="aboutRun"></p>`;
}

/** How many strings the algorithm has looked at up to step i. */
export function examinedUpTo(steps: readonly Step[], i: number): number {
  let n = 0;
  for (let k = 0; k <= i; k++) if (FOCUS_EDGE.has(steps[k].kind) && steps[k].kind !== 'back') n++;
  return n;
}

const reached = (s: RaceStep['status'][number]) => !!s && (s.kind === 'found' || s.kind === 'path');

export function renderScore(el: HTMLElement, prog: GraphProgram, i: number): void {
  const st = i >= 0 ? (prog.steps[i] as RaceStep) : null;
  el.innerHTML =
    '<div class="eyebrow">Race · one tick per knot</div>' +
    prog.nets
      .map((c, j) => {
        const s = st ? st.status[j] : null;
        const T = c.target != null ? c.g.label(c.target) : '';
        const txt = !st
          ? 'waiting for the start'
          : s
            ? reached(s)
              ? `<span class="won">reached ${T} in ${plural(s.tick, 'tick')}</span> · ${plural(s.strings, 'string')}`
              : c.target != null
                ? `cannot reach ${T}`
                : `done in ${plural(s.tick, 'tick')}`
            : `${plural(st.visited[j], 'knot')} visited`;
        return `<div class="srow"><b>${ALGOS[c.algo].name}</b><span>${txt}</span></div>`;
      })
      .join('');
}

/** The status chips under the race narration. */
export function raceChips(prog: GraphProgram, i: number): string {
  const st = i >= 0 ? (prog.steps[i] as RaceStep) : null;
  return prog.nets
    .map((c, j) => {
      const s = st ? st.status[j] : null,
        name = ALGOS[c.algo].name;
      const txt = !st
        ? 'ready'
        : s
          ? reached(s)
            ? `reached ${c.target != null ? c.g.label(c.target) : ''}`
            : c.target != null
              ? 'no route'
              : 'done'
          : `${st.visited[j]} visited`;
      return `<span class="chip${reached(s) ? ' cobalt' : ''}">${name} · ${txt}</span>`;
    })
    .join('');
}

function legendDisc(st: VisitState | 'target', label: string, sub: string, small: boolean): string {
  const s = small ? 22 : 30,
    r = s / 2;
  const ring =
    st === 'target'
      ? `<circle cx="${r}" cy="${r}" r="${r - 1.6}" fill="none" stroke="#D1361E" stroke-width="2.2" stroke-dasharray="3.4 2.6"/>`
      : `${st === 'active' ? `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(35,70,168,.2)"/>` : ''}<circle cx="${r}" cy="${r}" r="${st === 'active' ? r - 4 : r - 1.6}" fill="${HEX_FILL[st]}"${st === 'unseen' ? ' stroke="#1B1A17" stroke-width="1.6"' : ''}/>`;
  return `<div class="lg"><svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${ring}</svg><div><b>${label}</b><span>${sub}</span></div></div>`;
}

/** The five knot states, worded for the algorithm on show. */
export function legendHTML(mode: Mode, algo: AlgoKey, small: boolean): string {
  const race = mode === 'race';
  const wait = race
    ? 'queued or stacked'
    : { bfs: 'in the queue', dfs: 'on the stack', dijkstra: 'has a ticket' }[algo];
  return (
    legendDisc('unseen', 'Unvisited', 'not reached yet', small) +
    legendDisc('wait', 'Waiting', wait, small) +
    legendDisc('active', 'Processing', 'being expanded now', small) +
    legendDisc('done', algo === 'dijkstra' && !race ? 'Settled' : 'Done', 'visited, or settled', small) +
    legendDisc('target', 'Target', 'where the route ends', small)
  );
}
