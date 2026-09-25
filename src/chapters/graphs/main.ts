// Graph Net, No. 2: BFS, DFS and Dijkstra on a net of strings.
// This file wires the pieces together: the page state, the player, the scene,
// the panels, the editor and the controls.

import { bindHelp, bindKeys, calloutPlacer, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { clamp01, lerp, plural } from '../../core/math';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import { TICK_KINDS, type AlgoKey, type StepKind } from './algorithms';
import { createEditor, type RebuildOptions } from './editing';
import { createInspector } from './inspector';
import { buildTransition, dropIn, morph } from './motion';
import { PHI_FLAT, PHI_LIFT } from './palette';
import { DSView, examinedUpTo, legendHTML, raceChips, renderAbout, renderScore } from './panels';
import type { ScenePose } from './poses';
import { PRESETS, type PresetKey } from './presets';
import { fineIndex, makeProgram, type GraphProgram, type ProgramStep } from './program';
import { GraphScene } from './scene';
import { playStepSound } from './sound';
import { createDoc, createUiState, type Tool } from './state';

const ui = createUiState();
const doc = createDoc();
const scene = new GraphScene(byId<HTMLCanvasElement>('stage'));
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
let clock = 0;

/* ---------------- the player ---------------- */

const PAYOFF: ReadonlySet<StepKind> = new Set<StepKind>(['found', 'path', 'lift']);
const HOLD = {
  start: 0.5,
  dequeue: 0.2,
  discover: 0.1,
  skip: 0.04,
  dive: 0.1,
  back: 0.08,
  extract: 0.3,
  improve: 0.2,
  keep: 0.08,
  found: 0.9,
  path: 1.2,
  lift: 1.2,
  done: 0.8,
  unreachable: 0.9,
  tick: 0.2,
};
const RATE = {
  skip: 0.0015,
  discover: 0.003,
  keep: 0.003,
  dive: 0.003,
  back: 0.003,
  dequeue: 0.004,
  improve: 0.005,
  extract: 0.005,
  tick: 0.004,
};

const specFor = () => ({
  graph: doc.graph.clone(),
  mode: ui.mode,
  algo: ui.algo,
  race: ui.race,
  start: ui.start,
  target: ui.target,
  gen: doc.gen,
});

const player: Player<ProgramStep, ScenePose, GraphProgram> = new Player<ProgramStep, ScenePose, GraphProgram>(
  {
    build: buildTransition,
    morph,
    holdFor: st => readingHold(st, HOLD, RATE, REDUCED) * (player.prog.nets[0]?.pace || 1),
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
  makeProgram(specFor()),
);
const transport = mountTransport(byId('transport'), player, {
  onGesture: () => sound.ensure(),
  tickClass: s =>
    s.kind === 'tick' ? (s.hit ? 'rot' : '') : PAYOFF.has(s.kind) ? 'rot' : TICK_KINDS[s.algo].has(s.kind) ? 'key' : '',
});
const bar = document.querySelector<HTMLElement>('#transport .bar');

/** Load a program, always easing from whatever is on screen to its start. */
function loadProg(prog: GraphProgram, { autoplay = false, catchDur = 0.6, from = null }: RebuildOptions = {}): void {
  const P0 = from || player.pose();
  player.load(prog, { autoplay, catchDur });
  player.tr =
    catchDur > 0
      ? { tr: morph(P0, prog.startPose, catchDur), i: -1, dir: 1, t: 0, after: () => (player.hold = 0.15) }
      : null;
  syncControls();
  showStep(-1);
  refreshAfterStep();
}
/** Keep the start and target valid after an edit. */
function validateEnds(): void {
  const g = doc.graph,
    ids = g.sortedIds();
  if (ui.start == null || !g.nodes.has(ui.start)) ui.start = ids.length ? ids[0] : null;
  if (ui.target != null && (!g.nodes.has(ui.target) || ui.target === ui.start)) ui.target = null;
  if (ui.selected != null && !g.nodes.has(ui.selected)) inspector.close();
  if (ui.pendingEdge && !g.nodes.has(ui.pendingEdge.id)) ui.pendingEdge = null;
  if (ui.wEdge != null && !g.edges.has(ui.wEdge)) editor.closeWeight();
}
/** Re-run the algorithm on the current graph and settings. */
function rebuild(opts: RebuildOptions = {}): void {
  validateEnds();
  loadProg(makeProgram(specFor()), opts);
}
function loadPreset(
  name: PresetKey,
  { seed = null, autoplay = false }: { seed?: number | null; autoplay?: boolean } = {},
): void {
  const P = PRESETS[name];
  ui.preset = name;
  doc.graph = P.random && seed != null ? P.make(seed) : P.make();
  doc.gen++;
  ui.start = doc.graph.byLabel(P.start);
  ui.target = P.target ? doc.graph.byLabel(P.target) : null;
  if (P.algo === 'race' && P.race) {
    ui.mode = 'race';
    ui.race = [P.race[0], P.race[1]];
  }
  byId<HTMLInputElement>('optDirected').checked = doc.graph.directed;
  ui.selected = null;
  ui.pendingEdge = null;
  editor.closeWeight();
  inspector.close(true);
  rebuild({ autoplay, catchDur: 0.9 });
  hint();
}
const markCustom = () => {
  ui.preset = 'custom';
};

/* ---------------- narration and panels ---------------- */

const plac = placard();
const placeCallout = calloutPlacer(camera);
const flyLayer = byId('flyLayer');
const dsViews = [0, 1].map(() => {
  const el = document.createElement('div');
  byId('ds').appendChild(el);
  return new DSView(el, flyLayer);
});

/** Screen position of a knot on plinth j, for items flying to and from it. */
function nodeScreen(j: number, id: number): { x: number; y: number } | null {
  const net = player.pose().nets[j];
  const w = net ? scene.nodeWorld.get(`${j}|${net.gen}:${id}`) : undefined;
  return w ? scene.toScreen(w.x, w.y, w.z) : null;
}

function showStep(i: number): void {
  const prog = player.prog,
    st = i >= 0 ? prog.steps[i] : null;
  plac.set({
    op: prog.title,
    stepno: prog.steps.length ? `${prog.mode === 'race' ? 'Tick' : 'Step'} ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : prog.intro.head,
    body: st ? st.body : prog.intro.body,
    chips: prog.mode === 'race' ? raceChips(prog, i) : '',
  });
  transport.mark(i);
  // the live data structure
  const dur = REDUCED ? 0 : Math.max(140, Math.min(900, 420 / player.speed));
  prog.nets.forEach((c, j) =>
    dsViews[j].render(c, fineIndex(prog, c, i), dur, prog.mode === 'race', id => nodeScreen(j, id)),
  );
  dsViews[1].root.hidden = prog.mode !== 'race';
  if (prog.mode === 'race') renderScore(byId('score'), prog, i);
  const c0 = prog.nets[0],
    fi = fineIndex(prog, c0, i),
    run = document.getElementById('aboutRun');
  if (run)
    run.textContent =
      `This net: V = ${prog.graph.size}, E = ${prog.graph.edges.size}.` +
      (fi >= 0 && prog.mode !== 'race'
        ? ` So far ${plural(c0.steps[fi].visited, 'knot')} processed and ${plural(examinedUpTo(c0.steps, fi), 'string')} examined.`
        : '');
}
function refreshAfterStep(): void {
  transport.updatePlayUI();
  const g = player.prog.graph;
  byId('mstats').textContent =
    `${plural(g.size, 'knot')} · ${plural(g.edges.size, 'string')}${g.directed ? ' · directed' : ''}`;
  inspector.update();
}

/* ---------------- controls ---------------- */

const HINT: Readonly<Record<Tool, string>> = {
  move: 'Drag a knot to move it. Click a knot to inspect it, or a weight to change it.',
  node: 'Click an empty spot on the plinth to add a knot.',
  edge: 'Click one knot, then another, to tie a string between them.',
  delete: 'Click a knot or a string to remove it.',
};
let hintTimer = 0;
function hint(msg?: string, err = false): void {
  clearTimeout(hintTimer);
  const el = byId('hint');
  el.textContent = msg || HINT[ui.tool];
  el.classList.toggle('err', err);
  if (err) hintTimer = window.setTimeout(() => hint(), 5200);
}

const selStart = byId<HTMLSelectElement>('selStart'),
  selTarget = byId<HTMLSelectElement>('selTarget'),
  selPreset = byId<HTMLSelectElement>('selPreset');
selPreset.innerHTML =
  Object.entries(PRESETS)
    .map(([k, p]) => `<option value="${k}">${p.name}</option>`)
    .join('') + '<option value="custom" hidden>Your own</option>';

function syncControls(): void {
  document
    .querySelectorAll<HTMLButtonElement>('#algoSeg button')
    .forEach(b =>
      b.setAttribute('aria-pressed', String(ui.mode === 'race' ? b.dataset.a === 'race' : b.dataset.a === ui.algo)),
    );
  byId('racePick').hidden = ui.mode !== 'race';
  byId<HTMLSelectElement>('raceA').value = ui.race[0];
  byId<HTMLSelectElement>('raceB').value = ui.race[1];
  const g = doc.graph,
    ids = g.sortedIds();
  selStart.innerHTML =
    ids.map(id => `<option value="${id}">${g.label(id)}</option>`).join('') || '<option value="">—</option>';
  selStart.value = String(ui.start ?? '');
  selTarget.innerHTML =
    '<option value="">None</option>' +
    ids
      .filter(id => id !== ui.start)
      .map(id => `<option value="${id}">${g.label(id)}</option>`)
      .join('');
  selTarget.value = String(ui.target ?? '');
  selTarget.classList.toggle('has', ui.target != null);
  selPreset.value = ui.preset;
  const random = ui.preset !== 'custom' && !!PRESETS[ui.preset].random;
  byId('bShuffle').hidden = !random;
  byId('sel3').classList.toggle('shuffle', random);
  document
    .querySelectorAll<HTMLButtonElement>('#toolRow .btn')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === ui.tool)));
  byId('score').hidden = ui.mode !== 'race';
  byId('about').hidden = ui.mode === 'race';
  if (ui.mode !== 'race') renderAbout(byId('about'), ui.algo);
  byId('legend').innerHTML = legendHTML(ui.mode, ui.algo, true);
  byId('helpLegend').innerHTML = legendHTML(ui.mode, ui.algo, false);
}

byId('algoSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  sound.ensure();
  if (b.dataset.a === 'race') ui.mode = 'race';
  else {
    ui.mode = 'single';
    ui.algo = b.dataset.a as AlgoKey;
  }
  rebuild({ autoplay: true });
});
(['raceA', 'raceB'] as const).forEach((id, j) =>
  byId<HTMLSelectElement>(id).addEventListener('change', e => {
    const v = (e.target as HTMLSelectElement).value as AlgoKey;
    if (v === ui.race[1 - j]) ui.race[1 - j] = ui.race[j]; // swap rather than race an algorithm against itself
    ui.race[j] = v;
    rebuild({ autoplay: true });
  }),
);
selStart.addEventListener('change', () => {
  ui.start = Number(selStart.value);
  rebuild({ autoplay: true });
});
selTarget.addEventListener('change', () => {
  ui.target = selTarget.value === '' ? null : Number(selTarget.value);
  rebuild({ autoplay: true });
});
selPreset.addEventListener('change', () => {
  if (selPreset.value !== 'custom') loadPreset(selPreset.value as PresetKey);
});
byId('bShuffle').addEventListener('click', () => {
  if (ui.preset !== 'custom') loadPreset(ui.preset, { seed: 1 + Math.floor(Math.random() * 1e6) });
});
byId('toolRow').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  ui.tool = b.dataset.t as Tool;
  ui.pendingEdge = null;
  syncControls();
  hint();
});
byId<HTMLInputElement>('optDirected').addEventListener('change', e => {
  const on = (e.target as HTMLInputElement).checked;
  const merged = doc.graph.setDirected(on);
  markCustom();
  rebuild();
  hint(
    on
      ? 'Strings now point from the first knot you tied to the second.'
      : merged
        ? `${plural(merged, 'pair')} of strings joined the same knots; each kept its cheaper weight.`
        : 'Strings now work both ways.',
  );
});

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: { theta: -0.16, phi: PHI_FLAT },
  frameButton: byId('bFrame'),
  lockZ: false,
  minDist: 8,
  maxDist: 120,
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
/** Panels live in the right column on a desk and in the sheet on a phone. */
function placePanels(): void {
  const phone = isPhone();
  for (const id of ['score', 'ds', 'about']) {
    const el = byId(id),
      home = phone ? dock : side;
    if (el.parentElement !== home) home.appendChild(el);
  }
  measureFree();
}

/* ---------------- inspector, editor, keys ---------------- */

const inspector = createInspector({
  ui,
  graph: () => doc.graph,
  current: j => {
    const prog = player.prog,
      ctx = prog.nets[j] ?? null;
    const fi = ctx ? fineIndex(prog, ctx, player.idx) : -1;
    return { ctx, step: ctx && fi >= 0 ? ctx.steps[fi] : null };
  },
  onLayout: measureFree,
  onStartHere: id => {
    ui.start = id;
    if (ui.target === ui.start) ui.target = null;
    rebuild({ autoplay: true });
  },
  onToggleTarget: id => {
    ui.target = ui.target === id ? null : id;
    rebuild({ autoplay: ui.target != null });
  },
  onDelete: id => editor.deleteNode(id),
});
const editor = createEditor({
  canvas: byId<HTMLCanvasElement>('stage'),
  scene,
  framer,
  ui,
  doc,
  inspector,
  program: () => player.prog,
  isRunning: () => player.idx >= 0 || !!player.tr,
  currentPose: () => player.pose(),
  rebuild,
  markCustom,
  hint,
});

bindSoundToggle(byId('bSound'));
byId('bFrame').addEventListener('click', () => framer.reset());
const help = bindHelp();
bindKeys({
  player,
  isTyping: e => e.target === byId('wval'),
  onEscape: () => {
    if (help.isOpen()) help.close();
    else if (ui.wEdge != null) editor.closeWeight();
    else if (ui.pendingEdge) {
      ui.pendingEdge = null;
      hint();
    } else if (ui.selected != null) inspector.close();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
addEventListener('keydown', e => {
  const tag = (e.target as HTMLElement | null)?.tagName ?? '';
  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    ui.selected != null &&
    !['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)
  ) {
    e.preventDefault();
    const id = ui.selected;
    inspector.close();
    editor.deleteNode(id);
  }
});
mountNav({ current: 'graphs' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);

/* ---------------- start: the textbook net drops onto its plinth ---------------- */

doc.graph = PRESETS.textbook.make();
ui.start = doc.graph.byLabel('A');
ui.target = doc.graph.byLabel('H');
placePanels();
{
  const prog = makeProgram(specFor());
  prog.intro = {
    head: 'A net of strings on a plinth.',
    body: 'Each knot is a node and each string an edge, as long as its weight. Press play to watch Dijkstra lift the net from A until the cheapest route to H pulls taut, or pick BFS or DFS.',
  };
  player.load(prog, { autoplay: false });
  player.intro(dropIn(prog.startPose, REDUCED));
  syncControls();
  showStep(-1);
  refreshAfterStep();
  hint();
}
measureFree();
framer.place(30);

/* ---------------- the frame loop ---------------- */

let liftCam = 0;
const view = {
  get gen() {
    return doc.gen;
  },
  get selected() {
    return ui.selected;
  },
  get pending() {
    return ui.pendingEdge;
  },
  get pointer() {
    return ui.pointer;
  },
  get drag() {
    return ui.drag;
  },
  get hotEdge() {
    return ui.wEdge;
  },
  weightsFor: (algo: AlgoKey) => algo === 'dijkstra' || ui.tool === 'edge' || ui.wEdge != null,
  get clock() {
    return clock;
  },
};

function frame(dt: number): void {
  clock += dt;
  player.tick(dt);
  const P = player.pose();
  scene.draw(P, dt, view);
  // the camera drops to watch a lift, and leans in on the payoff
  let maxH = 0;
  for (const net of P.nets) for (const n of net.nodes.values()) if (n.s > 0.1) maxH = Math.max(maxH, n.h);
  liftCam += (clamp01(maxH / 2.2) - liftCam) * (1 - Math.exp(-dt * 2));
  let focus = null;
  if (P.focus) {
    const w = scene.nodeWorld.get(`${P.focus.j}|${P.focus.node}`);
    if (w) focus = { x: w.x, y: w.y, z: w.z, w: P.focus.w, zoom: 0.2 };
  }
  controls.update();
  framer.update(dt, scene.frameBox(P), focus, { phi: lerp(PHI_FLAT, PHI_LIFT, liftCam), rate: 1.3 });
  camera.lookAt(controls.target);
  scene.fitLights(P);
  const c = P.callout,
    w = c ? scene.nodeWorld.get(`${c.j}|${c.node}`) : undefined;
  placeCallout(
    c && w ? { x: w.x, y: w.y + 0.15, z: w.z, off: w.r + 0.35, side: 'r', text: c.text, tone: c.tone, a: c.a } : null,
  );
  editor.placeWeight();
  scene.render();
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  frame(dt);
});

exposeTestHooks('__graph', {
  camera,
  renderer,
  player,
  ui,
  PRESETS,
  get graph() {
    return doc.graph;
  },
  rebuild,
  loadPreset,
  nodeScreen,
  /** Where a point on the plinth floor (y = 0) appears on screen. */
  floorScreen: (x: number, z: number) => scene.toScreen(x, 0, z),
  currentPose: () => player.pose(),
  setMode(m: AlgoKey | 'race', race?: [AlgoKey, AlgoKey]) {
    if (m === 'race') {
      ui.mode = 'race';
      if (race) ui.race = race;
    } else {
      ui.mode = 'single';
      ui.algo = m;
    }
    rebuild({ autoplay: false, catchDur: 0 });
  },
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
      if (k % 6 === 0) scene.draw(player.pose(), 0.1, view);
    }
  },
  /** Let the camera finish easing at once. */
  settle() {
    for (let k = 0; k < 40; k++) {
      const P = player.pose();
      scene.draw(P, 0, view);
      camera.updateMatrixWorld();
      framer.update(0.25, scene.frameBox(P), null, { phi: lerp(PHI_FLAT, PHI_LIFT, liftCam), rate: 1.3 });
      camera.lookAt(controls.target);
    }
  },
  /** JavaScript cost of one frame in ms: pose, drawing lists, framing (no GPU). */
  bench(n = 60) {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const P = player.pose();
      scene.draw(P, 1 / 60, view);
      scene.frameBox(P);
      scene.fitLights(P);
    }
    return (performance.now() - t0) / n;
  },
});
