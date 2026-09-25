// Heap Pyramid, No. 5: a binary heap as one array folded into a tree, with push,
// pop, heapify, min and max, and Graph Net's Dijkstra replayed on it. This file
// wires the pieces together: the heap, the player, the scene, the panels and the
// controls.

import { bindHelp, bindKeys, calloutPlacer, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import type { Diagram, Recording, Step, StepKind, View } from './diagram';
import { MAX_KEY, MIN_KEY, type Order } from './heap';
import { PHI } from './layout';
import { HOLD, RATE, assemble, buildTransition, morph } from './motion';
import * as ops from './ops';
import { CodeCard, WorkChart, costChips, costHTML, inspect, legendHTML, netSVG, rowsHTML, statsLine } from './panels';
import { makeProgram, restAt, type HeapProgram, type Pose } from './poses';
import { HeapScene } from './scene';
import { playStepSound } from './sound';
import { BUILD_SIZE, START_KEYS, createUiState, diagramOf, freshWorld } from './state';

const ui = createUiState();
let world: ops.World = freshWorld();
const canvas = byId<HTMLCanvasElement>('stage');
const scene = new HeapScene(canvas);
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
let clock = 0;

/** The opening words for the heap: its story when it is fresh, or where things stand now. */
function introFor(): { head: string; body: string } {
  const H = world.H,
    w = ops.words(H.order);
  const fresh = H.order === 'min' && H.n === START_KEYS.length && H.keys().every((k, i) => k === START_KEYS[i]);
  if (fresh)
    return {
      head: 'Ten keys, the smallest on top.',
      body: 'Push a key to watch it climb, or pop the top and watch the last key sink into its place. Heapify builds a heap from a scrambled array, and Dijkstra’s queue replays Graph Net’s run on this heap.',
    };
  return {
    head: `${statsLine(diagramOf(world))}.`,
    body: `The ${w.best} key is on top. Push, pop, heapify, or reset to start again.`,
  };
}

/* ---------------- the player ---------------- */

const WRITE_KINDS: ReadonlySet<StepKind> = new Set<StepKind>([
  'swap',
  'push',
  'pop',
  'relower',
  'take',
  'last',
  'fold',
]);
const BAD_KINDS: ReadonlySet<StepKind> = new Set<StepKind>(['full', 'empty']);

const emptyRecording = (): Recording => ({
  title: 'Heap Pyramid',
  steps: [],
  start: diagramOf(world),
  ledger: world.H.ledger.length,
  intro: introFor(),
});

const player: Player<Step, Pose, HeapProgram> = new Player<Step, Pose, HeapProgram>(
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
  makeProgram(emptyRecording()),
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
  { autoplay = true, catchDur = 0.6, quiet = false }: { autoplay?: boolean; catchDur?: number; quiet?: boolean } = {},
): void {
  const P0 = player.pose();
  const prog = makeProgram(rec);
  player.load(prog, { autoplay, catchDur });
  player.tr =
    catchDur > 0
      ? { tr: morph(P0, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => (player.hold = 0.15) }
      : null;
  // audio may only start after a gesture, so the opening stays silent
  if (!quiet) sound.ensure();
  showStep(-1);
  refreshAfterStep();
  syncControls();
}

/* ---------------- narration and panels ---------------- */

const plac = placard();
const placeCallout = calloutPlacer(camera);
const codeCard = new CodeCard(byId('codeTitle'), byId<HTMLOListElement>('codeLines'));
const chart = new WorkChart(byId('workChart'));
const netCard = byId('net'),
  netMap = byId('netMap');

const currentDiagram = (): Diagram => (player.idx >= 0 ? player.prog.steps[player.idx].diag : player.prog.start);

let costSig = '';
function showStep(i: number): void {
  const prog = player.prog,
    st = i >= 0 ? prog.steps[i] : null;
  const d = st ? st.diag : prog.start;
  plac.set({
    op: st ? st.op : prog.title,
    stepno: prog.steps.length ? `Step ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : (prog.intro?.head ?? `${prog.title}.`),
    body: st ? st.body : (prog.intro?.body ?? 'Press play.'),
    chips: costChips(st),
  });
  transport.mark(i);
  const first = prog.steps[0];
  codeCard.show(st ? st.code : (first?.code ?? null), d.order, st ? st.line : -1);
  const cx = st ? st.cx : (first?.cx ?? null);
  const build = cx === 'build';
  const sig = build ? `b:${d.n}` : `c:${cx}:${d.order}`;
  if (sig !== costSig) {
    costSig = sig;
    byId('costTitle').textContent = build ? 'Heapify or n pushes: most swaps per row' : 'Heap or array?';
    byId('costTable').innerHTML = build ? rowsHTML(d.n) : costHTML(cx, d.order);
  }
  chart.render(world.H.ledger, st ? st.ledger : prog.ledger);
  const net = st?.net ?? first?.net ?? null;
  const showNet = !!net;
  if (netCard.hidden === showNet) {
    netCard.hidden = !showNet;
    measureFree();
  }
  if (net) netMap.innerHTML = netSVG(net);
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
  key: byId<HTMLInputElement>('key'),
  err: byId('err'),
};

function showErr(msg: string): void {
  els.err.textContent = msg;
  els.key.setAttribute('aria-invalid', String(!!msg));
}

const randomKey = (): number => MIN_KEY + Math.floor(Math.random() * (MAX_KEY - MIN_KEY + 1));

/** The typed key, or one picked at random for a blank box. Null (with a message) if it is not usable. */
function readKey(): number | null {
  const raw = els.key.value.trim();
  if (!raw) return randomKey();
  if (!/^[+-]?\d+$/.test(raw)) {
    showErr(`“${raw.slice(0, 8)}” is not a whole number. Keys here are numbers like 42.`);
    return null;
  }
  const k = parseInt(raw, 10);
  if (k < MIN_KEY || k > MAX_KEY) {
    showErr(`Use a key from ${MIN_KEY} to ${MAX_KEY}, so it fits on a disc.`);
    return null;
  }
  return k;
}

function run(rec: Recording): void {
  showErr('');
  load(rec);
  if (isPhone()) els.key.blur();
}

/** Keys with no repeats, so every disc can be told apart. */
function distinctKeys(n: number): number[] {
  const pool = Array.from({ length: MAX_KEY - MIN_KEY + 1 }, (_, i) => MIN_KEY + i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

const OPS: Record<string, () => void> = {
  bPop: () => run(ops.pop(world)),
  bRandom: () => run(ops.pushMany(world, distinctKeys(4))),
  bHeapify: () => run(ops.heapify(world, distinctKeys(BUILD_SIZE))),
  bDrain: () => run(ops.drain(world)),
  bDijkstra: () => run(ops.dijkstra(world)),
};
byId('opbtns').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  const op = b && OPS[b.id];
  if (!op) return;
  sound.ensure();
  op();
});

byId('opform').addEventListener('submit', e => {
  e.preventDefault();
  sound.ensure();
  const typed = !!els.key.value.trim();
  const k = readKey();
  if (k == null) return;
  run(ops.push(world, k));
  if (typed && !isPhone()) els.key.select();
});

function setOrder(o: Order): void {
  if (world.H.order === o) return;
  sound.ensure();
  closeInspector(true);
  run(ops.flip(world, o));
}
byId('orderSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (b?.dataset.o) setOrder(b.dataset.o as Order);
});

function setView(v: View): void {
  if (world.view === v) return;
  sound.ensure();
  run(ops.setView(world, v));
}
byId('viewSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (b?.dataset.v) setView(b.dataset.v as View);
});

byId('bReset').addEventListener('click', () => reset());
function reset(): void {
  world = freshWorld();
  closeInspector(true);
  showErr('');
  load(emptyRecording(), { autoplay: false, catchDur: 0.8 });
}

function syncControls(): void {
  const o = world.H.order;
  document
    .querySelectorAll<HTMLButtonElement>('#orderSeg button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.o === o)));
  document
    .querySelectorAll<HTMLButtonElement>('#viewSeg button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === world.view)));
  byId('bPop').textContent = `Pop the ${ops.words(o).top}`;
  byId('legend').innerHTML = legendHTML(o, true);
  byId('helpLegend').innerHTML = legendHTML(o, false);
}

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: { theta: -0.12, phi: PHI },
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
/** The side cards live in the right column on a desk and in the sheet on a phone. */
function placePanels(): void {
  const phone = isPhone();
  for (const id of ['net', 'work', 'code', 'cost']) {
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
  for (const map of [scene.itemWorld, scene.chipWorld])
    for (const w of map.values()) {
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
  isTyping: e => e.target === els.key,
  onEscape: (_e, typing) => {
    if (help.isOpen()) help.close();
    else if (ui.selected != null) closeInspector();
    else if (typing) (document.activeElement as HTMLElement | null)?.blur();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
mountNav({ current: 'heap' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);

/* ---------------- start: the cells rise, then the array folds into the pyramid ---------------- */

syncControls();
placePanels();
load(ops.opening(world), { autoplay: true, catchDur: 0, quiet: true });
player.intro(assemble(player.prog.startPose, REDUCED));
player.hold = REDUCED ? 0.6 : 1.4;
measureFree();
framer.place(28);

/* ---------------- the frame loop ---------------- */

const view = {
  get selected() {
    return ui.selected;
  },
  get clock() {
    return clock;
  },
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
  const P = player.pose();
  scene.draw(P, view);
  let focus = null;
  if (P.focus && P.focus.w > 0.01) {
    const a = scene.anchorOf(P.focus.at);
    if (a) focus = { x: a.x, y: a.y, z: a.z, w: P.focus.w, zoom: 0.08 };
  }
  controls.update();
  framer.update(dt, scene.frameBox(framePose()), focus, { phi: PHI, rate: 1.2 });
  camera.lookAt(controls.target);
  scene.fitLights();
  const c = P.callout,
    a = c ? scene.anchorOf(c.at) : null;
  placeCallout(
    c && a ? { x: a.x, y: a.y + 0.28, z: a.z, off: a.r + 0.3, side: 'r', text: c.text, tone: c.tone, a: c.a } : null,
  );
  scene.render();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
});

exposeTestHooks('__heap', {
  camera,
  renderer,
  player,
  get world() {
    return world;
  },
  ui,
  /** Run one of the page's operations by the id of its button. */
  press: (id: string) => (id === 'bReset' ? reset() : OPS[id]?.()),
  /** Load any recorded operation, for tests that need fixed keys. */
  run: (name: 'push' | 'heapify', arg: number | number[]) =>
    run(name === 'push' ? ops.push(world, arg as number) : ops.heapify(world, arg as number[])),
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
      if (k % 6 === 0) scene.draw(player.pose(), view);
    }
  },
  /** Let the camera finish easing at once. */
  settle() {
    for (let k = 0; k < 40; k++) {
      const P = player.pose();
      scene.draw(P, view);
      camera.updateMatrixWorld();
      framer.update(0.25, scene.frameBox(framePose()), null, { phi: PHI, rate: 1.2 });
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
