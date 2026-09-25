// AVL Mobile, No. 1: a self-balancing binary search tree hung as a mobile.
// This file wires the pieces together: the tree, the player, the scene, the
// narration, the inspector and the controls.

import * as THREE from 'three';
import { bindHelp, bindKeys, calloutPlacer, mountTransport, placard } from '../../core/controls';
import { byId } from '../../core/dom';
import { clamp01, plural } from '../../core/math';
import { Player, readingHold } from '../../core/player';
import { REDUCED, isPhone } from '../../core/prefs';
import { bindSoundToggle, sound } from '../../core/sound';
import { createFramer } from '../../core/stage';
import { exposeTestHooks } from '../../core/test-hooks';
import { mountNav } from '../../site/nav';
import {
  AVL,
  CASE_NOTE,
  DEMO_INTRO,
  maxAvlHeight,
  opClear,
  opDelete,
  opDemo,
  opInsert,
  opSearch,
  type AvlStep,
  type Kase,
  type Snap,
} from './engine';
import { MAX_VALUES, ROW, layoutSnap } from './layout';
import { inspect, legendHTML } from './panels';
import { buildTransition, lowering, morph, staticPose, type AvlPose, type AvlProgram } from './poses';
import { AvlScene } from './scene';
import { playStepSound } from './sound';

const canvas = byId<HTMLCanvasElement>('stage');
const scene = new AvlScene(canvas);
const { camera, controls, renderer } = scene.stage;
const engine = new AVL();
const ui = { badges: true, selected: null as number | null };
let clock = 0;

/* ---------------- camera ---------------- */

const dock = byId('dock'),
  masthead = byId('masthead');
const framer = createFramer({ camera, controls, home: { theta: -0.16, phi: 1.49 }, frameButton: byId('bFrame') });
let bar: HTMLElement | null = null;
function measureFree(): void {
  const W = innerWidth,
    H = innerHeight;
  const ins = byId('inspector');
  if (isPhone()) {
    const top = ins.hidden ? masthead.getBoundingClientRect().bottom + 10 : ins.getBoundingClientRect().bottom + 18;
    const bot = dock.getBoundingClientRect().top - 8;
    framer.free = { l: 12, r: W - 12, t: top, b: Math.max(top + 120, bot) };
  } else {
    const d = dock.getBoundingClientRect(),
      b = bar ? bar.getBoundingClientRect().top : H - 100;
    const r = ins.hidden ? W - 24 : ins.getBoundingClientRect().left - 20;
    framer.free = { l: d.right + 24, r: Math.max(d.right + 300, r), t: 80, b: Math.max(200, b - 16) };
  }
}

/* ---------------- the player ---------------- */

const HOLD = {
  compare: 0.12,
  descend: 0.05,
  start: 0.25,
  update: 0.25,
  place: 0.35,
  imbalance: 0.6,
  rotate: 0.55,
  done: 0.8,
  found: 0.5,
  missing: 0.4,
  duplicate: 0.4,
  remove: 0.4,
  replace: 0.5,
  succ: 0.2,
  clear: 0.4,
};
const RATE = { compare: 0.005, descend: 0.004, update: 0.006 };

const INTRO = {
  head: 'An AVL tree, hung as a mobile.',
  body: 'Each disc is a value, and each arm tilts toward its taller side. Red means a node must rotate. Press Demo to see all four rotation cases, or insert a value of your own.',
};
for (const v of [41, 20, 65, 11, 29, 50, 91, 26, 33, 72]) engine.quickInsert(v);
const firstSnap = engine.snap();

const player: Player<AvlStep, AvlPose, AvlProgram> = new Player<AvlStep, AvlPose, AvlProgram>(
  {
    build: buildTransition,
    morph,
    holdFor: st => readingHold(st, HOLD, RATE, REDUCED),
    onShow: i => showStep(i),
    onStep: (st, _i, tr) => {
      playStepSound(st, tr.dur, player.speed);
      if (st.kind === 'done') scene.kickAll(0.06);
    },
    onBack: () => {
      if (sound.ready()) sound.tink(660, 0.06, 0, 0.2);
    },
    onRefresh: () => refreshAfterStep(),
    onUI: () => transport.updatePlayUI(),
    onLoad: () => transport.build(),
    onGesture: () => sound.ensure(),
  },
  { title: 'AVL Mobile', steps: [], startSnap: firstSnap, startPose: staticPose(firstSnap), intro: INTRO },
);
const transport = mountTransport(byId('transport'), player, {
  onGesture: () => sound.ensure(),
  tickClass: (s, k, steps) => (s.kind === 'rotate' ? 'rot' : '') + (k > 0 && steps[k - 1].op !== s.op ? ' gap' : ''),
});
bar = document.querySelector<HTMLElement>('#transport .bar');
new ResizeObserver(measureFree).observe(dock);

