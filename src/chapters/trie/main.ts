// Prefix Sunburst, No. 7: a trie as a sunburst of letters, one ring per letter,
// with words that begin alike sharing a ray. This file wires the pieces together:
// the recordings, the player, the scene, the panels and the controls.

import { bindHelp, bindKeys, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import type { Recording, Step } from './diagram';
import { VIEWS, type Angle, type View } from './layout';
import { HOLD, RATE, assemble, buildTransition, morph } from './motion';
import * as ops from './ops';
import {
  CodeCard,
  chipsHTML,
  inspect,
  legendHTML,
  listHTML,
  memoryHTML,
  memoryOf,
  statsLine,
  stepsSVG,
  whenHTML,
} from './panels';
import { makeProgram, restAt, type Pose, type TrieProgram } from './poses';
import { SunburstScene } from './scene';
import { playStepSound } from './sound';
import { EXAMPLE, createUiState, freshDicts } from './state';
import { clean } from './trie';
import { MAX_LEN, SIZES, type Size } from './words';

const ui = createUiState();
const canvas = byId<HTMLCanvasElement>('stage');
const scene = new SunburstScene(canvas);
const { camera, controls, renderer } = scene.stage;
const dock = byId('dock'),
  masthead = byId('masthead'),
  side = byId('side');
const wordBox = byId<HTMLInputElement>('word');
let clock = 0;

/* ---------------- the player ---------------- */

const player: Player<Step, Pose, TrieProgram> = new Player<Step, Pose, TrieProgram>(
  {
    build: buildTransition,
    morph,
    holdFor: st => readingHold(st, HOLD, RATE, REDUCED),
    onShow: i => showStep(i),
    onStep: (st, i, tr) => playStepSound(st, i > 0 ? player.prog.steps[i - 1] : null, tr.dur, player.speed),
    onBack: () => {
      if (sound.ready()) sound.tink(660, 0.06, 0, 0.2);
    },
    onRefresh: () => refreshAfterStep(),
    onUI: () => transport.updatePlayUI(),
    onLoad: () => transport.build(),
    onGesture: () => sound.ensure(),
  },
  makeProgram(ops.zip(ui.dicts[ui.size], ui.size)),
);
const transport = mountTransport(byId('transport'), player, {
  onGesture: () => sound.ensure(),
  tickClass: s =>
    s.kind === 'found' || s.kind === 'mark' || s.kind === 'suggest' || s.kind === 'zip'
      ? 'key'
      : s.kind === 'miss' || s.kind === 'prune' || s.kind === 'none'
        ? 'rot'
        : '',
});
const bar = document.querySelector<HTMLElement>('#transport .bar');

/** Play a recording, easing from whatever is on screen to its start. */
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
  ui.op = rec.op;
  afterLoad();
}

/** Load a recording already part-way through: rest at step i, then play on from there. */
function loadAt(rec: Recording, i: number, autoplay: boolean): void {
  const P0 = player.pose();
  const prog = makeProgram(rec);
  player.load(prog, { autoplay, catchDur: 0 });
  player.idx = i;
  player.tr = { tr: morph(P0, restAt(prog, i), 0.3), i, dir: 1, t: 0, after: () => (player.hold = 0) };
  ui.op = rec.op;
  afterLoad();
  showStep(i);
}

function afterLoad(): void {
  framer.home = VIEWS[angleFor()];
  closeInspector(true);
  showStep(player.idx);
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
    chips: st ? chipsHTML(st.chips) : '',
  });
  transport.mark(i);
  const code = st
    ? st.code
    : rec.op === 'zip'
      ? 'node'
      : rec.op === 'type'
        ? 'complete'
        : rec.op === 'remove'
          ? 'remove'
          : rec.op === 'insert'
            ? 'insert'
            : rec.op === 'spell'
              ? 'spell'
              : 'search';
  codeCard.show(code, st ? st.line : -1);
  const d = ui.dicts[ui.size];
  // the words found: the latest list up to this step
  let list = rec.intro.list;
  for (let k = 0; k <= i; k++) if (prog.steps[k].list) list = prog.steps[k].list;
  if (i >= 0 && !st?.list && st?.kind === 'walk' && rec.op !== 'type') list = null;
  byId('listBody').innerHTML = listHTML(list, d.words.length);
  byId('listTitle').textContent =
    list?.kind === 'suggest' ? 'One edit away' : list?.kind === 'found' ? 'Found' : 'Words it could become';
  const word = rec.word || EXAMPLE.search;
  const L = Math.max(1, Math.min(MAX_LEN, word.length));
  const sig = `${ui.size}:${word}:${d.words.length}:${ui.view}`;
  if (sig !== panelSig) {
    panelSig = sig;
    byId('stepsChart').innerHTML = stepsSVG(L, word, SIZES, ui.size);
    byId('stepsWord').textContent = word;
    byId('memBody').innerHTML = memoryHTML(memoryOf(d));
    byId('costTable').innerHTML = whenHTML();
  }
}

