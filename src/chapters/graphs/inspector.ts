// The card that opens when a knot is clicked: its state, distance or layer,
// parent, neighbors, and buttons to make it the start or the target.

import { byId } from '../../core/dom';
import { plural } from '../../core/math';
import type { Graph, NodeId, Step } from './algorithms';
import { discSVG } from './panels';
import type { NetCtx } from './poses';
import type { UiState } from './state';

export interface InspectorDeps {
  ui: UiState;
  graph(): Graph;
  /** The plinth's context and the algorithm step it currently shows. */
  current(j: number): { ctx: NetCtx | null; step: Step | null };
  /** The free screen area changed. */
  onLayout(): void;
  onStartHere(id: NodeId): void;
  onToggleTarget(id: NodeId): void;
  onDelete(id: NodeId): void;
}

export interface Inspector {
  select(id: NodeId, j?: number): void;
  close(quiet?: boolean): void;
  update(): void;
}

export function createInspector(deps: InspectorDeps): Inspector {
  const { ui } = deps;
  const card = byId('inspector');
  const els = {
    disc: byId('insDisc'),
    state: byId('insState'),
    k1: byId('insK1'),
    v1: byId('insV1'),
    v2: byId('insV2'),
    nb: byId('insNb'),
    start: byId<HTMLButtonElement>('insStart'),
    target: byId<HTMLButtonElement>('insTarget'),
    del: byId<HTMLButtonElement>('insDel'),
  };

  function update(): void {
    const id = ui.selected;
    if (id == null) return;
    const graph = deps.graph();
    if (!graph.nodes.has(id)) {
      close();
      return;
    }
    const { ctx, step } = deps.current(ui.selectedNet);
    const L = (x: NodeId | null) => (x == null ? '' : graph.label(x));
    const st = step ? (step.st[id] ?? 'unseen') : 'unseen';
    const algo = ctx ? ctx.algo : ui.algo;
    els.disc.innerHTML = discSVG(L(id), st, 56);
    const stName = {
      unseen: 'Unvisited',
      wait: algo === 'bfs' ? 'In the queue' : algo === 'dfs' ? 'On the stack' : 'Has a ticket',
      active: 'Processing',
      done: algo === 'dijkstra' ? 'Settled' : 'Visited',
    }[st];
    const tag = step ? step.tag[id] : undefined;
    const from = L(ctx?.start ?? null);
    const sub =
      algo === 'dijkstra'
        ? tag == null || tag === '∞'
          ? 'no route found yet'
          : st === 'done' || st === 'active'
            ? `${tag} from ${from}, final`
            : `${tag} so far, may still drop`
        : algo === 'bfs'
          ? tag == null
            ? 'not reached yet'
            : `${plural(Number(tag), 'string')} from ${from}`
          : tag == null
            ? 'not reached yet'
            : `visit no. ${tag}`;
    const roles = [id === ui.start ? 'start' : '', id === ui.target ? 'target' : ''].filter(Boolean).join(' · ');
    const parent = step ? step.parent[id] : undefined;
    const via = parent != null ? ` · via ${L(parent)}` : '';
    els.state.innerHTML = `<b>${L(id)} · ${stName}</b><span>${roles ? roles + ' · ' : ''}${sub}${via}</span>`;
    els.k1.textContent = algo === 'dijkstra' ? 'Distance' : algo === 'bfs' ? 'Layer' : 'Visit no.';
    els.v1.textContent = tag == null ? '—' : String(tag);
    els.v2.textContent = parent != null ? L(parent) : '—';
    const out = graph.neighbors(id),
      inc = graph.incoming(id);
    const chip = (x: NodeId, w: number) => `<span class="nb">${L(x)} <i>${w}</i></span>`;
    const none = '<span class="lab">none</span>';
    els.nb.innerHTML =
      `<div class="lab">${graph.directed ? `Strings out · ${out.length}` : `Neighbors · ${out.length}`}</div><div class="nbl">${out.map(n => chip(n.to, n.w)).join('') || none}</div>` +
      (graph.directed
        ? `<div class="lab">Strings in · ${inc.length}</div><div class="nbl">${inc.map(n => chip(n.from, n.w)).join('') || none}</div>`
        : '');
    els.start.disabled = id === ui.start;
    els.target.textContent = id === ui.target ? 'Clear target' : 'Make target';
    els.target.disabled = id === ui.start;
  }

  function select(id: NodeId, j = 0): void {
    ui.selected = id;
    ui.selectedNet = j;
    card.hidden = false;
    document.body.classList.add('inspecting');
    update();
    deps.onLayout();
  }

  function close(quiet = false): void {
    ui.selected = null;
    card.hidden = true;
    document.body.classList.remove('inspecting');
    if (!quiet) deps.onLayout();
  }

  byId('insClose').addEventListener('click', () => close());
  els.start.addEventListener('click', () => ui.selected != null && deps.onStartHere(ui.selected));
  els.target.addEventListener('click', () => ui.selected != null && deps.onToggleTarget(ui.selected));
  els.del.addEventListener('click', () => {
    const id = ui.selected;
    close();
    if (id != null) deps.onDelete(id);
  });

  return { select, close, update };
}
