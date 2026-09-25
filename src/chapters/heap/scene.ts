// The Heap Pyramid scene: a long plinth on a plaster floor, the tree of keys standing
// at the back, the array lying along the plinth in front of it, and the out tray in
// front of that. Every key is drawn at its node, at its cell, or on its way between
// them (the fold); in the tree view each cell keeps a small copy of its key, so a
// swap in the tree is seen as a swap in the array at the same moment. draw()
// renders any Pose.

import * as THREE from 'three';
import { mix3, type RGB } from '../../core/color';
import { InstancedBatch, WireKit } from '../../core/instances';
import { glyphWidth } from '../../core/glyphs';
import { LabelBatch, MODE } from '../../core/labels';
import { clamp01, lerp, smooth } from '../../core/math';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import * as Lay from './layout';
import { COL } from './palette';
import { PLINTH_Z0, PLINTH_Z1, itemAt, type P3, type Pose, type SlotPose } from './poses';

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** The disc being inspected. */
  selected: string | null;
  clock: number;
}

/** Where a disc was drawn this frame. */
export interface ItemWorld extends P3 {
  r: number;
  key: string;
}

const v3 = (x: number, y: number, z: number): P3 => ({ x, y, z });

export class HeapScene {
  readonly stage: Stage;
  /** Where each disc was drawn this frame, by item key. */
  readonly itemWorld = new Map<string, ItemWorld>();
  /** Where each key's copy in the array was drawn, by item key. */
  readonly chipWorld = new Map<string, ItemWorld>();
  private readonly plinth: THREE.Mesh;
  private readonly kit: WireKit;
  private readonly boxes: InstancedBatch;
  private readonly labels: LabelBatch;
  private readonly camUp = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camBack = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _v = new THREE.Vector3();
  private readonly curve: P3[] = Array.from({ length: 25 }, () => v3(0, 0, 0));
  private pose: Pose | null = null;
  private span = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.45, 1, 0.85],
      cameraPos: [-2, 8, 24],
      target: [0, 2.4, 1],
      controls: {
        minPolarAngle: 0.35,
        maxPolarAngle: 1.5,
        minAzimuthAngle: -1.2,
        maxAzimuthAngle: 1.2,
        minDistance: 5,
        maxDistance: 120,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 120, 300);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [26, 26], seed: 43 }),
        roughness: 0.97,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -Lay.PH;
    floor.receiveShadow = true;
    scene.add(floor);
    this.plinth = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xf7f3eb, roughness: 0.88, metalness: 0, envMapIntensity: 0.5 }),
    );
    this.plinth.castShadow = true;
    this.plinth.receiveShadow = true;
    scene.add(this.plinth);
    const tuned: Record<'rod' | 'ball' | 'cone' | 'disc', THREE.MeshStandardMaterialParameters> = {
      disc: { roughness: 0.72, metalness: 0, envMapIntensity: 0.4 },
      rod: { roughness: 0.42, metalness: 0.25 },
      ball: { roughness: 0.4, metalness: 0.15 },
      cone: { roughness: 0.45, metalness: 0.1 },
    };
    this.kit = new WireKit(scene, {
      material: kind =>
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.45,
          metalness: 0.08,
          envMapIntensity: 0.55,
          ...tuned[kind],
        }),
      discRadius: Lay.R,
      max: { discs: 140, rods: 4000, balls: 1200, cones: 60 },
    });
    this.boxes = new InstancedBatch(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.45 }),
      120,
    );
    this.boxes.mesh.receiveShadow = true;
    // the tree floats well above the plinth: its shadows would only lie between it and the array
    for (const b of [this.kit.discs, this.kit.rods, this.kit.balls, this.kit.cones]) b.mesh.castShadow = false;
    this.labels = new LabelBatch(scene);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }

  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  counts(): { rods: number; discs: number; labels: number; boxes: number } {
    return { rods: this.kit.rods.n, discs: this.kit.discs.n, labels: this.labels.count, boxes: this.boxes.n };
  }

  /* ---------- resolving references ---------- */

  /** Where slot i is drawn: between its cell and its node, by the fold. */
  private slotPos(sl: SlotPose): P3 {
    return v3(lerp(sl.c.x, sl.t.x, sl.f), lerp(sl.c.y, sl.t.y, sl.f), lerp(sl.c.z, sl.t.z, sl.f));
  }

  /** How high the arc between two cells rises: tall when the array is seen alone, low under the tree. */
  private arcHeight(a: number, b: number, f: number): number {
    const span = Math.abs(a - b);
    return lerp(Lay.arcRise(span), 0.32 + 0.16 * span, f);
  }

  /** The top of the arc between two cells. */
  private arcTop(a: number, b: number): P3 | null {
    const P = this.pose,
      A = P?.slots[a],
      B = P?.slots[b];
    if (!A || !B) return null;
    const f = (A.f + B.f) / 2;
    const y0 = Lay.CHIP_Y + Lay.R * Lay.CHIP;
    return v3((A.c.x + B.c.x) / 2, y0 + this.arcHeight(a, b, f), (A.c.z + B.c.z) / 2);
  }

  /** The centre of the disc, slot or arc a reference names, as drawn this frame. */
  private refPos(ref: string | null): P3 | null {
    if (ref == null || !this.pose) return null;
    const it = this.itemWorld.get(ref);
    if (it) return it;
    const parts = ref.split(':');
    if (parts[0] === 's') {
      const sl = this.pose.slots[Number(parts[1])];
      return sl ? this.slotPos(sl) : null;
    }
    if (parts[0] === 'arc') return this.arcTop(Number(parts[1]), Number(parts[2]));
    return null;
  }

  /** Screen position (CSS px) of a disc, slot or arc, or null if it is not on screen. */
  refScreen(ref: string): { x: number; y: number } | null {
    const p = this.refPos(ref);
    return p ? this.toScreen(p.x, p.y, p.z) : null;
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) return null;
    return { x: ((this._v.x + 1) / 2) * innerWidth, y: ((1 - this._v.y) / 2) * innerHeight };
  }

  /** Where a callout for this reference should sit. */
  anchorOf(ref: string): (P3 & { r: number }) | null {
    const p = this.refPos(ref);
    if (!p) return null;
    const it = this.itemWorld.get(ref);
    return { ...p, r: it ? it.r : ref.startsWith('arc') ? 0.05 : Lay.R };
  }

  /* ---------- drawing ---------- */

  draw(P: Pose, view: DrawView): void {
    this.pose = P;
    const kit = this.kit,
      LB = this.labels,
      camera = this.camera;
    kit.begin();
    this.boxes.begin();
    LB.begin();
    this.itemWorld.clear();
    this.chipWorld.clear();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);

    const { x0, x1 } = P.plinth;
    this.span = x1 - x0;
    this.plinth.position.set((x0 + x1) / 2, -Lay.PH / 2, (PLINTH_Z0 + PLINTH_Z1) / 2);
    this.plinth.scale.set(x1 - x0, Lay.PH, PLINTH_Z1 - PLINTH_Z0);

    this.drawArray(P);
    this.drawTray(P);
    this.drawTreeMarks(P);

    // discs first, so wires can find them
    for (const it of P.items.values()) {
      if (it.s < 0.01) continue;
      const p = itemAt(it),
        sc = it.s * lerp(Lay.CHIP, 1, it.f),
        r = Lay.R * sc;
      this.itemWorld.set(it.key, { ...p, r, key: it.key });
      this.disc(p, sc, it.fill, it.glyph, it.rim, it.rimW, it.halo, it.label, view);
      if (view.selected === it.key)
        LB.shape(MODE.ring, p.x, p.y, p.z, 2 * (r + 0.12), 2 * (r + 0.12), COL.cobalt, 1, 0, 0, 1, 0.04);
      if (it.tag) {
        const h = 0.2 * Math.max(0.75, sc);
        LB.pill(p.x, p.y + r + h * 1.3, p.z, it.tag, h, 0, 0, COL.paper, COL.ink, 0.014, COL.ink, 1);
      }
      // the array's copy of a key in the tree
      const cs = it.chip * it.s * Math.min(1, it.f * 4);
      if (cs > 0.02) {
        const c = it.c,
          csc = Lay.CHIP * cs;
        this.chipWorld.set(it.key, { ...c, r: Lay.R * csc, key: it.key });
        this.disc(c, csc, it.fill, it.glyph, it.rim, it.rimW, 0, it.label, view);
        if (it.tag) LB.text(it.tag, c.x, c.y + Lay.R * csc + 0.17, c.z, 0.16, COL.graphite, cs);
      }
    }
    this.drawWires(P);
    this.drawOverlays(P);
    for (const rp of P.ripples) {
      const p = this.refPos(rp.at);
      if (!p || rp.a < 0.01) continue;
      LB.group(p.x, p.y, p.z);
      LB.shape(MODE.ring, p.x, p.y, p.z, 2 * rp.r, 2 * rp.r, rp.col, rp.a, 0, 0, 1, 0.04);
    }
    kit.end();
    this.boxes.end();
    LB.end(camera);
  }

  private disc(
    p: P3,
    sc: number,
    fill: RGB,
    glyph: RGB,
    rim: RGB,
    rimW: number,
    halo: number,
    label: string,
    view: DrawView,
  ): void {
    const LB = this.labels,
      r = Lay.R * sc;
    this.kit.disc(p.x, p.y, p.z, sc, fill, this.camera.quaternion);
    LB.group(p.x, p.y, p.z);
    if (halo > 0.01)
      LB.shape(
        MODE.glow,
        p.x,
        p.y,
        p.z,
        2 * (r + 0.5),
        2 * (r + 0.5),
        COL.cobalt,
        0.32 * halo * (0.85 + 0.15 * Math.sin(view.clock * 4)),
        0,
        0,
        0,
        r + 0.16,
        0.2,
      );
    LB.shape(MODE.ring, p.x, p.y, p.z, 2 * r, 2 * r, rim, 1, 0, 0, 1, rimW * sc);
    LB.text(label, p.x, p.y, p.z, (label.length > 1 ? 0.3 : 0.36) * sc, glyph, 1);
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, col: RGB): void {
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(w, h, d);
    this.boxes.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** The array: a cell per slot, its index in front, the next free cell dashed, spare room faint. */
  private drawArray(P: Pose): void {
    const LB = this.labels;
    let left = Infinity;
    P.slots.forEach((sl, i) => {
      if (sl.a < 0.01) return;
      const c = sl.c,
        a = sl.a;
      left = Math.min(left, c.x - Lay.CW / 2);
      const h = Math.max(0.01, Lay.CELL_H * a * (0.35 + 0.65 * Math.max(sl.used, sl.ghost * 0.5)));
      const col = mix3(mix3(COL.spare, COL.cell, sl.used), mix3(COL.cell, COL.yellow, 0.35), sl.lit * (1 - 0.5 * sl.f));
      this.box(c.x, h / 2, c.z, Lay.CELL_W * (0.6 + 0.4 * a), h, Lay.CELL_D * (0.6 + 0.4 * a), col);
      if (sl.ghost > 0.02) {
        LB.group(c.x, h + 0.01, c.z);
        LB.shape(
          MODE.outline,
          c.x,
          h + 0.012,
          c.z,
          Lay.CELL_W - 0.12,
          Lay.CELL_D - 0.12,
          COL.graphite,
          0.7 * sl.ghost * a,
          0,
          0,
          0.25,
          0.025,
          0,
          0,
          1,
        );
      }
      // the index, in front of the cell
      const iz = c.z + Lay.CELL_D / 2 + 0.2;
      LB.group(c.x, 0.1, iz);
      LB.text(
        String(i),
        c.x,
        0.12,
        iz,
        0.2,
        sl.used > 0.5 ? COL.ink : COL.faint,
        a * (0.45 + 0.5 * Math.max(sl.used, sl.ghost)),
      );
    });
    if (Number.isFinite(left)) {
      const x = left - 0.2,
        z = Lay.ARR_Z;
      LB.group(x, 0.1, z);
      LB.text('ARRAY', x, 0.14, z, 0.17, COL.graphite, 0.85, -glyphHalf('ARRAY', 0.17), 0);
    }
  }

  /** The out tray: keys that came off the top, in the order they came. */
  private drawTray(P: Pose): void {
    const LB = this.labels;
    const n = Math.max(0, P.tray),
      x0 = P.trayX,
      z = Lay.OUT_Z;
    const len = Math.max(1, n) * Lay.CW;
    this.box(x0 + len / 2, 0.04, z, len, 0.08, Lay.CELL_D * 0.9, mix3(COL.paper, COL.faint, 0.12));
    for (let j = 0; j < Math.ceil(n - 1e-6); j++) {
      const w = clamp01(n - j),
        x = x0 + (j + 0.5) * Lay.CW;
      this.box(x, 0.09, z, Lay.CELL_W * 0.9 * w, 0.06, Lay.CELL_D * 0.8, COL.cell);
    }
    const x = x0 - 0.2;
    LB.group(x, 0.1, z);
    LB.text('OUT', x, 0.14, z, 0.17, COL.graphite, 0.85, -glyphHalf('OUT', 0.17), 0);
  }

  /** In the tree: each slot's index, the next free slot dashed, and a glow round the lit ones. */
  private drawTreeMarks(P: Pose): void {
    const LB = this.labels;
    P.slots.forEach((sl, i) => {
      const f = sl.f * sl.a;
      if (f < 0.01) return;
      const p = this.slotPos(sl);
      const show = Math.max(sl.used, sl.ghost);
      if (show > 0.01) {
        LB.group(p.x, p.y, p.z);
        LB.text(String(i), p.x, p.y, p.z, 0.17, COL.graphite, 0.75 * f * show, -(Lay.R + 0.2), Lay.R * 0.7);
      }
      if (sl.ghost > 0.01) {
        LB.group(p.x, p.y, p.z);
        LB.shape(
          MODE.ring,
          p.x,
          p.y,
          p.z,
          2 * Lay.R,
          2 * Lay.R,
          COL.graphite,
          0.7 * sl.ghost * f,
          0,
          0,
          1,
          0.025,
          14,
          0,
        );
      }
      if (sl.lit > 0.01) {
        LB.group(p.x, p.y, p.z);
        LB.shape(
          MODE.glow,
          p.x,
          p.y,
          p.z,
          2 * (Lay.R + 0.6),
          2 * (Lay.R + 0.6),
          COL.yellow,
          0.55 * sl.lit * f,
          0,
          0,
          0,
          Lay.R + 0.14,
          0.28,
        );
      }
    });
  }

  /* ---------- wires ---------- */

  /** Fill this.curve with the wire from slot p down to slot c; returns the number of segments. */
  private wireCurve(p: number, c: number): number {
    const P = this.pose,
      A = P?.slots[p],
      B = P?.slots[c];
    if (!A || !B) return 0;
    const a = this.slotPos(A),
      b = this.slotPos(B);
    const f = (A.f + B.f) / 2;
    // from the top of the parent's cell over to the child's, or straight down the tree
    const lift = (1 - f) * (Lay.R * Lay.CHIP + 0.02);
    const a0 = v3(a.x, a.y + lift, a.z),
      b0 = v3(b.x, b.y + lift, b.z);
    const h = (1 - f) * this.arcHeight(p, c, 0);
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const u = k / n,
        q = this.curve[k];
      q.x = lerp(a0.x, b0.x, u);
      q.y = lerp(a0.y, b0.y, u) + 4 * h * u * (1 - u);
      q.z = lerp(a0.z, b0.z, u);
    }
    return n;
  }

  private drawWires(P: Pose): void {
    const kit = this.kit;
    for (const w of P.wires.values()) {
      if (w.s < 0.01) continue;
      const p = (w.c - 1) >> 1;
      const n = this.wireCurve(p, w.c);
      if (!n) continue;
      const Pp = P.slots[p],
        Pc = P.slots[w.c];
      const f = (Pp.f + Pc.f) / 2;
      // leave room for the discs at both ends, which are smaller in the array
      const rr = Lay.R * lerp(Lay.CHIP, 1, f);
      const C = this.curve;
      const len = Math.hypot(C[n].x - C[0].x, C[n].y - C[0].y, C[n].z - C[0].z) || 1;
      const u0 = f > 0.5 ? Math.min(0.45, (rr + 0.04) / len) : 0,
        u1 = 1 - (f > 0.5 ? Math.min(0.45, (rr + 0.04) / len) : 0);
      const upto = lerp(u0, u1, clamp01(w.s)) * n;
      const col = mix3(mix3(COL.ink, COL.cobalt, w.hot), COL.red, w.bad);
      const r = (0.024 + 0.014 * Math.max(w.hot, w.bad)) * (0.8 + 0.2 * f);
      const ghost = w.ghost > 0.5;
      for (let k = Math.floor(u0 * n); k < n && k < upto; k++) {
        if (ghost && k % 2) continue;
        const s0 = Math.max(k, u0 * n) - k,
          e = Math.min(1, upto - k);
        const A = C[k],
          B = C[k + 1];
        kit.rod(
          lerp(A.x, B.x, s0),
          lerp(A.y, B.y, s0),
          lerp(A.z, B.z, s0),
          lerp(A.x, B.x, e),
          lerp(A.y, B.y, e),
          lerp(A.z, B.z, e),
          ghost ? r * 0.6 : r,
          ghost ? mix3(COL.graphite, COL.paper, 0.2) : col,
        );
        if (!ghost && k > u0 * n) kit.ball(A.x, A.y, A.z, r, col);
      }
    }
  }

  /** The comparison in hand: arcs over the array from the moving key's cell, and threads from tree to cell. */
  private drawOverlays(P: Pose): void {
    const kit = this.kit;
    for (const arc of P.arcs.values()) {
      const A = P.slots[arc.a],
        B = P.slots[arc.b];
      if (!A || !B || arc.s < 0.01) continue;
      const f = (A.f + B.f) / 2;
      const w = arc.s * smooth(0.2, 0.8, f);
      if (w < 0.01) continue;
      const y0 = Lay.CHIP_Y + Lay.R * Lay.CHIP + 0.06,
        h = this.arcHeight(arc.a, arc.b, 1);
      const a0 = v3(A.c.x, y0, A.c.z),
        b0 = v3(B.c.x, y0, B.c.z);
      const n = 20;
      const upto = n * clamp01(w * 1.2);
      let px = a0.x,
        py = a0.y,
        pz = a0.z;
      for (let k = 1; k <= n && k <= upto; k++) {
        const u = k / n;
        const x = lerp(a0.x, b0.x, u),
          y = lerp(a0.y, b0.y, u) + 4 * h * u * (1 - u),
          z = lerp(a0.z, b0.z, u);
        kit.rod(px, py, pz, x, y, z, 0.022, arc.col);
        px = x;
        py = y;
        pz = z;
      }
      if (upto >= n) {
        const u = 1 - 1 / n;
        const x = lerp(a0.x, b0.x, u),
          y = lerp(a0.y, b0.y, u) + 4 * h * u * (1 - u),
          z = lerp(a0.z, b0.z, u);
        kit.cone(b0.x, b0.y, b0.z, b0.x - x, b0.y - y, b0.z - z, 0.07, 0.2, arc.col);
      }
    }
    // threads from a node down to its cell
    for (const g of P.guides.values()) {
      const sl = P.slots[g.i];
      if (!sl) continue;
      const w = g.a * smooth(0.3, 0.9, sl.f) * sl.a;
      if (w < 0.02) continue;
      const top = v3(sl.t.x, sl.t.y - Lay.R - 0.05, sl.t.z),
        bot = v3(sl.c.x, sl.c.y + Lay.R * Lay.CHIP + 0.08, sl.c.z);
      const n = 16;
      for (let k = 0; k < n; k += 2) {
        const u0 = k / n,
          u1 = Math.min(1, (k + 1) / n);
        kit.rod(
          lerp(top.x, bot.x, u0),
          lerp(top.y, bot.y, u0),
          lerp(top.z, bot.z, u0),
          lerp(top.x, bot.x, u1),
          lerp(top.y, bot.y, u1),
          lerp(top.z, bot.z, u1),
          0.012 * w,
          mix3(COL.paper, COL.cobalt, w),
        );
      }
    }
  }

  /* ---------- camera and lights ---------- */

  /**
   * The extent of everything worth keeping on screen, measured across and up the
   * current view. Worked out from a pose, so the page can frame where a step will
   * come to rest rather than chase it.
   */
  frameBox(P: Pose): FrameBox {
    const pts: [number, number, number][] = [];
    const { x0, x1 } = P.plinth;
    for (const x of [x0, x1]) for (const z of [PLINTH_Z0, PLINTH_Z1]) pts.push([x, 0, z], [x, -Lay.PH, z]);
    for (const sl of P.slots) {
      if (sl.a < 0.05 || Math.max(sl.used, sl.ghost) < 0.05) continue;
      const p = this.slotPos(sl);
      pts.push([p.x, p.y + Lay.R + 0.3, p.z]);
    }
    // the tallest arc, when the array is seen alone
    let top = 0;
    for (const w of P.wires.values()) {
      const A = P.slots[(w.c - 1) >> 1],
        B = P.slots[w.c];
      if (!A || !B || w.s < 0.05) continue;
      const f = (A.f + B.f) / 2;
      top = Math.max(top, Lay.CHIP_Y + (1 - f) * this.arcHeight((w.c - 1) >> 1, w.c, 0) + 0.3);
    }
    pts.push([0, top, Lay.ARR_Z]);
    const c = [0, 2, 1.2];
    let r0 = Infinity,
      r1 = -Infinity,
      u0 = Infinity,
      u1 = -Infinity,
      f1 = 0;
    for (const p of pts) {
      this._v.set(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
      const r = this._v.dot(this.camRight),
        u = this._v.dot(this.camUp),
        f = this._v.dot(this.camBack);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      f1 = Math.max(f1, f);
    }
    const mr = (r0 + r1) / 2,
      mu = (u0 + u1) / 2,
      cr = this.camRight,
      cu = this.camUp;
    return {
      cx: c[0] + cr.x * mr + cu.x * mu,
      cy: c[1] + cr.y * mr + cu.y * mu,
      cz: c[2] + cr.z * mr + cu.z * mu,
      hw: Math.max(5.5, (r1 - r0) / 2 + 0.2),
      hh: Math.max(3.4, (u1 - u0) / 2 + 0.2),
      depth: f1 * 0.15,
    };
  }

  /** The key light and its shadow camera follow the plinth. */
  fitLights(): void {
    const { key, pool, KEY_DIR } = this.stage;
    const half = this.span / 2 + 4;
    const cx = this.pose ? (this.pose.plinth.x0 + this.pose.plinth.x1) / 2 : 0;
    key.target.position.set(cx, 1.5, 1);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 90;
    sc.updateProjectionMatrix();
    pool.position.set(cx - 2, 26, 14);
    pool.target.position.set(cx, 0, 1);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 28));
  }

  /** The camera's right vector this frame. */
  get right(): THREE.Vector3 {
    return this.camRight;
  }
}

/** Half the width of a caption, so it can sit to the left of a point. */
const glyphHalf = (s: string, h: number): number => glyphWidth(s, h) / 2 + 0.1;