function refreshAfterStep(): void {
  transport.updatePlayUI();
  byId('mstats').textContent = statsLine(ui.dicts[ui.size]);
  updateInspector();
}

/* ---------------- inspector: a clicked node ---------------- */

function updateInspector(): void {
  const sel = ui.selected;
  if (!sel) return;
  const F = player.pose().fans.find(f => f.key === sel.fan);
  const v = F ? inspect(F.dict, sel.id) : null;
  if (!v) return closeInspector();
  byId('insDisc').innerHTML = v.disc;
  byId('insState').innerHTML = `<b>${v.title}</b><span>${v.sub}</span>`;
  byId('insGrid').innerHTML = v.cells.map(([k, val]) => `<div><div>${k}</div><div>${val}</div></div>`).join('');
  byId('insNote').textContent = v.note;
}
function select(sel: { fan: string; id: string }): void {
  ui.selected = sel;
  byId('inspector').hidden = false;
  document.body.classList.add('inspecting');
  updateInspector();
  if (!byId('inspector').hidden) measureFree();
}
function closeInspector(quiet = false): void {
  ui.selected = null;
  byId('inspector').hidden = true;
  document.body.classList.remove('inspecting');
  if (!quiet) measureFree();
}
byId('insClose').addEventListener('click', () => closeInspector());

/* ---------------- the word box: typing plays the trie ---------------- */

function setWord(w: string): void {
  ui.word = clean(w).slice(0, MAX_LEN);
  if (wordBox.value !== ui.word) wordBox.value = ui.word;
}

/** The word changed as it was typed: follow the new letters, or step back for deleted ones. */
function typed(): void {
  const prev = player.prog.rec.op === 'type' ? player.prog.rec.word : '';
  const next = ui.word;
  const d = ui.dicts[ui.size];
  sound.ensure();
  if (!next) {
    load(ops.still(d, ui.size), { catchDur: 0.5 });
    return;
  }
  const rec = ops.typeAhead(d, ui.size, next);
  let common = 0;
  while (common < Math.min(prev.length, next.length) && prev[common] === next[common]) common++;
  if (common === 0) load(rec, { catchDur: 0.45 });
  else if (common < next.length) loadAt(rec, common - 1, true);
  else loadAt(rec, next.length - 1, false);
}

wordBox.addEventListener('input', () => {
  setWord(wordBox.value);
  typed();
});
wordBox.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run('search');
  } else if (e.key === 'Escape') wordBox.blur();
});
// just start typing: a letter pressed anywhere else goes into the word box
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || !/^[a-zA-Z]$/.test(e.key)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (!byId('help').hidden) return;
  e.preventDefault();
  wordBox.focus();
  if (ui.word.length >= MAX_LEN) return;
  setWord(ui.word + e.key);
  typed();
});

/* ---------------- controls ---------------- */

type Action = 'search' | 'insert' | 'remove' | 'spell' | 'three';

function run(op: Action): void {
  sound.ensure();
  if (!ui.word) setWord(EXAMPLE[op]);
  const rec = ops.record(op, ui.dicts, ui.size, ui.word);
  // inserts and deletes change the words for good: keep what the last step holds
  if (op === 'insert' || op === 'remove') {
    const last = rec.steps[rec.steps.length - 1];
    if (last) ui.dicts[ui.size] = last.fans[0].dict;
  }
  load(rec);
}

