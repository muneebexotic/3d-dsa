// Sorting Loom, No. 6: six classic sorts, each weaving the same threads into a
// cloth, one row per comparison. This file wires the pieces together: the sorts,
// the player, the scene, the panels and the controls.

import { bindHelp, bindKeys, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import type { Recording, Step } from './diagram';
import { VIEWS, type View } from './layout';
import { HOLD, RATE, assemble, buildTransition, morph } from './motion';
import * as ops from './ops';
import {
  CodeCard,
  costChips,
  growthSVG,
  inspect,
  legendHTML,
  statsLine,
  whenHTML,
  workRows,
  workSVG,
  type Measure,
} from './panels';
import { makeProgram, restAt, type LoomProgram, type Pose } from './poses';
import { LoomScene } from './scene';
import { playStepSound } from './sound';
import { INPUT_NAMES, threadsOf, type InputKind } from './threads';
import { SORTS, type SortKey } from './sorts';
import { START, createUiState, threadsFor } from './state';

const ui = createUiState();
let threads = threadsFor(ui);
const canvas = byId<HTMLCanvasElement>('stage');
const scene = new LoomScene(canvas);
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
let clock = 0;

/** The recording for what the controls say now. */
const recordingFor = (): Recording => (ui.mode === 'race' ? ops.race(threads) : ops.solo(ui.sort, threads));

/* ---------------- the player ---------------- */

const player: Player<Step, Pose, LoomProgram> = new Player<Step, Pose, LoomProgram>(
  {
    build: buildTransition,
    morph,
    holdFor: st => readingHold(st, HOLD, RATE, REDUCED),
    onShow: i => showStep(i),
    onStep: (st, i, tr) =>
      playStepSound(player.prog.rec, st, i > 0 ? player.prog.steps[i - 1] : null, tr.dur, player.speed),
    onBack: () => {
      if (sound.ready()) sound.tink(660, 0.06, 0, 0.2);
    },
    onRefresh: () => refreshAfterStep(),
    onUI: () => transport.updatePlayUI(),
    onLoad: () => transport.build(),
    onGesture: () => sound.ensure(),
  },
  makeProgram(recordingFor()),
);
const transport = mountTransport(byId('transport'), player, {
  onGesture: () => sound.ensure(),
  tickClass: s => (s.kind === 'move' || s.kind === 'stand' ? 'key' : s.kind === 'done' ? 'rot' : ''),
});
const bar = document.querySelector<HTMLElement>('#transport .bar');

/** Play a recording, always easing from whatever is on screen to its start. */
function load(
  rec: Recording,
  { autoplay = true, catchDur = 0.7, quiet = false }: { autoplay?: boolean; catchDur?: number; quiet?: boolean } = {},
): void {
  const P0 = player.pose();
  const prog = makeProgram(rec);
  player.load(prog, { autoplay, catchDur });
  player.tr =
    catchDur > 0
      ? { tr: morph(P0, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => (player.hold = 0.2) }
      : null;
  if (!quiet) sound.ensure();
  framer.home = VIEWS[angleFor()];
  showStep(-1);
  refreshAfterStep();
  syncControls();
}

/* ---------------- narration and panels ---------------- */

const plac = placard();
const codeCard = new CodeCard(byId('codeTitle'), byId<HTMLOListElement>('codeLines'));
const callout = byId('callout');

let panelSig = '';
function showStep(i: number): void {
  const prog = player.prog,
    rec = prog.rec,
    st = i >= 0 ? prog.steps[i] : null;
  plac.set({
    op: st ? st.op : rec.title,
    stepno: prog.steps.length ? `Step ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : rec.intro.head,
    body: st ? st.body : rec.intro.body,
    chips: costChips(st),
  });
  transport.mark(i);
  const solo = rec.mode === 'solo' ? rec.looms[0].key : null;
  codeCard.show(solo, st ? st.line : -1);
  byId('workChart').innerHTML = workSVG(workRows(rec, st, threads, ui.measure), threads.n, ui.measure, rec.mode);
  const sig = `${rec.mode}:${solo}:${threads.kind}:${threads.n}`;
  if (sig !== panelSig) {
    panelSig = sig;
    byId('growthChart').innerHTML = growthSVG(threads.kind, threads.n, solo ? [solo] : []);
    byId('growthKind').textContent = INPUT_NAMES[threads.kind].toLowerCase();
    byId('costTable').innerHTML = whenHTML(solo, threads.kind);
  }
}

function refreshAfterStep(): void {
  transport.updatePlayUI();
  byId('mstats').textContent = statsLine(threads);
  updateInspector();
}

/* ---------------- inspector: follow one thread ---------------- */

function currentStep(): Step | null {
  return player.idx >= 0 ? player.prog.steps[player.idx] : null;
}
function updateInspector(): void {
  if (ui.selected == null) return;
  const v = inspect(player.prog.rec, currentStep(), ui.selected);
  if (!v) return closeInspector();
  byId('insDisc').innerHTML = v.disc;
  byId('insState').innerHTML = `<b>${v.title}</b><span>${v.sub}</span>`;
  byId('insGrid').innerHTML = v.cells.map(([k, val]) => `<div><div>${k}</div><div>${val}</div></div>`).join('');
  byId('insNote').textContent = v.note;
}
function select(t: number): void {
  ui.selected = t;
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

/* ---------------- controls ---------------- */

function weave(): void {
  load(recordingFor());
}

function pickSort(key: SortKey): void {
  sound.ensure();
  ui.mode = 'solo';
  ui.sort = key;
  weave();
}
function pickRace(): void {
  sound.ensure();
  ui.mode = 'race';
  weave();
}
function newThreads(): void {
  threads = threadsFor(ui);
  closeInspector(true);
  weave();
}

byId('sortSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  if (b.id === 'bRace') pickRace();
  else if (b.dataset.s) pickSort(b.dataset.s as SortKey);
});
byId('inputSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b?.dataset.k || b.dataset.k === ui.kind) return;
  sound.ensure();
  ui.kind = b.dataset.k as InputKind;
  newThreads();
});
byId('sizeSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  const n = Number(b?.dataset.n);
  if (!n || n === ui.n) return;
  sound.ensure();
  ui.n = n;
  newThreads();
});
byId('bShuffle').addEventListener('click', () => {
  sound.ensure();
  ui.seed = 1 + Math.floor(Math.random() * 100000);
  if (ui.kind === 'reversed') ui.kind = 'random';
  newThreads();
});
byId('measureSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b?.dataset.m) return;
  ui.measure = b.dataset.m as Measure;
  syncControls();
  showStep(player.activeIndex());
});
byId('viewSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (b?.dataset.v) setView(b.dataset.v as View);
});
/** The camera's angle: the view chosen, squared up when six looms share the plinth. */
const angleFor = () => (ui.view === 'loom' && player.prog.rec.mode === 'race' ? 'race' : ui.view);
function setView(v: View): void {
  ui.view = v;
  framer.home = VIEWS[angleFor()];
  framer.reset();
  syncControls();
}

byId('bReset').addEventListener('click', () => reset());
function reset(): void {
  Object.assign(ui, { mode: 'race', ...START });
  threads = threadsFor(ui);
  closeInspector(true);
  load(recordingFor(), { autoplay: false, catchDur: 0.8 });
  setView('loom');
}

function syncControls(): void {
  const press = (sel: string, on: (b: HTMLButtonElement) => boolean) =>
    document.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.setAttribute('aria-pressed', String(on(b))));
  press('#sortSeg button[data-s]', b => ui.mode === 'solo' && b.dataset.s === ui.sort);
  byId('bRace').setAttribute('aria-pressed', String(ui.mode === 'race'));
  press('#inputSeg button', b => b.dataset.k === ui.kind);
  press('#sizeSeg button', b => Number(b.dataset.n) === ui.n);
  press('#viewSeg button', b => b.dataset.v === ui.view);
  press('#measureSeg button', b => b.dataset.m === ui.measure);
}

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: VIEWS.race,
  frameButton: byId('bFrame'),
  lockZ: false,
  minDist: 6,
  maxDist: 900,
});
controls.maxDistance = 900;
camera.far = 2000;

/** Ease the lens toward the view's: a long lens flattens the loom into a chart. */
function lens(dt: number): void {
  const k = REDUCED ? 1 : 1 - Math.exp(-dt * 3.2);
  view.shed += ((ui.view === 'bars' ? 0 : 1) - view.shed) * k;
  const want = VIEWS[angleFor()].fov;
  if (Math.abs(camera.fov - want) > 0.005) {
    camera.fov += (want - camera.fov) * k;
    camera.updateProjectionMatrix();
  }
  scene.fogFor(camera.position.distanceTo(controls.target));
}
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
function placePanels(): void {
  const phone = isPhone();
  for (const id of ['work', 'growth', 'code', 'cost']) {
    const el = byId(id),
      home = phone ? dock : side;
    if (el.parentElement !== home) home.appendChild(el);
  }
  measureFree();
}

/* ---------------- picking: click a disc to follow its thread ---------------- */

const pointers = new Set<number>();
let down: { x: number; y: number; t: number } | null = null;
function pick(e: { clientX: number; clientY: number }): number | null {
  let best: number | null = null,
    bd = Infinity;
  for (const w of scene.discWorld.values()) {
    const c = scene.toScreen(w.x, w.y, w.z),
      edge = scene.toScreen(w.x + scene.right.x * w.r, w.y + scene.right.y * w.r, w.z + scene.right.z * w.r);
    if (!c || !edge) continue;
    const pr = Math.hypot(edge.x - c.x, edge.y - c.y),
      d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
    if (d < pr + 7 && d < bd) {
      bd = d;
      best = w.t;
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
    if (hit != null) select(hit);
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
  canvas.style.cursor = pick(e) != null ? 'pointer' : 'grab';
});

/* ---------------- keys, sound, navigation ---------------- */

bindSoundToggle(byId('bSound'));
byId('bFrame').addEventListener('click', () => framer.reset());
const help = bindHelp();
bindKeys({
  player,
  onEscape: () => {
    if (help.isOpen()) help.close();
    else if (ui.selected != null) closeInspector();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
mountNav({ current: 'sorting' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);
byId('legend').innerHTML = legendHTML(true);
byId('helpLegend').innerHTML = legendHTML(false);

/* ---------------- start: the heddles rise, then all six weave ---------------- */

syncControls();
placePanels();
load(recordingFor(), { autoplay: true, catchDur: 0, quiet: true });
player.intro(assemble(player.prog.startPose, REDUCED));
player.hold = REDUCED ? 0.6 : 1.6;
measureFree();
framer.place(26);

/* ---------------- the frame loop ---------------- */

const view = {
  get selected() {
    return ui.selected;
  },
  get clock() {
    return clock;
  },
  /** The Bars view pulls the warp tight, so each thread drops straight down its heddle. */
  shed: 1,
};
/** Frame where the step on screen will come to rest, so the camera does not chase every row. */
function framePose(): Pose {
  const T = player.tr;
  if (!T || T.i < 0) return player.pose();
  return restAt(player.prog, T.dir > 0 ? T.i : T.i - 1);
}

function placeCallout(P: Pose): void {
  const c = P.callout,
    a = c ? scene.calloutAnchor() : null;
  const s = a ? scene.toScreen(a.x, a.y, a.z) : null;
  if (!c || !s || c.al < 0.02) {
    callout.style.opacity = '0';
    return;
  }
  if (callout.textContent !== c.text) callout.textContent = c.text;
  callout.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
  callout.style.opacity = c.al.toFixed(3);
}

function frame(dt: number): void {
  clock += dt;
  player.tick(dt);
  const P = player.pose();
  scene.draw(P, view);
  controls.update();
  lens(dt);
  framer.update(dt, scene.frameBox(framePose()), null, { ...VIEWS[angleFor()], rate: 1.4 });
  camera.lookAt(controls.target);
  scene.fitLights();
  placeCallout(P);
  scene.render();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
});

exposeTestHooks('__sorting', {
  camera,
  renderer,
  player,
  ui,
  get threads() {
    return threads;
  },
  /** Weave one sort, or all six, on the current threads. */
  weave: (key: SortKey | 'race') => (key === 'race' ? pickRace() : pickSort(key)),
  /** Use these threads (any values), for tests that need fixed input. */
  useValues(values: number[]) {
    threads = threadsOf(values);
    weave();
  },
  sorts: SORTS,
  currentPose: () => player.pose(),
  discScreen: (t: number) => scene.discScreen(t),
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
      lens(0.25);
      camera.updateMatrixWorld();
      framer.update(0.25, scene.frameBox(framePose()), null, { ...VIEWS[angleFor()], rate: 1.4 });
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
