// Pointer Chain, No. 3: arrays, linked lists, stacks and queues with every pointer
// a wire. This file wires the pieces together: the structures, the player, the
// scene, the panels and the controls.

import { bindHelp, bindKeys, calloutPlacer, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { lerp } from '../../core/math';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import * as arr from './array';
import { bridgeSearch } from './bridge';
import type { Diagram, Recording, Step, StepKind, Structure } from './diagram';
import { PHI_LINE, PHI_MEM, PHI_NET, PHI_RING, PHI_STACK } from './layout';
import * as list from './listops';
import { HOLD, RATE, assemble, buildTransition, morph } from './motion';
import { CodeCard, STRUCTURE_NAME, costChips, costHTML, inspect, legendHTML, statsLine } from './panels';
import { makeProgram, restAt, type ListProgram, type Pose } from './poses';
import * as ring from './queue';
import { ListScene } from './scene';
import { playStepSound } from './sound';
import * as stack from './stack';
import { createUiState, createWorld, diagramOf, fresh, type World } from './state';

const ui = createUiState();
const world: World = createWorld();
const canvas = byId<HTMLCanvasElement>('stage');
const scene = new ListScene(canvas);
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
let clock = 0;

const INTRO: Readonly<Record<Structure, { head: string; body: string }>> = {
  array: {
    head: 'An array: six values side by side in one block.',
    body: 'Every cell is 4 bytes, so cell i sits at the start address plus 4 × i: one sum reaches any index. The price is paid when a gap opens or closes. Try Get index, then Insert at index 1.',
  },
  singly: {
    head: 'A singly linked list: six nodes, six pointers.',
    body: 'Each node holds a value and the address of the next node, drawn as a wire. The order lives in the wires, not in memory. Press Reverse to watch every wire turn round, or insert a value of your own.',
  },
  doubly: {
    head: 'A doubly linked list: two pointers in every node.',
    body: 'Next wires run over the top, prev wires underneath. The extra pointer costs memory, but it walks backwards and deletes the tail without a walk. Try Delete at index 5.',
  },
  stack: {
    head: 'A stack: a linked list you only touch at the top.',
    body: 'Push puts a node on top; pop takes the top one off, so the last value in is the first out. Press Push 1–5, pop all and listen: the tune comes back backwards.',
  },
  queue: {
    head: 'A queue, kept in a ring of eight cells.',
    body: 'Values join at BACK and leave from FRONT, so the first in is the first out, and nothing ever shifts. When BACK passes cell 7 it wraps round to 0. Memory view unbends the ring into the plain array it is.',
  },
};

/* ---------------- the player ---------------- */

const WRITE_KINDS: ReadonlySet<StepKind> = new Set<StepKind>(['link', 'swing', 'swap', 'move', 'write']);
const BAD_KINDS: ReadonlySet<StepKind> = new Set<StepKind>([
  'free',
  'empty',
  'overflow',
  'underflow',
  'missing',
  'skip',
]);

const emptyRecording = (s: Structure): Recording => ({
  title: STRUCTURE_NAME[s],
  steps: [],
  start: diagramOf(world, s),
  intro: INTRO[s],
});

const player: Player<Step, Pose, ListProgram> = new Player<Step, Pose, ListProgram>(
  {
    build: buildTransition,
    morph,
    holdFor: st => readingHold(st, HOLD, RATE, REDUCED),
    onShow: i => showStep(i),
    onStep: (st, _i, tr) => playStepSound(st, tr.dur, player.speed),
    onBack: () => {
      if (sound.ready()) sound.tink(660, 0.06, 0, 0.2);
    },
    onRefresh: () => refreshAfterStep(),
    onUI: () => transport.updatePlayUI(),
    onLoad: () => transport.build(),
    onGesture: () => sound.ensure(),
  },
  makeProgram(emptyRecording(ui.structure)),
);
const transport = mountTransport(byId('transport'), player, {
  onGesture: () => sound.ensure(),
  tickClass: (s, k, steps) =>
    (WRITE_KINDS.has(s.kind) ? 'key' : BAD_KINDS.has(s.kind) ? 'rot' : '') +
    (k > 0 && steps[k - 1].op !== s.op ? ' gap' : ''),
});
const bar = document.querySelector<HTMLElement>('#transport .bar');

/** Play a recording, always easing from whatever is on screen to its start. */
function load(
  rec: Recording,
  { autoplay = true, catchDur = 0.6 }: { autoplay?: boolean; catchDur?: number } = {},
): void {
  const P0 = player.pose();
  const prog = makeProgram(rec);
  player.load(prog, { autoplay, catchDur });
  player.tr =
    catchDur > 0
      ? { tr: morph(P0, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => (player.hold = 0.15) }
      : null;
  sound.ensure();
  showStep(-1);
  refreshAfterStep();
}

function setStructure(s: Structure): void {
  if (s === ui.structure && player.prog.steps.length === 0) return;
  ui.structure = s;
  closeInspector(true);
  showErr('');
  load(emptyRecording(s), { autoplay: false, catchDur: 0.75 });
  syncControls();
}

/* ---------------- narration and panels ---------------- */

const plac = placard();
const placeCallout = calloutPlacer(camera);
const codeCard = new CodeCard(byId('codeTitle'), byId<HTMLOListElement>('codeLines'));

const currentDiagram = (): Diagram => (player.idx >= 0 ? player.prog.steps[player.idx].diag : player.prog.start);
const trayOf = (d: Diagram): string[] =>
  d.items
    .filter(i => i.place.at === 'out')
    .sort((a, b) => (a.place.at === 'out' && b.place.at === 'out' ? a.place.index - b.place.index : 0))
    .map(i => i.label);

function showStep(i: number): void {
  const prog = player.prog,
    st = i >= 0 ? prog.steps[i] : null;
  const d = st ? st.diag : prog.start;
  plac.set({
    op: st ? st.op : prog.title,
    stepno: prog.steps.length ? `Step ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : (prog.intro?.head ?? `${prog.title}.`),
    body: st ? st.body : (prog.intro?.body ?? 'Press play.'),
    chips: costChips(st, d.structure, trayOf(d)),
  });
  transport.mark(i);
  const first = prog.steps[0];
  codeCard.show(st ? st.code : (first?.code ?? null), st ? st.line : -1);
  byId('costTable').innerHTML = costHTML(prog.start.structure, st ? st.cx : (first?.cx ?? null));
}

function refreshAfterStep(): void {
  transport.updatePlayUI();
  byId('mstats').textContent = statsLine(currentDiagram());
  updateInspector();
}

/* ---------------- inspector ---------------- */

function updateInspector(): void {
  if (ui.selected == null) return;
  const v = inspect(currentDiagram(), ui.selected);
  if (!v) return closeInspector();
  byId('insDisc').innerHTML = v.disc;
  byId('insState').innerHTML = `<b>${v.title}</b><span>${v.sub}</span>`;
  byId('insGrid').innerHTML = v.cells.map(([k, val]) => `<div><div>${k}</div><div>${val}</div></div>`).join('');
  byId('insNote').textContent = v.note;
}
function select(key: string): void {
  ui.selected = key;
  byId('inspector').hidden = false;
  document.body.classList.add('inspecting');
  updateInspector();
  measureFree();
}
function closeInspector(quiet = false): void {
  ui.selected = null;
  byId('inspector').hidden = true;
  document.body.classList.remove('inspecting');
  if (!quiet) measureFree();
}
byId('insClose').addEventListener('click', () => closeInspector());

/* ---------------- operations ---------------- */

const els = {
  val: byId<HTMLInputElement>('val'),
  idx: byId<HTMLInputElement>('idx'),
  err: byId('err'),
  main: byId<HTMLButtonElement>('bMain'),
  ops: byId('opbtns'),
};

function showErr(msg: string, field: HTMLInputElement | null = null): void {
  els.err.textContent = msg;
  els.val.setAttribute('aria-invalid', String(!!msg && field === els.val));
  els.idx.setAttribute('aria-invalid', String(!!msg && field === els.idx));
}

const isSeq = (s: Structure) => s === 'array' || s === 'singly' || s === 'doubly';
const sizeOf = (s: Structure): number =>
  s === 'array' ? world.array.len : s === 'queue' ? world.queue.size : world[s].size;
const valuesOf = (s: Structure): number[] =>
  s === 'array' ? world.array.values() : s === 'queue' ? world.queue.values() : world[s].values();
const maxOf = (s: Structure) => (s === 'array' ? arr.MAX_ARRAY : s === 'stack' ? stack.MAX_STACK : list.MAX_NODES);

/** The typed value, or one picked for a blank box; null (with a message) if it is not usable. */
function readValue(): number | null {
  const raw = els.val.value.trim();
  const s = ui.structure;
  if (!raw) {
    if (s === 'stack' || s === 'queue') return ui.next[s];
    const used = new Set(valuesOf(s));
    const free: number[] = [];
    for (let v = 1; v <= 99; v++) if (!used.has(v)) free.push(v);
    return free[Math.floor(Math.random() * free.length)] ?? 1;
  }
  if (!/^[+-]?\d+$/.test(raw)) {
    showErr(`“${raw.slice(0, 8)}” is not a whole number. Try something like 7.`, els.val);
    return null;
  }
  const v = parseInt(raw, 10);
  if (v < 0 || v > 99) {
    showErr('Use a value from 0 to 99, so it fits on a disc.', els.val);
    return null;
  }
  return v;
}

/** The typed index, checked against what this operation allows. */
function readIndex(forInsert: boolean): number | null {
  const s = ui.structure,
    n = sizeOf(s),
    raw = els.idx.value.trim();
  if (!forInsert && n === 0) return 0; // let the structure explain that it is empty
  const top = forInsert ? n : n - 1;
  if (!raw) {
    showErr(`Type an index from 0 to ${top}.`, els.idx);
    return null;
  }
  if (!/^[+-]?\d+$/.test(raw)) {
    showErr(`“${raw.slice(0, 8)}” is not an index. Indexes are whole numbers from 0 to ${top}.`, els.idx);
    return null;
  }
  const i = parseInt(raw, 10);
  if (i < 0 || i > top) {
    showErr(
      forInsert
        ? `There is no index ${i} to insert at: with ${n} values, use 0 to ${n}.`
        : `There is no index ${i}: the values are at 0 to ${top}.`,
      els.idx,
    );
    return null;
  }
  return i;
}

function full(): boolean {
  const s = ui.structure;
  if (s === 'queue' || sizeOf(s) < maxOf(s)) return false;
  showErr(`The plinth holds ${maxOf(s)}. Delete something first.`);
  return true;
}

function run(rec: Recording): void {
  showErr('');
  load(rec);
  if (isPhone()) {
    els.val.blur();
    els.idx.blur();
  }
}

type Op = { id: string; label: string; cls?: string; act: () => void };

function insertAt(i: number | 'head' | 'tail'): void {
  const v = readValue();
  if (v == null || full()) return;
  const s = ui.structure;
  if (s === 'array') {
    const A = world.array;
    run(arr.insert(A, i === 'head' ? 0 : i === 'tail' ? A.len : i, v));
  } else if (s === 'singly' || s === 'doubly') {
    const L = world[s];
    run(i === 'head' ? list.insertHead(L, v) : i === 'tail' ? list.insertTail(L, v) : list.insertAt(L, v, i));
  }
}

function seqOps(): Op[] {
  const s = ui.structure;
  return [
    { id: 'bHead', label: 'Insert at head', act: () => insertAt('head') },
    { id: 'bTail', label: 'Insert at tail', act: () => insertAt('tail') },
    {
      id: 'bDelete',
      label: 'Delete at index',
      act: () => {
        const i = readIndex(false);
        if (i == null) return;
        run(s === 'array' ? arr.remove(world.array, i) : list.deleteAt(world[s as 'singly'], i));
      },
    },
    {
      id: 'bSearch',
      label: 'Search value',
      act: () => {
        if (!els.val.value.trim()) return showErr('Type the value to search for.', els.val);
        const v = readValue();
        if (v == null) return;
        run(s === 'array' ? arr.search(world.array, v) : list.search(world[s as 'singly'], v));
      },
    },
    {
      id: 'bGet',
      label: 'Get index',
      act: () => {
        const i = readIndex(false);
        if (i == null) return;
        run(s === 'array' ? arr.get(world.array, i) : list.get(world[s as 'singly'], i));
      },
    },
    {
      id: 'bReverse',
      label: 'Reverse',
      cls: 'accent',
      act: () => run(s === 'array' ? arr.reverse(world.array) : list.reverse(world[s as 'singly'])),
    },
  ];
}

function boxOps(): Op[] {
  const dfs = ui.structure === 'stack';
  return [
    {
      id: 'bTake',
      label: dfs ? 'Pop' : 'Dequeue',
      act: () => run(dfs ? stack.pop(world.stack) : ring.dequeue(world.queue)),
    },
    { id: 'bPeek', label: 'Peek', act: () => run(dfs ? stack.peek(world.stack) : ring.peek(world.queue)) },
    {
      id: 'bDemo',
      label: dfs ? 'Push 1–5, pop all' : 'Fill and empty',
      cls: 'accent',
      act: () => {
        if (dfs) {
          world.stack.clear();
          ui.next.stack = 6;
          run(stack.fillAndEmpty(world.stack, [1, 2, 3, 4, 5]));
        } else {
          world.queue.reset(5);
          ui.next.queue = 6;
          run(ring.fillAndEmpty(world.queue, [1, 2, 3, 4, 5]));
        }
      },
    },
    {
      id: 'bBridge',
      label: dfs ? 'Drive a DFS →' : 'Drive a BFS →',
      act: () => run(bridgeSearch(dfs ? 'dfs' : 'bfs')),
    },
  ];
}

let ops: Op[] = [];
function renderOps(): void {
  ops = isSeq(ui.structure) ? seqOps() : boxOps();
  els.ops.className = isSeq(ui.structure) ? 'seq' : 'box';
  els.ops.innerHTML = ops
    .map(o => `<button class="btn${o.cls ? ' ' + o.cls : ''}" id="${o.id}" type="button">${o.label}</button>`)
    .join('');
}
els.ops.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  const op = b && ops.find(o => o.id === b.id);
  if (!op) return;
  sound.ensure();
  op.act();
});

byId('opform').addEventListener('submit', e => {
  e.preventDefault();
  sound.ensure();
  const s = ui.structure;
  if (s === 'stack' || s === 'queue') {
    const v = readValue();
    if (v == null) return;
    if (s === 'stack' && full()) return;
    ui.next[s] = Math.min(99, v + 1);
    run(s === 'stack' ? stack.push(world.stack, v) : ring.enqueue(world.queue, v));
    if (!els.val.value.trim()) return;
    if (!isPhone()) els.val.select();
    return;
  }
  if (!els.idx.value.trim()) return insertAt('tail');
  const i = readIndex(true);
  if (i != null) insertAt(i);
});

byId('bReset').addEventListener('click', () => reset());
function reset(): void {
  const s = ui.structure;
  (world as unknown as Record<Structure, unknown>)[s] = fresh(s);
  if (s === 'stack' || s === 'queue') ui.next[s] = 4;
  closeInspector(true);
  showErr('');
  load(emptyRecording(s), { autoplay: false, catchDur: 0.8 });
}

function syncControls(): void {
  const s = ui.structure;
  document
    .querySelectorAll<HTMLButtonElement>('#kindSeg button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === s)));
  byId('idxField').hidden = !isSeq(s);
  els.main.textContent = s === 'stack' ? 'Push' : s === 'queue' ? 'Enqueue' : 'Insert';
  els.val.placeholder = s === 'stack' || s === 'queue' ? `blank: ${ui.next[s]}` : 'blank picks one';
  els.idx.placeholder = 'end';
  byId('memLabel').textContent = s === 'queue' ? 'Memory view: unbend the ring' : 'Memory view';
  renderOps();
  byId('legend').innerHTML = legendHTML(s, true);
  byId('helpLegend').innerHTML = legendHTML(s, false);
}

byId('kindSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b?.dataset.k) return;
  sound.ensure();
  setStructure(b.dataset.k as Structure);
});
byId<HTMLInputElement>('optMemory').addEventListener('change', e => {
  ui.memory = (e.target as HTMLInputElement).checked;
});

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: { theta: -0.12, phi: PHI_LINE },
  frameButton: byId('bFrame'),
  lockZ: false,
  minDist: 7,
  maxDist: 110,
});
function measureFree(): void {
  const W = innerWidth,
    H = innerHeight;
  if (isPhone()) {
    const ins = byId('inspector');
    const top = ins.hidden ? masthead.getBoundingClientRect().bottom + 10 : ins.getBoundingClientRect().bottom + 14;
    const bot = dock.getBoundingClientRect().top - 8;
    framer.free = { l: 10, r: W - 10, t: top, b: Math.max(top + 120, bot) };
  } else {
    const d = dock.getBoundingClientRect(),
      b = bar ? bar.getBoundingClientRect().top : H - 100,
      sr = side.getBoundingClientRect();
    const r = sr.width > 0 ? sr.left - 18 : W - 24;
    framer.free = { l: d.right + 20, r: Math.max(d.right + 300, r), t: 78, b: Math.max(200, b - 14) };
  }
}
/** The code and cost cards live in the right column on a desk and in the sheet on a phone. */
function placePanels(): void {
  const phone = isPhone();
  for (const id of ['code', 'cost']) {
    const el = byId(id),
      home = phone ? dock : side;
    if (el.parentElement !== home) home.appendChild(el);
  }
  measureFree();
}

/* ---------------- picking ---------------- */

const pointers = new Set<number>();
let down: { x: number; y: number; t: number } | null = null;
function pick(e: { clientX: number; clientY: number }): string | null {
  let best: string | null = null,
    bd = Infinity;
  for (const w of scene.itemWorld.values()) {
    const c = scene.toScreen(w.x, w.y, w.z),
      edge = scene.toScreen(w.x + scene.right.x * w.r, w.y + scene.right.y * w.r, w.z + scene.right.z * w.r);
    if (!c || !edge) continue;
    const pr = Math.hypot(edge.x - c.x, edge.y - c.y),
      d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
    if (d < pr + 8 && d < bd) {
      bd = d;
      best = w.key;
    }
  }
  if (best) return best;
  for (const b of player.pose().blocks.values()) {
    if (b.a < 0.5) continue;
    for (let i = 0; i < b.cap; i++) {
      const ref = `c:${b.key}:${i}`,
        c = scene.refScreen(ref);
      const d = c ? Math.hypot(e.clientX - c.x, e.clientY - c.y) : Infinity;
      if (d < 26 && d < bd) {
        bd = d;
        best = ref;
      }
    }
  }
  return best;
}
canvas.addEventListener('pointerdown', e => {
  pointers.add(e.pointerId);
  down = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
  if (e.button === 2 || e.button === 1 || pointers.size > 1 || e.shiftKey || e.ctrlKey || e.metaKey) framer.manual();
  sound.ensure();
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (
    e.type === 'pointerup' &&
    down &&
    Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 &&
    e.timeStamp - down.t < 700
  ) {
    const hit = pick(e);
    if (hit) select(hit);
    else if (ui.selected != null) closeInspector();
  }
  down = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', () => framer.manual(), { passive: true });
canvas.addEventListener('contextmenu', e => e.preventDefault());
controls.addEventListener('start', () => framer.turned());
canvas.addEventListener('pointermove', e => {
  if (pointers.size || isPhone()) return;
  canvas.style.cursor = pick(e) ? 'pointer' : 'grab';
});

/* ---------------- keys, sound, navigation ---------------- */

bindSoundToggle(byId('bSound'));
byId('bFrame').addEventListener('click', () => framer.reset());
const help = bindHelp();
bindKeys({
  player,
  isTyping: e => e.target === els.val || e.target === els.idx,
  onEscape: (_e, typing) => {
    if (help.isOpen()) help.close();
    else if (ui.selected != null) closeInspector();
    else if (typing) (document.activeElement as HTMLElement | null)?.blur();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
mountNav({ current: 'lists' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);

/* ---------------- start: the chain is assembled on its plinth ---------------- */

syncControls();
placePanels();
player.intro(assemble(player.prog.startPose, REDUCED));
transport.build();
showStep(-1);
refreshAfterStep();
measureFree();
framer.place(26);

/* ---------------- the frame loop ---------------- */

let memE = 0;
const view = {
  get mem() {
    return memE;
  },
  get selected() {
    return ui.selected;
  },
  get clock() {
    return clock;
  },
};
const phiFor = (P: Pose) => {
  const base =
    P.net && P.net.a > 0.5
      ? PHI_NET
      : P.structure === 'stack'
        ? PHI_STACK
        : P.structure === 'queue'
          ? PHI_RING
          : PHI_LINE;
  return lerp(base, PHI_MEM, memE);
};
/** Frame where the step on screen will come to rest, so the camera does not chase every motion. */
function framePose(): Pose {
  const T = player.tr;
  if (!T || T.i < 0) return player.pose();
  return restAt(player.prog, T.dir > 0 ? T.i : T.i - 1);
}

function frame(dt: number): void {
  clock += dt;
  player.tick(dt);
  memE += ((ui.memory ? 1 : 0) - memE) * (REDUCED ? 1 : 1 - Math.exp(-dt * 3.2));
  const P = player.pose();
  scene.draw(P, view);
  let focus = null;
  if (P.focus && P.focus.w > 0.01) {
    const a = scene.anchorOf(P.focus.at);
    if (a) focus = { x: a.x, y: a.y, z: a.z, w: P.focus.w, zoom: 0.14 };
  }
  controls.update();
  framer.update(dt, scene.frameBox(framePose()), focus, { phi: phiFor(P), rate: 1.4 });
  camera.lookAt(controls.target);
  scene.fitLights();
  const c = P.callout,
    a = c ? scene.anchorOf(c.at) : null;
  placeCallout(
    c && a ? { x: a.x, y: a.y + 0.1, z: a.z, off: a.r + 0.35, side: 'r', text: c.text, tone: c.tone, a: c.a } : null,
  );
  scene.render();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
});

exposeTestHooks('__lists', {
  camera,
  renderer,
  player,
  world,
  ui,
  setStructure,
  /** Run one of the page's operations by the id of its button. */
  press: (id: string) => (id === 'bReset' ? reset() : ops.find(o => o.id === id)?.act()),
  diagram: currentDiagram,
  currentPose: () => player.pose(),
  itemScreen: (key: string) => scene.refScreen(key),
  items: () => [...scene.itemWorld.keys()],
  setSpeed: (s: number) => transport.setSpeed(s),
  seek: (i: number) => player.seek(i),
  stepBy: (d: 1 | -1) => player.stepBy(d),
  togglePlay: () => player.togglePlay(),
  freezeAt: (i: number, t: number) => player.freezeAt(i, t),
  unfreeze() {
    player.freeze = false;
  },
  counts: () => scene.counts(),
  /** Run the animation clock forward without waiting for frames. */
  advance(sec: number) {
    for (let k = 0; k < sec * 60; k++) {
      player.tick(1 / 60);
      memE += ((ui.memory ? 1 : 0) - memE) * (1 - Math.exp(-3.2 / 60));
      if (k % 6 === 0) scene.draw(player.pose(), view);
    }
  },
  /** Let the camera finish easing at once. */
  settle() {
    for (let k = 0; k < 40; k++) {
      const P = player.pose();
      scene.draw(P, view);
      camera.updateMatrixWorld();
      framer.update(0.25, scene.frameBox(framePose()), null, { phi: phiFor(P), rate: 1.4 });
      camera.lookAt(controls.target);
    }
  },
  /** JavaScript cost of one frame in ms: pose, drawing lists, framing (no GPU). */
  bench(n = 60) {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const P = player.pose();
      scene.draw(P, view);
      scene.frameBox(P);
      scene.fitLights();
    }
    return (performance.now() - t0) / n;
  },
});