byId('bSearch').addEventListener('click', () => run('search'));
byId('bInsert').addEventListener('click', () => run('insert'));
byId('bDelete').addEventListener('click', () => run('remove'));
byId('bSpell').addEventListener('click', () => run('spell'));
byId('bThree').addEventListener('click', () => {
  if (ui.op === 'three') {
    load(ui.word ? ops.typeAhead(ui.dicts[ui.size], ui.size, ui.word) : ops.still(ui.dicts[ui.size], ui.size));
    return;
  }
  run('three');
});
byId('bZip').addEventListener('click', () => {
  sound.ensure();
  load(ops.zip(ui.dicts[ui.size], ui.size));
});
byId('sizeSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  const n = Number(b?.dataset.n) as Size;
  if (!n || (n === ui.size && ui.op !== 'three')) return;
  setSize(n);
});
function setSize(n: Size): void {
  sound.ensure();
  ui.size = n;
  const d = ui.dicts[n];
  load(ui.word ? ops.typeAhead(d, n, ui.word) : ops.still(d, n), { catchDur: 1.1 });
  if (ui.word) {
    // show the prefix at once rather than replaying it
    const last = player.prog.steps.length - 1;
    if (last >= 0) {
      player.playing = false;
      player.seek(last);
    }
  }
}
byId('viewSeg').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (b?.dataset.v) setView(b.dataset.v as View);
});
/** The camera's angle: the view chosen, squared up when three sunbursts share the plinth. */
const angleFor = (): Angle => (ui.view === 'letters' && player.prog.rec.op === 'three' ? 'three' : ui.view);
function setView(v: View): void {
  ui.view = v;
  document.body.classList.toggle('mem', v === 'memory');
  framer.home = VIEWS[angleFor()];
  framer.reset();
  syncControls();
  panelSig = '';
  showStep(player.idx);
  placePanels();
}
byId('listBody').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-w]');
  if (!b?.dataset.w) return;
  setWord(b.dataset.w);
  run('search');
});

byId('bReset').addEventListener('click', () => reset());
function reset(): void {
  ui.dicts = freshDicts();
  ui.size = 20;
  setWord('');
  load(ops.zip(ui.dicts[20], 20), { autoplay: false, catchDur: 0.8 });
  setView('letters');
}

function syncControls(): void {
  const press = (sel: string, on: (b: HTMLButtonElement) => boolean) =>
    document.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.setAttribute('aria-pressed', String(on(b))));
  const three = ui.op === 'three';
  press('#sizeSeg button', b => !three && Number(b.dataset.n) === ui.size);
  press('#viewSeg button', b => b.dataset.v === ui.view);
  byId('bThree').setAttribute('aria-pressed', String(three));
  for (const [id, op] of [
    ['bSearch', 'search'],
    ['bInsert', 'insert'],
    ['bDelete', 'remove'],
    ['bSpell', 'spell'],
  ] as const)
    byId(id).setAttribute('aria-pressed', String(ui.op === op));
}

/* ---------------- camera ---------------- */

const framer = createFramer({
  camera,
  controls,
  home: VIEWS.letters,
  frameButton: byId('bFrame'),
  lockZ: false,
  minDist: 5,
  maxDist: 200,
});
controls.maxDistance = 200;
camera.far = 800;
const view = {
  get selected() {
    return ui.selected;
  },
  get clock() {
    return clock;
  },
  /** How far the rows of slots have unfolded. */
  mem: 0,
};

/** Ease the rows of slots in and out with the view. */
function unfold(dt: number): void {
  const k = REDUCED ? 1 : 1 - Math.exp(-dt * 2.6);
  view.mem += ((ui.view === 'memory' ? 1 : 0) - view.mem) * k;
  if (Math.abs(view.mem - (ui.view === 'memory' ? 1 : 0)) < 0.002) view.mem = ui.view === 'memory' ? 1 : 0;
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
  for (const id of ['words', 'steps', 'mem', 'code', 'cost']) {
    const el = byId(id),
      home = phone ? dock : side;
    if (el.parentElement !== home) home.appendChild(el);
  }
  measureFree();
}

/* ---------------- picking: click a node to inspect it ---------------- */

const pointers = new Set<number>();
let down: { x: number; y: number; t: number } | null = null;
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
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit) select(hit);
    else if (ui.selected) closeInspector();
  }
  down = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', () => framer.manual(), { passive: true });