function launch(title: string, stepsFn: () => AvlStep[], intro?: { head: string; body: string }, demo = false): void {
  const startSnap = engine.snap();
  const steps = stepsFn();
  player.load({ title, steps, startSnap, startPose: staticPose(startSnap), intro, demo });
  sound.ensure();
}

/* ---------------- narration and inspector ---------------- */

const plac = placard();
const placeCallout = calloutPlacer(camera);
const els = { cx: byId('cxline'), mstats: byId('mstats'), err: byId('err'), val: byId<HTMLInputElement>('val') };

const currentSnap = (): Snap => (player.idx >= 0 ? player.prog.steps[player.idx].snap : player.prog.startSnap);

function showStep(i: number): void {
  const prog = player.prog,
    st = i >= 0 ? prog.steps[i] : null;
  // rotation cases met so far in this run
  const seen: Kase[] = [];
  for (let k = 0; k <= i; k++) {
    const s = prog.steps[k];
    if (s.kind === 'rotate' && s.kase && !seen.includes(s.kase)) seen.push(s.kase);
  }
  let chips = '';
  if (st && st.chip && (st.kind === 'imbalance' || st.kind === 'rotate'))
    chips = `<span class="chip hot">${st.chip}</span><span class="chip-note">${CASE_NOTE[st.chip]}</span>`;
  else if (prog.demo)
    chips =
      (['LL', 'RR', 'RL', 'LR'] as const)
        .map(k => `<span class="chip${seen.includes(k) ? ' done' : ''}">${k}</span>`)
        .join('') + `<span class="chip-note">${seen.length} of 4 rotation cases</span>`;
  plac.set({
    op: st ? st.op : prog.title,
    stepno: prog.steps.length ? `Step ${i + 1} / ${prog.steps.length}` : '',
    head: st ? st.head : prog.intro ? prog.intro.head : `${prog.title}.`,
    body: st ? st.body : prog.intro ? prog.intro.body : '',
    chips,
  });
  transport.mark(i);
}
function refreshAfterStep(): void {
  transport.updatePlayUI();
  const snap = currentSnap();
  const n = Object.keys(snap.n).length,
    h = snap.root != null ? snap.n[snap.root].h : 0;
  els.cx.textContent =
    n === 0
      ? 'The wall is empty. Each insert, delete or search walks one path from the top, so the work grows with the height.'
      : `${plural(n, 'value')}, height ${h}. With ${n} values an AVL tree is never taller than ${maxAvlHeight(n)}; an unbalanced search tree could be ${n} tall.`;
  els.mstats.textContent = n ? `${plural(n, 'value')} · height ${h}` : 'empty';
  updateInspector(snap);
}

function updateInspector(snap: Snap): void {
  if (ui.selected == null) return;
  const v = inspect(snap, ui.selected);
  if (!v) return closeInspector();
  byId('insDisc').innerHTML = v.disc;
  byId('insState').innerHTML = v.state;
  byId('insH').textContent = v.height;
  byId('insBf').textContent = v.balance;
  byId('insSize').textContent = v.size;
  byId('insDepth').textContent = v.depth;
  byId('insNote').textContent = v.note;
}
function select(id: number): void {
  ui.selected = id;
  byId('inspector').hidden = false;
  document.body.classList.add('inspecting');
  updateInspector(currentSnap());
  measureFree();
}
function closeInspector(): void {
  ui.selected = null;
  byId('inspector').hidden = true;
  document.body.classList.remove('inspecting');
  measureFree();
}

byId('legend').innerHTML = legendHTML(true);
byId('helpLegend').innerHTML = legendHTML(false);

/* ---------------- input ---------------- */

