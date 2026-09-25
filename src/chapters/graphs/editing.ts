// Editing the net by hand: pick knots and strings on screen, drag knots, add and
// delete them, tie strings, and change a string's weight. Every edit re-runs the
// algorithm from the start.

import * as THREE from 'three';
import { byId } from '../../core/dom';
import { clamp01 } from '../../core/math';
import { isPhone } from '../../core/prefs';
import { sound } from '../../core/sound';
import type { Framer } from '../../core/stage';
import { checkWeight, type EdgeId, type EditResult, type NodeId } from './algorithms';
import type { Inspector } from './inspector';
import { REGION } from './palette';
import { plinthOf, raceOffsets, type ScenePose } from './poses';
import type { GraphProgram } from './program';
import { curveAt, type EdgeWorld, type GraphScene } from './scene';
import type { GraphDoc, UiState } from './state';

export interface RebuildOptions {
  autoplay?: boolean;
  catchDur?: number;
  /** Morph from this pose instead of whatever is on screen. */
  from?: ScenePose | null;
}

export interface EditorDeps {
  canvas: HTMLCanvasElement;
  scene: GraphScene;
  framer: Framer;
  ui: UiState;
  doc: GraphDoc;
  inspector: Inspector;
  program(): GraphProgram;
  /** A run is under way (not sitting at its start). */
  isRunning(): boolean;
  currentPose(): ScenePose;
  rebuild(opts?: RebuildOptions): void;
  /** The graph no longer matches any preset. */
  markCustom(): void;
  hint(msg?: string, err?: boolean): void;
}

export interface Editor {
  openWeight(id: EdgeId): void;
  closeWeight(): void;
  /** Keep the weight card next to its string as the camera moves. */
  placeWeight(): void;
  deleteNode(id: NodeId): void;
}

interface Hit {
  j: number;
  id: NodeId;
}