canvas.addEventListener('contextmenu', e => e.preventDefault());
controls.addEventListener('start', () => framer.turned());
let hoverAt = 0;
canvas.addEventListener('pointermove', e => {
  if (pointers.size || isPhone() || e.timeStamp - hoverAt < 60) return;
  hoverAt = e.timeStamp;
  canvas.style.cursor = scene.pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
});

/* ---------------- keys, sound, navigation ---------------- */

bindSoundToggle(byId('bSound'));
byId('bFrame').addEventListener('click', () => framer.reset());
const help = bindHelp();
bindKeys({
  player,
  isTyping: e => e.target === wordBox,
  onEscape: (_e, typing) => {
    if (typing) wordBox.blur();
    else if (help.isOpen()) help.close();
    else if (ui.selected) closeInspector();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
mountNav({ current: 'trie' });
new ResizeObserver(measureFree).observe(dock);
new ResizeObserver(measureFree).observe(side);
scene.stage.onResize(placePanels);
byId('legend').innerHTML = legendHTML(true);
byId('helpLegend').innerHTML = legendHTML(false);

/* ---------------- start: twenty words, written out, then zipped together ---------------- */

syncControls();
placePanels();
load(ops.zip(ui.dicts[20], 20), { autoplay: true, catchDur: 0, quiet: true });
player.intro(assemble(player.prog.startPose, REDUCED));
player.hold = REDUCED ? 0.6 : 1.4;
measureFree();
framer.place(28);

/* ---------------- the frame loop ---------------- */

/** Frame where the step on screen will come to rest, so the camera does not chase every node. */
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
  const cls = c.tone === 'red' ? 'red' : c.tone === 'cobalt' ? 'cobalt' : '';
  if (callout.className !== cls) callout.className = cls;
  callout.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
  callout.style.opacity = c.al.toFixed(3);
}

function frame(dt: number): void {
  clock += dt;
  player.tick(dt);
  unfold(dt);
  const P = player.pose();
  scene.draw(P, view);
  controls.update();
  const FP = framePose();
  framer.update(dt, scene.frameBox(FP, view.mem), scene.focusOf(FP), { ...VIEWS[angleFor()], rate: 1.4 });
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

exposeTestHooks('__trie', {
  camera,
  renderer,
  player,
  ui,
  /** Type into the word box, as a person would. */
  type(text: string) {
    setWord(text);
    typed();
  },
  /** Run one of the operations on a word. */
  run(op: Action, word: string) {
    setWord(word);
    run(op);
  },
  setSize: (n: Size) => setSize(n),
  setView: (v: View) => setView(v),
  zip: () => load(ops.zip(ui.dicts[ui.size], ui.size)),
  currentPose: () => player.pose(),
  nodeScreen: (fan: string, id: string) => scene.nodeScreen(fan, id),
  seek: (i: number) => player.seek(i),
  stepBy: (d: 1 | -1) => player.stepBy(d),
  togglePlay: () => player.togglePlay(),
  setSpeed: (s: number) => transport.setSpeed(s),
  freezeAt: (i: number, t: number) => player.freezeAt(i, t),
  unfreeze() {
    player.freeze = false;
  },
  counts: () => scene.counts(),
  view,
  /** Run the animation clock forward without waiting for frames. */
  advance(sec: number) {
    for (let k = 0; k < sec * 60; k++) {
      player.tick(1 / 60);
      unfold(1 / 60);
      if (k % 6 === 0) scene.draw(player.pose(), view);
    }
  },
  /** Let the camera finish easing at once. */
  settle() {
    for (let k = 0; k < 40; k++) {
      unfold(0.25);
      scene.draw(player.pose(), view);
      camera.updateMatrixWorld();
      const FP = framePose();
      framer.update(0.25, scene.frameBox(FP, view.mem), scene.focusOf(FP), { ...VIEWS[angleFor()], rate: 1.4 });
      camera.lookAt(controls.target);
    }
  },
  /** JavaScript cost of one frame in ms: pose, drawing lists, framing (no GPU). */
  bench(n = 60) {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const P = player.pose();
      scene.draw(P, view);
      scene.frameBox(P, view.mem);
      scene.fitLights();
    }
    return (performance.now() - t0) / n;
  },
});
