// Hash Clock, No. 4: a hash table as a clock of buckets, with chaining and linear
// probing, a load gauge, and a table that doubles and rehashes in front of you.
// This file wires the pieces together: the tables, the player, the scene, the
// panels and the controls.

import { bindHelp, bindKeys, calloutPlacer, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import type { Diagram, Recording, Step, StepKind } from './diagram';
import { MAX_KEY, MIN_KEY, type HashFn } from './hash';
import { PHI } from './layout';
import { HOLD, RATE, assemble, buildTransition, morph } from './motion';
import * as ops from './ops';
import { CodeCard, STRATEGY_NAME, WorkChart, costChips, costHTML, inspect, legendHTML, statsLine } from './panels';
import { makeProgram, restAt, type HashProgram, type Pose } from './poses';
import { HashScene } from './scene';
import { playStepSound } from './sound';
import { START_KEYS, createUiState, createWorld, diagramOf, fresh, type World } from './state';
import { MIN_SIZE, type Strategy } from './table';

const ui = createUiState();
const world: World = createWorld();
const canvas = byId<HTMLCanvasElement>('stage');
const scene = new HashScene(canvas);
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
let clock = 0;

const INTRO: Readonly<Record<Strategy, { head: string; body: string }>> = {
  chain: {
    head: 'Six keys in eight buckets: three quarters full.',
    body: 'Every bucket keeps a chain of the keys that wind round to it. 25 and 33 both land on bucket 1, so they share a chain. Insert one more key and the table passes ¾ and doubles: watch every key go back through the hub.',
  },
  probe: {
    head: 'The same six keys, one to a bucket.',
    body: 'A key whose bucket is taken tries the next one along. 33 wanted bucket 1, found 25 there and settled in 2; 70 wanted 6 and ended up in 7. Insert 17 to walk the whole run, or delete 33 to see why it leaves a tombstone.',
  },
};

/** The opening words for a table: the story of the six keys, or where things stand now. */
function introFor(s: Strategy): { head: string; body: string } {
  const T = world[s];
  if (T.ledger.length === START_KEYS.length && T.m === MIN_SIZE && T.hash === 'plain') return INTRO[s];
  return {
    head: `${STRATEGY_NAME[s]}: ${statsLine(diagramOf(T))}.`,
    body: 'Insert, search or delete a key, add a few at random, or try Unlucky keys to see the worst case.',
  };
}

/* ---------------- the player ---------------- */

const WRITE_KINDS: ReadonlySet<StepKind> = new Set<StepKind>(['link', 'place', 'put', 'grow', 'rehash', 'fountain']);
const BAD_KINDS: ReadonlySet<StepKind> = new Set<StepKind>(['missing', 'refuse', 'full', 'free', 'tomb']);

const emptyRecording = (s: Strategy): Recording => ({
  title: STRATEGY_NAME[s],
  steps: [],
  start: diagramOf(world[s]),
  ledger: world[s].ledger.length,
  intro: introFor(s),
});

const player: Player<Step, Pose, HashProgram> = new Player<Step, Pose, HashProgram>(
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
  makeProgram(emptyRecording(ui.strategy)),
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
  syncControls();
}

function setStrategy(s: Strategy): void {
  if (s === ui.strategy && player.prog.steps.length === 0) return;
  ui.strategy = s;
  closeInspector(true);
  showErr('');
  load(emptyRecording(s), { autoplay: false, catchDur: 0.8 });
}

/* ---------------- narration and panels ---------------- */

const plac = placard();
const placeCallout = calloutPlacer(camera);
const codeCard = new CodeCard(byId('codeTitle'), byId<HTMLOListElement>('codeLines'));
const chart = new WorkChart(byId('workChart'));

const currentDiagram = (): Diagram => (player.idx >= 0 ? player.prog.steps[player.idx].diag : player.prog.start);

function showStep(i: number): void {
  const prog = player.prog,
    st = i >= 0 ? prog.steps[i] : null;
  const s = prog.start.strategy;
  plac.set({
    op: st ? st.op : prog.title,
    stepno: prog.steps.length ? `Step ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : (prog.intro?.head ?? `${prog.title}.`),
    body: st ? st.body : (prog.intro?.body ?? 'Press play.'),
    chips: costChips(st, s),
  });
  transport.mark(i);
  const first = prog.steps[0];
  codeCard.show(st ? st.code : (first?.code ?? null), st ? st.line : -1);
  byId('costTable').innerHTML = costHTML(s, st ? st.cx : (first?.cx ?? null));
  chart.render(world[s].ledger, st ? st.ledger : prog.ledger);
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

const table = () => world[ui.strategy];

/** A key the table does not hold yet, picked at random. */
function freshKey(): number {
  const T = table(),
    free: number[] = [];
  for (let k = MIN_KEY; k <= MAX_KEY; k++) if (!T.has(k)) free.push(k);
  return free[Math.floor(Math.random() * free.length)] ?? 0;
}

/** The typed key; for an insert a blank box picks one. Null (with a message) if it is not usable. */
function readKey(blankPicks: boolean, what: string): number | null {
  const raw = els.key.value.trim();
  if (!raw) {
    if (blankPicks) return freshKey();
    showErr(`Type the key to ${what}.`);
    return null;
  }
  if (!/^[+-]?\d+$/.test(raw)) {
    showErr(`“${raw.slice(0, 8)}” is not a whole number. Keys here are numbers like 57.`);
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

const OPS: Record<string, () => void> = {
  bSearch: () => {
    const k = readKey(false, 'search for');
    if (k != null) run(ops.search(table(), k));
  },
  bDelete: () => {
    const k = readKey(false, 'delete');
    if (k != null) run(ops.remove(table(), k));
  },
  bRandom: () => {
    const T = table(),
      keys: number[] = [];
    for (let k = 0; k < 4; k++) {
      const pool: number[] = [];
      for (let v = MIN_KEY; v <= MAX_KEY; v++) if (!T.has(v) && !keys.includes(v)) pool.push(v);
      if (pool.length) keys.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    run(ops.insertMany(T, keys, { grow: ui.grow }, `Add ${keys.join(', ')}`));
  },
  bUnlucky: () => run(ops.unlucky(table(), { grow: ui.grow })),
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
  const k = readKey(true, 'insert');
  if (k == null) return;
  run(ops.insert(table(), k, { grow: ui.grow }));
  if (typed && !isPhone()) els.key.select();
});

function setHash(fn: HashFn): void {
  const T = table();
  if (T.hash === fn) return;
  sound.ensure();
  run(ops.switchHash(T, fn));
}
byId('hashSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (b?.dataset.h) setHash(b.dataset.h as HashFn);
});

byId<HTMLInputElement>('optGrow').addEventListener('change', e => {
  ui.grow = (e.target as HTMLInputElement).checked;
});

byId('bReset').addEventListener('click', () => reset());
function reset(): void {
  world[ui.strategy] = fresh(ui.strategy);
  closeInspector(true);
  showErr('');
  load(emptyRecording(ui.strategy), { autoplay: false, catchDur: 0.8 });
}

function syncControls(): void {
  const s = ui.strategy;
  document
    .querySelectorAll<HTMLButtonElement>('#stratSeg button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === s)));
  document
    .querySelectorAll<HTMLButtonElement>('#hashSeg button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.h === table().hash)));
  byId('legend').innerHTML = legendHTML(s, true);
  byId('helpLegend').innerHTML = legendHTML(s, false);
}

byId('stratSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b?.dataset.s) return;
  sound.ensure();
  setStrategy(b.dataset.s as Strategy);
});

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: { theta: -0.14, phi: PHI },
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
/** The code, work and cost cards live in the right column on a desk and in the sheet on a phone. */
function placePanels(): void {
  const phone = isPhone();
  for (const id of ['work', 'code', 'cost']) {
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
mountNav({ current: 'hashing' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);

/* ---------------- start: the buckets rise and the keys drop in ---------------- */

syncControls();
placePanels();
player.intro(assemble(player.prog.startPose, REDUCED));
transport.build();
showStep(-1);
refreshAfterStep();
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
    if (a) focus = { x: a.x, y: a.y, z: a.z, w: P.focus.w, zoom: 0.1 };
  }
  controls.update();
  framer.update(dt, scene.frameBox(framePose()), focus, { phi: PHI, rate: 1.2 });
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

exposeTestHooks('__hashing', {
  camera,
  renderer,
  player,
  world,
  ui,
  setStrategy,
  /** Run one of the page's operations by the id of its button. */
  press: (id: string) => (id === 'bReset' ? reset() : OPS[id]?.()),
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