export function createEditor(d: EditorDeps): Editor {
  const { canvas, scene, ui, doc } = d;
  const { camera, controls } = scene.stage;
  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    hitP = new THREE.Vector3();
  const _v = new THREE.Vector3(),
    _p = new THREE.Vector3(),
    tmp = [0, 0, 0];
  const pop = byId<HTMLFormElement>('wpop'),
    wval = byId<HTMLInputElement>('wval'),
    werr = byId('werr'),
    wname = byId('wname');

  /** Where the pointer meets the plane of the plinth tops. */
  function planePoint(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hitP);
  }
  /** Which plinth a point on the floor belongs to (race plinths sit behind and in front). */
  const netAt = (p: THREE.Vector3) => (d.program().nets.length < 2 || p.z < 0 ? 0 : 1);
  const offOf = (j: number) => {
    const c = d.program().nets[j];
    return { ox: c ? c.ox : 0, oz: c ? c.oz : 0 };
  };

  function pickNode(e: { clientX: number; clientY: number }): Hit | null {
    let best: Hit | null = null,
      bd = Infinity;
    for (const w of scene.nodeWorld.values()) {
      if (w.gen !== doc.gen || w.r < 0.1) continue;
      _v.set(w.x, w.y, w.z).project(camera);
      const sx = ((_v.x + 1) / 2) * innerWidth,
        sy = ((1 - _v.y) / 2) * innerHeight;
      _p.set(w.x, w.y, w.z).addScaledVector(scene.right, w.r).project(camera);
      const pr = Math.abs(((_p.x - _v.x) / 2) * innerWidth);
      const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
      if (dist < pr + 8 && dist < bd) {
        bd = dist;
        best = { j: w.j, id: w.id };
      }
    }
    return best;
  }

  function pickEdge(e: { clientX: number; clientY: number }): EdgeWorld | null {
    let best: EdgeWorld | null = null,
      bd = Infinity;
    const scr = (x: number, y: number, z: number): [number, number] => {
      _v.set(x, y, z).project(camera);
      return [((_v.x + 1) / 2) * innerWidth, ((1 - _v.y) / 2) * innerHeight];
    };
    for (const w of scene.edgeWorld) {
      if (w.gen !== doc.gen) continue;
      if (w.showW) {
        const [sx, sy] = scr(w.wx, w.wy, w.wz),
          dd = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (dd < 16 && dd < bd) {
          bd = dd;
          best = w;
        }
      }
      let prev: [number, number] | null = null;
      for (let k = 0; k <= 10; k++) {
        curveAt(w.ax, w.ay, w.az, w.bx, w.by, w.bz, w.sag, k / 10, tmp);
        const s = scr(tmp[0], tmp[1], tmp[2]);
        if (prev) {
          const vx = s[0] - prev[0],
            vy = s[1] - prev[1],
            l2 = vx * vx + vy * vy || 1;
          const u = clamp01(((e.clientX - prev[0]) * vx + (e.clientY - prev[1]) * vy) / l2);
          const dd = Math.hypot(e.clientX - prev[0] - u * vx, e.clientY - prev[1] - u * vy);
          if (dd < 9 && dd + 4 < bd) {
            bd = dd + 4;
            best = w;
          }
        }
        prev = s;
      }
    }
    return best;
  }

  /** Apply an edit; on success re-run the algorithm from the start. */
  function edit(fn: () => EditResult | { error?: string }, hintMsg?: string): EditResult | { error?: string } {
    const res = fn();
    if (res.error) {
      d.hint(res.error, true);
      return res;
    }
    d.markCustom();
    d.rebuild({ catchDur: 0.45 });
    if (hintMsg) d.hint(hintMsg);
    return res;
  }
  function addNodeAt(p: THREE.Vector3, j: number): void {
    const { ox, oz } = offOf(j);
    const x = Math.max(-REGION.x, Math.min(REGION.x, p.x - ox)),
      z = Math.max(-REGION.z, Math.min(REGION.z, p.z - oz));
    for (const n of doc.graph.nodes.values())
      if (Math.hypot(n.x - x, n.z - z) < 1.0) {
        d.hint(`Too close to ${n.label}. Click a clear spot on the plinth.`, true);
        return;
      }
    edit(() => doc.graph.addNode(+x.toFixed(2), +z.toFixed(2)), 'Knot added. Tie it in with + Edge.');
  }
  function tieEdge(a: NodeId, b: NodeId): void {
    const A = doc.graph.nodes.get(a),
      B = doc.graph.nodes.get(b);
    if (!A || !B) return;
    const w = Math.max(1, Math.min(99, Math.round(Math.hypot(A.x - B.x, A.z - B.z) * 1.5)));
    const g = doc.graph;
    const res = edit(
      () => g.addEdge(a, b, w),
      `Tied ${g.label(a)}${g.directed ? '→' : '–'}${g.label(b)}. Set its weight, or keep ${w}.`,
    );
    if (!res.error && 'id' in res && res.id != null) openWeight(res.id);
  }
  function deleteNode(id: NodeId): void {
    const L = doc.graph.label(id);
    edit(() => {
      doc.graph.removeNode(id);
      return {};
    }, `${L} and its strings are gone.`);
  }

  /* ---------- dragging ---------- */

  function startDrag(hit: Hit, downAt: { x: number; y: number }): void {
    const n = doc.graph.nodes.get(hit.id);
    if (!n) return;
    if (d.isRunning()) d.rebuild({ catchDur: 0.35 }); // editing resets the run
    ui.drag = { id: hit.id, j: hit.j, x: n.x, z: n.z, dx: 0, dz: 0 };
    const pp = planePoint({ clientX: downAt.x, clientY: downAt.y }),
      o = offOf(hit.j);
    if (pp) {
      ui.drag.dx = pp.x - o.ox - n.x;
      ui.drag.dz = pp.z - o.oz - n.z;
    }
    canvas.style.cursor = 'grabbing';
  }
  /** While dragging, the start pose itself follows the knot, so nothing jumps when the drag ends. */
  function patchDrag(): void {
    const drag = ui.drag,
      n = drag ? doc.graph.nodes.get(drag.id) : undefined;
    if (!drag || !n) return;
    n.x = +drag.x.toFixed(2);
    n.z = +drag.z.toFixed(2);
    const prog = d.program(),
      pl = plinthOf(doc.graph);
    const offs = prog.mode === 'race' ? raceOffsets(pl) : [{ ox: 0, oz: 0 }];
    prog.startPose.nets.forEach((net, j) => {
      const nn = net.nodes.get(`${net.gen}:${drag.id}`);
      if (nn) {
        nn.x = n.x;
        nn.z = n.z;
      }
      net.plinth = { ...pl };
      net.ox = offs[j].ox;
      net.oz = offs[j].oz;
    });
  }
  function endDrag(): void {
    if (!ui.drag) return;
    const from = d.currentPose();
    ui.drag = null;
    d.markCustom();
    d.rebuild({ from, catchDur: 0.25 });
    canvas.style.cursor = '';
  }

  /* ---------- pointer ---------- */

  const pointers = new Set<number>();
  let down: { x: number; y: number; t: number; node: Hit | null; dragReady: boolean } | null = null;

  canvas.addEventListener(
    'pointerdown',
    e => {
      pointers.add(e.pointerId);
      sound.ensure();
      down =
        pointers.size === 1
          ? { x: e.clientX, y: e.clientY, t: e.timeStamp, node: pickNode(e), dragReady: false }
          : null;
      if (pointers.size > 1 && ui.drag) endDrag();
      if (down && down.node && ui.tool === 'move' && e.button === 0) {
        controls.enabled = false; // this press moves a knot, not the camera
        down.dragReady = true;
      } else if (e.button === 2 || e.button === 1 || pointers.size > 1 || e.shiftKey || e.ctrlKey || e.metaKey)
        d.framer.manual();
    },
    { capture: true },
  );
  canvas.addEventListener('pointermove', e => {
    const p = planePoint(e);
    if (ui.pendingEdge && p) ui.pointer = { x: p.x, z: p.z };
    if (down && down.dragReady && down.node && !ui.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)
      startDrag(down.node, down);
    if (ui.drag && p) {
      const { ox, oz } = offOf(ui.drag.j);
      ui.drag.x = Math.max(-REGION.x, Math.min(REGION.x, p.x - ox - ui.drag.dx));
      ui.drag.z = Math.max(-REGION.z, Math.min(REGION.z, p.z - oz - ui.drag.dz));
      patchDrag();
      return;
    }
    if (!pointers.size && !isPhone())
      canvas.style.cursor = pickNode(e)
        ? ui.tool === 'move'
          ? 'grab'
          : 'pointer'
        : ui.tool === 'node'
          ? 'copy'
          : ui.tool === 'move'
            ? 'grab'
            : 'default';
  });
  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    controls.enabled = true;
    if (ui.drag) {
      endDrag();
      down = null;
      return;
    }
    if (
      e.type === 'pointerup' &&
      down &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < 7 &&
      e.timeStamp - down.t < 700
    )
      click(e, down.node);
    down = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', () => d.framer.manual(), { passive: true });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  controls.addEventListener('start', () => {
    if (controls.enabled) d.framer.turned();
  });

  function click(e: PointerEvent, hitNode: Hit | null): void {
    const tool = ui.tool;
    if (hitNode) {
      if (tool === 'delete') return deleteNode(hitNode.id);
      if (tool === 'edge') {
        if (!ui.pendingEdge) {
          ui.pendingEdge = hitNode;
          ui.pointer = null;
          d.hint(`Now click the knot to tie ${doc.graph.label(hitNode.id)} to.`);
          return;
        }
        const a = ui.pendingEdge.id;
        ui.pendingEdge = null;
        if (a === hitNode.id) return d.hint();
        return tieEdge(a, hitNode.id);
      }
      closeWeight();
      d.inspector.select(hitNode.id, hitNode.j);
      return;
    }
    const edge = pickEdge(e);
    if (edge) {
      if (tool === 'delete') {
        const E = doc.graph.edges.get(edge.id);
        const name = E ? `${doc.graph.label(E.a)}–${doc.graph.label(E.b)}` : '';
        edit(() => {
          doc.graph.removeEdge(edge.id);
          return {};
        }, `String ${name} removed.`);
        return;
      }
      if (tool === 'move' || tool === 'edge') {
        ui.pendingEdge = null;
        return openWeight(edge.id);
      }
    }
    if (tool === 'node') {
      const p = planePoint(e);
      if (p) addNodeAt(p, netAt(p));
      return;
    }
    if (tool === 'edge' && ui.pendingEdge) {
      ui.pendingEdge = null;
      return d.hint();
    }
    closeWeight();
    if (ui.selected != null) d.inspector.close();
  }

  /* ---------- the weight card ---------- */

  function openWeight(id: EdgeId): void {
    const E = doc.graph.edges.get(id);
    if (!E) return;
    ui.wEdge = id;
    wname.textContent = `${doc.graph.label(E.a)}${doc.graph.directed ? '→' : '–'}${doc.graph.label(E.b)}`;
    wval.value = String(E.w);
    werr.textContent = '';
    wval.setAttribute('aria-invalid', 'false');
    pop.hidden = false;
    placeWeight();
    wval.focus();
    wval.select();
  }
  function placeWeight(): void {
    if (ui.wEdge == null || isPhone()) return;
    const w = scene.edgeWorld.find(x => x.id === ui.wEdge && x.gen === doc.gen);
    if (!w) return;
    const m = curveAt(w.ax, w.ay, w.az, w.bx, w.by, w.bz, w.sag, 0.5, tmp);
    const s = scene.toScreen(m[0], m[1], m[2]);
    if (!s) return;
    const pw = pop.offsetWidth,
      ph = pop.offsetHeight;
    pop.style.left = `${Math.max(12, Math.min(innerWidth - pw - 12, s.x - pw / 2))}px`;
    pop.style.top = `${Math.max(12, Math.min(innerHeight - ph - 12, s.y + 24))}px`;
  }
  function closeWeight(): void {
    ui.wEdge = null;
    pop.hidden = true;
  }
  pop.addEventListener('submit', e => {
    e.preventDefault();
    const id = ui.wEdge,
      raw = wval.value;
    const bad = checkWeight(raw);
    if (bad) {
      werr.textContent = bad;
      wval.setAttribute('aria-invalid', 'true');
      return;
    }
    const E = id != null ? doc.graph.edges.get(id) : undefined;
    if (id != null && E && E.w !== Number(raw.trim())) {
      doc.graph.setWeight(id, raw);
      d.markCustom();
      d.rebuild({ catchDur: 0.45 });
      d.hint(`${wname.textContent} now weighs ${Number(raw.trim())}.`);
    }
    closeWeight();
  });
  byId('wDel').addEventListener('click', () => {
    const id = ui.wEdge;
    closeWeight();
    if (id != null)
      edit(() => {
        doc.graph.removeEdge(id);
        return {};
      }, 'String removed.');
  });
  byId('wClose').addEventListener('click', closeWeight);

  return { openWeight, closeWeight, placeWeight, deleteNode };
}