function showErr(msg: string): void {
  els.err.textContent = msg;
  els.val.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
/** The typed value, or null (with a message) if it is not usable. */
function parseValue(): number | null {
  const raw = els.val.value.trim();
  let msg: string;
  if (!raw) msg = 'Type a value first, from 0 to 999.';
  else if (!/^[+-]?\d+$/.test(raw)) msg = `“${raw.slice(0, 12)}” is not a whole number. Try something like 42.`;
  else {
    const v = parseInt(raw, 10);
    if (v < 0 || v > 999) msg = 'Use a value from 0 to 999 so it fits on a disc.';
    else {
      showErr('');
      return v;
    }
  }
  showErr(msg);
  return null;
}
function afterLaunch(): void {
  if (isPhone()) els.val.blur();
  else els.val.select();
}
const FULL = `The mobile holds ${MAX_VALUES} values. Delete some or clear the wall first.`;
function doInsert(v: number | null): void {
  if (v == null) return;
  if (!engine.has(v) && engine.count >= MAX_VALUES) return showErr(FULL);
  launch(`Insert ${v}`, () => opInsert(engine, v));
  afterLaunch();
}
byId('opform').addEventListener('submit', e => {
  e.preventDefault();
  doInsert(parseValue());
});
byId('bSearch').addEventListener('click', () => {
  const v = parseValue();
  if (v == null) return;
  launch(`Search ${v}`, () => opSearch(engine, v));
  afterLaunch();
});
byId('bDelete').addEventListener('click', () => {
  const v = parseValue();
  if (v == null) return;
  launch(`Delete ${v}`, () => opDelete(engine, v));
  afterLaunch();
});
byId('bRandom').addEventListener('click', () => {
  if (engine.count >= MAX_VALUES) return showErr(FULL);
  const used = new Set(Object.values(engine.n).map(o => o.v));
  let choices: number[] = [];
  for (let v = 1; v <= 99; v++) if (!used.has(v)) choices.push(v);
  if (!choices.length) choices = Array.from({ length: 900 }, (_, k) => k + 100).filter(v => !used.has(v));
  const v = choices[Math.floor(Math.random() * choices.length)];
  els.val.value = String(v);
  showErr('');
  launch(`Insert ${v}`, () => opInsert(engine, v));
});
byId('bDemo').addEventListener('click', () => {
  showErr('');
  launch('Demo · all four rotations', () => opDemo(engine), DEMO_INTRO, true);
});
byId('bClear').addEventListener('click', () => {
  if (engine.count === 0) return showErr('The wall is already empty.');
  showErr('');
  launch('Clear', () => opClear(engine));
});
bindSoundToggle(byId('bSound'));
byId('bFrame').addEventListener('click', () => framer.reset());
const help = bindHelp();
byId<HTMLInputElement>('optBadges').addEventListener('change', e => {
  ui.badges = (e.target as HTMLInputElement).checked;
});
byId('insClose').addEventListener('click', closeInspector);
bindKeys({
  player,
  isTyping: e => e.target === els.val,
  onEscape: (_e, typing) => {
    if (help.isOpen()) help.close();
    else if (ui.selected != null) closeInspector();
    else if (typing) els.val.blur();
  },
  onHelp: help.open,
  onGesture: () => sound.ensure(),
});
mountNav({ current: 'avl' });

/* ---------------- picking and camera takeover ---------------- */

const ray = new THREE.Raycaster(),
  ndc = new THREE.Vector2();
const pointers = new Set<number>();
let down: { x: number; y: number; t: number } | null = null;
const hitDisc = (e: { clientX: number; clientY: number }) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(
    scene.pickables.filter(m => m.parent?.visible),
    false,
  )[0];
};
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
    e.timeStamp - down.t < 600
  ) {
    const hit = hitDisc(e);
    if (hit) select(hit.object.userData.id as number);
    else if (ui.selected != null) closeInspector();
  }
  down = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', () => framer.manual(), { passive: true });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => {
  if (pointers.size || isPhone()) return;
  canvas.style.cursor = hitDisc(e) ? 'pointer' : 'grab';
});
scene.stage.onResize(measureFree);

/* ---------------- start: a small tree is lowered onto the wall ---------------- */

player.intro(lowering(player.prog.startPose));
transport.build();
showStep(-1);
refreshAfterStep();
measureFree();
framer.place(34);

const view = {
  get speed() {
    return player.speed;
  },
  get badges() {
    return ui.badges;
  },
  get selected() {
    return ui.selected;
  },
  get clock() {
    return clock;
  },
  isLive: (id: number) => !!engine.n[id],
};

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  clock += dt;
  player.tick(dt);
  const P = player.pose();
  scene.draw(P, dt, view);
  // lean in on a rotation
  let focusRot = null;
  const T = player.tr;
  if (T && T.i >= 0 && player.prog.steps[T.i] && player.prog.steps[T.i].kind === 'rotate' && P.slot) {
    focusRot = { x: P.slot.x, y: P.slot.y - ROW / 2, w: Math.sin(Math.PI * clamp01(T.t)) };
  }
  controls.update();
  framer.update(dt, scene.frameBox(P), focusRot);
  camera.lookAt(controls.target);
  scene.fitLights(P);
  placeCallout(P.callout);
  scene.render();
});

exposeTestHooks('__avl', {
  camera,
  Vec3: THREE.Vector3,
  AVL,
  opInsert,
  opDelete,
  opSearch,
  opDemo,
  engine,
  player,
  layoutSnap,
  visuals: scene.visuals,
  launch,
  currentPose: () => player.pose(),
  renderer,
  setSpeed: (s: number) => transport.setSpeed(s),
  seek: (i: number) => player.seek(i),
  stepBy: (d: 1 | -1) => player.stepBy(d),
  togglePlay: () => player.togglePlay(),
  freezeAt: (i: number, t: number) => player.freezeAt(i, t),
  unfreeze() {
    player.freeze = false;
  },
});
