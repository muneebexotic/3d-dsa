// The Sorting Loom scene: a long plinth on a plaster floor, and on it one loom (or
// six side by side). At the front of each loom the threads stand in their slots,
// each on a heddle as high as its value, with its number on a disc; behind them
// the cloth reaches back, one row per comparison, with a gold pick across every
// row, S-bends where threads changed places, and a red knot where twins crossed.
// When the cloths stand up, each turns about its front edge like a tapestry being
// raised. draw() renders any Pose.

import * as THREE from 'three';
import { mix3, type RGB } from '../../core/color';
import { glyphWidth } from '../../core/glyphs';
import { InstancedBatch, WireKit } from '../../core/instances';
import { LabelBatch, MODE } from '../../core/labels';
import { smooth } from '../../core/math';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import * as Lay from './layout';
import { COL, dye, glyphOn, shade } from './palette';
import { rowState, type LoomPose, type Pose } from './poses';
import { SHORT } from './sorts';

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** The thread being followed. */
  selected: number | null;
  clock: number;
  /** How far back the threads come down from their heddles, as a share of the full shed (short in the Bars view). */
  shed: number;
}

/** Where a thread's disc was drawn this frame. */
export interface DiscWorld extends Lay.P3 {
  r: number;
  loom: string;
  t: number;
}

const sm = (u: number): number => u * u * (3 - 2 * u);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Where u sits when smoothstep reaches s (for finding where two S-bends cross). */
function unsmooth(s: number): number {
  let u = s;
  for (let k = 0; k < 6; k++) {
    const d = 6 * u * (1 - u);
    if (d < 1e-6) break;
    u = Math.min(1, Math.max(0, u - (sm(u) - s) / d));
  }
  return u;
}

export class LoomScene {
  readonly stage: Stage;
  /** Where each thread's disc was drawn this frame, by `${loom}:${thread}`. */
  readonly discWorld = new Map<string, DiscWorld>();
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
  private pose: Pose | null = null;
  // the loom being drawn
  private dz = 0.1;
  private cosT = 1;
  private sinT = 0;
  private hk = 1;
  private lift0 = 0;
  private shedK = 1;
  private shedLen: number = Lay.SHED;
  private readonly out = { x: 0, y: 0, z: 0 };
  private readonly prev = { x: 0, y: 0, z: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.5, 1, 0.7],
      cameraPos: [-6, 9, 16],
      target: [0, 1.4, -3],
      controls: {
        minPolarAngle: 0.02,
        maxPolarAngle: 1.52,
        minAzimuthAngle: -1.3,
        maxAzimuthAngle: 1.3,
        minDistance: 4,
        maxDistance: 140,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 140, 320);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [30, 30], seed: 61 }),
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
      disc: { roughness: 0.7, metalness: 0, envMapIntensity: 0.4 },
      rod: { roughness: 0.55, metalness: 0.05 },
      ball: { roughness: 0.4, metalness: 0.1 },
      cone: { roughness: 0.45, metalness: 0.1 },
    };
    this.kit = new WireKit(scene, {
      material: kind =>
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.5,
          metalness: 0.05,
          envMapIntensity: 0.55,
          ...tuned[kind],
        }),
      discRadius: 1,
      max: { discs: 260, rods: 30000, balls: 1400, cones: 40 },
    });
    // the wire-work is too fine to cast a useful shadow: it would only scribble on the cloth
    for (const b of [this.kit.discs, this.kit.rods, this.kit.balls, this.kit.cones]) b.mesh.castShadow = false;
    this.boxes = new InstancedBatch(
      scene,
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.45 }),
      200,
    );
    this.boxes.mesh.receiveShadow = true;
    this.boxes.mesh.castShadow = false;
    this.labels = new LabelBatch(scene);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }

  /** Keep the haze behind the piece however far back a long lens puts the camera. */
  fogFor(dist: number): void {
    const f = this.stage.scene.fog;
    if (f instanceof THREE.Fog) {
      f.near = dist + 60;
      f.far = dist + 300;
    }
  }

  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  counts(): { rods: number; discs: number; balls: number; labels: number; boxes: number } {
    return {
      rods: this.kit.rods.n,
      discs: this.kit.discs.n,
      balls: this.kit.balls.n,
      labels: this.labels.count,
      boxes: this.boxes.n,
    };
  }

  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) return null;
    return { x: ((this._v.x + 1) / 2) * innerWidth, y: ((1 - this._v.y) / 2) * innerHeight };
  }

  /** The camera's right vector this frame. */
  get right(): THREE.Vector3 {
    return this.camRight;
  }

  /* ---------- the loom's frame: lying on the plinth or standing up ---------- */

  private useLoom(L: LoomPose, dz: number): void {
    this.dz = dz;
    const th = (L.stand * Math.PI) / 2;
    this.cosT = Math.cos(th);
    this.sinT = Math.sin(th);
    // a standing cloth keeps only a little of its relief, and clears the plinth
    this.hk = 1 - 0.72 * L.stand;
    this.lift0 = 0.12 * L.stand;
    // the shed flattens as the cloth stands up, so it hangs flat from its front edge
    this.shedK = 1 - smooth(0, 0.6, L.stand);
  }

  /** World position of a point x across, h high and d behind the front of the current loom. */
  private at(x: number, h: number, d: number, o = this.out): { x: number; y: number; z: number } {
    const hh = h * this.hk;
    o.x = x;
    o.y = d * this.sinT + hh * this.cosT + this.lift0;
    o.z = -d * this.cosT + hh * this.sinT;
    return o;
  }

  private rodTo(x: number, h: number, d: number, r: number, col: RGB): void {
    const p = this.prev;
    const q = this.at(x, h, d);
    this.kit.rod(p.x, p.y, p.z, q.x, q.y, q.z, r, col);
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
  }
  private moveTo(x: number, h: number, d: number): void {
    this.at(x, h, d, this.prev);
  }

  /* ---------- drawing ---------- */

  draw(P: Pose, view: DrawView): void {
    this.pose = P;
    this.shedLen = Math.max(0.12, Lay.SHED * view.shed);
    const kit = this.kit,
      LB = this.labels,
      camera = this.camera;
    kit.begin();
    this.boxes.begin();
    LB.begin();
    this.discWorld.clear();
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);

    const { x0, x1, z0, z1 } = P.plinth;
    this.plinth.position.set((x0 + x1) / 2, -Lay.PH / 2, (z0 + z1) / 2);
    this.plinth.scale.set(x1 - x0, Lay.PH, z1 - z0);

    for (const L of P.looms) {
      if (L.a < 0.01) continue;
      this.useLoom(L, P.dz);
      this.drawCloth(L, view);
      this.drawFront(L, view);
      this.drawPlate(L);
    }
    kit.end();
    this.boxes.end();
    LB.end(camera);
  }

  /** x of slot s in loom L. */
  private X(L: LoomPose, s: number): number {
    return Lay.slotX(s, L.weave.n, L.px, L.cx);
  }
  private H(L: LoomPose, t: number): number {
    return Lay.heightOf(L.weave.run.threads.list[t].v, L.weave.top) * L.rise;
  }

  /** A thread's dye, faded while another thread is followed or the loom comes and goes. */
  private threadCol(L: LoomPose, t: number, view: DrawView): RGB {
    const c = dye(shade(L.weave.run.threads.list[t].v, L.weave.top));
    const dim = view.selected != null && view.selected !== t ? 0.72 : 0;
    return mix3(c, COL.plinth, Math.max(dim, 1 - L.a));
  }

  /** Height of thread t at distance d behind the front: up at its heddle, down on the cloth behind. */
  private Y(L: LoomPose, t: number, d: number): number {
    const flat = Lay.FLAT + Lay.OVER * shade(L.weave.run.threads.list[t].v, L.weave.top);
    const g = d <= 0 ? 1 : 1 - smooth(0, this.shedLen, d);
    return flat + (this.H(L, t) - flat) * g * this.shedK;
  }

  /** The cloth: every thread from its start to the front, the picks across it, the knots. */
  private drawCloth(L: LoomPose, view: DrawView): void {
    const w = L.weave,
      n = w.n,
      dz = this.dz;
    const R = L.rows,
      W = Math.max(0, Math.ceil(R - 1e-7));
    const dist = (r: number) => (R - r + 1) * dz;
    const r0 = Lay.threadR(L.px) * Math.min(1, L.a * 1.5);
    const K = n <= 12 ? 4 : n <= 16 ? 3 : 2;
    this.drawBed(L, dist(0));
    const fade = 1 - smooth(0, 0.45, L.stand);
    for (let t = 0; t < n; t++) {
      const col = this.threadCol(L, t, view);
      const r = view.selected === t ? r0 * 1.9 : r0;
      let xPrev = rowState(w, 0)[t],
        dPrev = dist(0);
      this.moveTo(this.X(L, xPrev), this.Y(L, t, dPrev), dPrev);
      for (let rr = 1; rr <= W; rr++) {
        const x = rowState(w, rr)[t];
        if (x === xPrev) continue;
        const d0 = dist(rr - 1);
        if (d0 < dPrev - 1e-9) this.span(L, t, xPrev, xPrev, dPrev, d0, 0, r, col, K);
        this.span(L, t, xPrev, x, d0, dist(rr), 0, r, col, K);
        xPrev = x;
        dPrev = dist(rr);
      }
      if (dist(W) < dPrev - 1e-9) this.span(L, t, xPrev, xPrev, dPrev, dist(W), 0, r, col, K);
      // the open end: from the last row up to the thread's heddle at the front
      const T = L.threads[t];
      const lift = T.lift * fade;
      this.span(L, t, xPrev, T.x, dist(W), -Lay.LIFT_Z * lift, Lay.LIFT_Y * lift, r, col, K);
    }
    this.drawPicks(L, W, dist, r0);
    this.drawKnots(L, W, dist, r0);
  }

  /**
   * Thread t from slot xa at distance da to slot xb at distance db (nearer the
   * front), easing across when it changes slot, curving up through the shed, and
   * rising by liftY at the far end when its key is lifted out of the row.
   */
  private span(
    L: LoomPose,
    t: number,
    xa: number,
    xb: number,
    da: number,
    db: number,
    liftY: number,
    r: number,
    col: RGB,
    K: number,
  ): void {
    const moving = Math.abs(xb - xa) > 1e-6;
    // flat cloth needs one rod; only the shed and the bends need more
    if (!moving && liftY === 0 && da > this.shedLen && db < this.shedLen) {
      this.rodTo(this.X(L, xa), this.Y(L, t, this.shedLen), this.shedLen, r, col);
      da = this.shedLen;
    }
    let k = moving ? (Math.abs(xb - xa) > 2.5 ? K + 2 : K) : 1;
    if (Math.min(da, db) < this.shedLen && this.shedK > 0.001)
      k = Math.max(k, Math.ceil((Math.min(this.shedLen, da) - Math.max(0, db)) / 0.14));
    if (liftY > 0) k = Math.max(k, 4);
    const XA = this.X(L, xa),
      XB = this.X(L, xb);
    for (let j = 1; j <= k; j++) {
      const u = j / k,
        s = moving ? sm(u) : 0;
      const d = da + (db - da) * u;
      this.rodTo(XA + (XB - XA) * s, this.Y(L, t, d) + liftY * sm(u), d, r, col);
    }
  }

  /** The linen the cloth lies on, from the front back to its start, and the heading bar across the start. */
  private drawBed(L: LoomPose, far: number): void {
    const n = L.weave.n;
    const w = n * L.px + 0.12,
      d0 = Lay.CELL_D / 2 + 0.06,
      d1 = far + 0.12;
    if (d1 > d0 + 0.01) this.slab(L.cx, 0.018, d0, d1, w, 0.016, mix3(COL.linen, COL.plinth, 1 - L.a));
    const a = this.at(this.X(L, -0.62), Lay.FLAT + 0.035, far),
      ax = a.x,
      ay = a.y,
      az = a.z;
    const b = this.at(this.X(L, n - 0.38), Lay.FLAT + 0.035, far);
    this.kit.rod(ax, ay, az, b.x, b.y, b.z, 0.03 * Math.min(1, L.a * 1.5), mix3(COL.ink, COL.plinth, 1 - L.a));
  }

  /** A flat box in the loom's frame: across x, top at y, from distance d0 back to d1. */
  private slab(xc: number, top: number, d0: number, d1: number, w: number, thick: number, col: RGB): void {
    const th = Math.atan2(this.sinT, this.cosT);
    const c = this.at(xc, top - thick / 2, (d0 + d1) / 2);
    this._q.setFromAxisAngle(X_AXIS, th);
    this._p.set(c.x, c.y, c.z);
    this._s.set(w, thick, d1 - d0);
    this.boxes.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** A gold pick across every row, between the two threads it compared. */
  private drawPicks(L: LoomPose, W: number, dist: (r: number) => number, r0: number): void {
    const w = L.weave,
      st = w.run.states,
      P = w.picks;
    const R = L.rows;
    const fade = Math.min(1, L.a * 1.5);
    const a = { x: 0, y: 0, z: 0 },
      b = { x: 0, y: 0, z: 0 };
    for (let rr = 1; rr <= W; rr++) {
      const q = rr - 1,
        i = P[2 * q],
        j = P[2 * q + 1];
      const arr = st[q];
      const age = R - rr + 1;
      const fresh = 1 - smooth(0.6, 2.6, age);
      const col = mix3(mix3(COL.weftDeep, COL.weft, fresh), COL.plinth, 1 - fade);
      const r = r0 * (0.5 + 0.4 * fresh) * fade;
      const d = dist(rr);
      this.at(this.X(L, i), this.Y(L, arr[i], d) + 0.012, d, a);
      this.at(this.X(L, j), this.Y(L, arr[j], d) + 0.012, d, b);
      this.kit.rod(a.x, a.y, a.z, b.x, b.y, b.z, r, col);
    }
  }

  /** Red knots where twins crossed: in the woven rows, and in the open end if they are crossing now. */
  private drawKnots(L: LoomPose, W: number, dist: (r: number) => number, r0: number): void {
    const w = L.weave;
    if (!w.twins.length) return;
    const knot = (a: number, xa0: number, xa1: number, xb0: number, xb1: number, d0: number, d1: number) => {
      const den = xa1 - xa0 - (xb1 - xb0);
      if (Math.abs(den) < 1e-6) return;
      const s = (xb0 - xa0) / den;
      if (s < 0 || s > 1) return;
      const d = d0 + (d1 - d0) * unsmooth(s);
      const p = this.at(this.X(L, xa0 + (xa1 - xa0) * s), this.Y(L, a, d), d);
      this.kit.ball(
        p.x,
        p.y,
        p.z,
        Math.max(r0 * 2.8, 0.055) * Math.min(1, L.a * 1.5),
        mix3(COL.knot, COL.plinth, 1 - L.a),
      );
    };
    for (const k of w.knots) {
      if (k.r + 1 > W) break;
      const p = rowState(w, k.r),
        q = rowState(w, k.r + 1);
      knot(k.a, p[k.a], q[k.a], p[k.b], q[k.b], dist(k.r), dist(k.r + 1));
    }
    // the open end
    const last = rowState(w, W);
    for (const [a, b] of w.twins) {
      const fa = L.threads[a].x,
        fb = L.threads[b].x;
      if (last[a] < last[b] !== fa < fb) knot(a, last[a], fa, last[b], fb, dist(W), 0);
    }
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, col: RGB): void {
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(w, h, d);
    this.boxes.add(this._m.compose(this._p, this._q, this._s), col);
  }

  /** The front of the loom: cells, heddles, discs, and what the sort has marked. */
  private drawFront(L: LoomPose, view: DrawView): void {
    const LB = this.labels,
      kit = this.kit,
      w = L.weave,
      n = w.n,
      list = w.run.threads.list;
    const show = (1 - smooth(0, 0.45, L.stand)) * L.a;
    if (show < 0.01) return;
    const rD = Lay.discR(L.px);
    // cells, tinted with their key's dye once it is final
    for (let s = 0; s < n; s++) {
      const c = L.cells[s];
      const base = mix3(COL.spare, COL.cell, 0.35 + 0.65 * c.live);
      const col = mix3(base, dye(shade(w.sortedV[s], w.top)), 0.5 * c.final);
      const h = Lay.CELL_H * (0.5 + 0.5 * Math.max(c.live, c.final)) * show;
      this.box(this.X(L, s), h / 2, 0, L.px * 0.9, h, Lay.CELL_D * show, col);
      if (L.px >= 0.28 && show > 0.05) {
        const x = this.X(L, s);
        LB.group(x, 0.1, Lay.IDX_Z);
        LB.text(
          String(s),
          x,
          0.1,
          Lay.IDX_Z,
          Math.min(0.19, L.px * 0.38),
          COL.graphite,
          0.7 * show * (0.55 + 0.45 * c.live),
        );
      }
    }
    this.drawMarks(L, show);
    // heddles and discs
    const cam = this.camera.quaternion;
    for (let t = 0; t < n; t++) {
      const T = L.threads[t];
      const h = this.H(L, t);
      const lift = T.lift;
      const x = this.X(L, T.x),
        y = h + Lay.LIFT_Y * lift,
        z = Lay.LIFT_Z * lift;
      const tone = shade(list[t].v, w.top);
      const dim = view.selected != null && view.selected !== t ? 0.55 : 0;
      const fill = mix3(dye(tone), COL.plinth, Math.max(dim, 1 - show));
      const r = rD * (0.4 + 0.6 * L.rise) * Math.min(1, show * 1.3);
      kit.rod(
        x,
        Lay.CELL_H,
        z,
        x,
        Math.max(Lay.CELL_H, y - r),
        z,
        0.011 * show,
        mix3(COL.heddle, COL.plinth, Math.max(dim, 1 - show)),
      );
      kit.disc(x, y, z, r, fill, cam);
      this.discWorld.set(`${L.id}:${t}`, { x, y, z, r, loom: L.id, t });
      LB.group(x, y, z);
      if (T.glow > 0.01) {
        LB.shape(
          MODE.glow,
          x,
          y,
          z,
          2 * (r + 0.45),
          2 * (r + 0.45),
          COL.weft,
          0.5 * T.glow * show,
          0,
          0,
          0,
          r + 0.1,
          0.2,
        );
        LB.shape(MODE.ring, x, y, z, 2 * (r + 0.05), 2 * (r + 0.05), COL.weft, T.glow * show, 0, 0, 1, 0.045);
      }
      if (T.ring > 0.01)
        LB.shape(MODE.ring, x, y, z, 2 * (r + 0.1), 2 * (r + 0.1), COL.ink, T.ring * show, 0, 0, 1, 0.035);
      if (view.selected === t)
        LB.shape(
          MODE.ring,
          x,
          y,
          z,
          2 * (r + 0.17),
          2 * (r + 0.17),
          COL.ink,
          show,
          0,
          0,
          1,
          0.03,
          12,
          view.clock * 0.3,
        );
      if (rD >= 0.1) {
        const label = String(list[t].v);
        LB.text(label, x, y, z, r * (label.length > 1 ? 0.78 : 0.95), mix3(glyphOn(tone), fill, dim), show);
        if (list[t].twin) LB.text(list[t].twin, x, y, z, r * 0.8, COL.ink, show * (1 - dim * 0.6), r * 1.3, r * 0.55);
      }
    }
    // the comparison in hand: a gold pick laid between the two discs
    if (L.weft && L.weft.al > 0.01) {
      const A = L.threads[L.weft.a],
        B = L.threads[L.weft.b];
      const ax = this.X(L, A.x),
        ay = this.H(L, L.weft.a) + Lay.LIFT_Y * A.lift,
        az = Lay.LIFT_Z * A.lift;
      const bx = this.X(L, B.x),
        by = this.H(L, L.weft.b) + Lay.LIFT_Y * B.lift,
        bz = Lay.LIFT_Z * B.lift;
      const s = L.weft.s;
      kit.rod(ax, ay, az, ax + (bx - ax) * s, ay + (by - ay) * s, az + (bz - az) * s, 0.034 * L.weft.al, COL.weft);
    }
  }

  /** Brackets under the row, the pivot's line, the heap's arcs. */
  private drawMarks(L: LoomPose, show: number): void {
    const kit = this.kit,
      px = L.px;
    const zb = Lay.CELL_D / 2 + 0.1,
      yb = 0.025;
    const bracket = (lo: number, hi: number, col: RGB, a: number, r = 0.018) => {
      if (a < 0.01 || hi - lo < 0.05) return;
      const xa = this.X(L, lo - 0.5) + px * 0.08,
        xb = this.X(L, hi - 0.5) - px * 0.08;
      const rr = r * a * show;
      kit.rod(xa, yb, zb, xb, yb, zb, rr, col);
      kit.rod(xa, yb, zb, xa, yb + 0.1, zb - 0.02, rr, col);
      kit.rod(xb, yb, zb, xb, yb + 0.1, zb - 0.02, rr, col);
    };
    if (L.sorted.a > 0.01) bracket(0, L.sorted.k, COL.ink, L.sorted.a);
    if (L.merge && L.merge.a > 0.01) {
      const M = L.merge;
      bracket(M.lo, M.k, COL.ink, M.a, 0.022);
      bracket(M.k, M.m, COL.cobalt, M.a);
      bracket(M.m, M.hi, COL.cobalt, M.a);
    }
    if (L.pivot && L.pivot.a > 0.01) {
      const pv = L.pivot,
        h = this.H(L, pv.id);
      const xa = this.X(L, pv.lo - 0.5),
        xb = this.X(L, pv.hi - 0.5);
      const seg = px * 0.3,
        z = 0.04;
      for (let x = xa; x < xb - 1e-6; x += seg * 2)
        kit.rod(x, h, z, Math.min(xb, x + seg), h, z, 0.012 * pv.a * show, mix3(COL.plinth, COL.ink, 0.75));
      bracket(pv.lo, pv.hi, COL.graphite, pv.a * 0.8, 0.014);
    }
    if (L.heap.a > 0.01 && L.heap.n > 1) {
      const sinkSlot = L.threads.findIndex(t => t.ring > 0.5);
      const at = sinkSlot >= 0 ? Math.round(L.threads[sinkSlot].x) : -1;
      for (let i = 0; 2 * i + 1 < L.heap.n; i++)
        for (const c of [2 * i + 1, 2 * i + 2]) {
          if (c >= L.heap.n) continue;
          const hot = i === at;
          this.arc(
            this.X(L, i),
            this.X(L, c),
            zb + 0.02,
            0.08 + 0.05 * (c - i) * Math.min(1, px / 0.4),
            hot ? 0.017 : 0.01,
            hot ? COL.cobalt : mix3(COL.plinth, COL.graphite, 0.6),
            L.heap.a * show,
          );
        }
    }
  }

  private arc(xa: number, xb: number, z: number, h: number, r: number, col: RGB, a: number): void {
    const N = 12;
    let px = xa,
      py = 0.03;
    for (let k = 1; k <= N; k++) {
      const u = k / N,
        x = xa + (xb - xa) * u,
        y = 0.03 + 4 * h * u * (1 - u);
      this.kit.rod(px, py, z, x, y, z, r * a, col);
      px = x;
      py = y;
    }
  }

  /**
   * The loom's name plate, laid flat on the plinth in front of it, with its
   * comparisons so far: one line under a single loom, two (name over count) under
   * each of six.
   */
  private drawPlate(L: LoomPose): void {
    const LB = this.labels;
    const two = L.px < 0.3;
    const x = L.cx,
      z = (this.pose?.plinth.z1 ?? Lay.PLATE_Z) - (two ? 0.72 : 0.4),
      y = 0.012;
    const hName = two ? 0.3 : Math.min(0.26, 0.17 + L.px * 0.2),
      hCount = two ? 0.44 : hName * 1.1;
    const name = SHORT[L.key].toUpperCase(),
      count = String(Math.round(L.rows));
    const wName = glyphWidth(name, hName),
      wCount = glyphWidth(count, hCount);
    const a = L.a;
    LB.group(x, y, z);
    // flat text reads with its top away from the viewer, so a line further forward sits lower
    const nameAt = two ? [0, hCount * 0.62] : [-(wName + hName * 0.9 + wCount) / 2 + wName / 2, 0],
      countAt = two ? [0, -hName * 0.85] : [(wName + hName * 0.9 + wCount) / 2 - wCount / 2, 0];
    if (L.done > 0.01) {
      const w = two ? Math.max(wName, wCount) + hName * 1.4 : wName + hName * 0.9 + wCount + hName * 1.5,
        h = two ? hName + hCount + hName * 1.3 : hName * 2;
      LB.shape(
        MODE.fill,
        x,
        y,
        z,
        w,
        h,
        COL.ink,
        a * L.done,
        0,
        two ? (nameAt[1] + countAt[1]) / 2 : 0,
        two ? 0.35 : 1,
        0,
        0,
        0,
        1,
      );
    }
    LB.text(name, x, y, z, hName, mix3(COL.graphite, COL.light, L.done), a, nameAt[0], nameAt[1], 1);
    LB.text(count, x, y, z, hCount, mix3(COL.ink, COL.weft, L.done), a, countAt[0], countAt[1], 1);
  }

  /* ---------- callout, picking, camera ---------- */

  /** The point the callout hangs over: above the two discs being compared. */
  calloutAnchor(): Lay.P3 | null {
    const c = this.pose?.callout;
    if (!c) return null;
    const A = this.discWorld.get(`${c.loom}:${c.a}`),
      B = this.discWorld.get(`${c.loom}:${c.b}`);
    if (!A || !B) return null;
    return { x: (A.x + B.x) / 2, y: Math.max(A.y, B.y) + Math.max(A.r, B.r) + 0.32, z: (A.z + B.z) / 2 };
  }

  /** Screen position of a thread's disc on a loom (the first loom if none is named). */
  discScreen(t: number, loom?: string): { x: number; y: number } | null {
    for (const d of this.discWorld.values())
      if (d.t === t && (loom == null || d.loom === loom)) return this.toScreen(d.x, d.y, d.z);
    return null;
  }

  /**
   * The extent of everything worth keeping on screen, measured across and up the
   * current view. Worked out from a pose, so the page can frame where a step will
   * come to rest rather than chase it.
   */
  frameBox(P: Pose): FrameBox {
    const pts: [number, number, number][] = [];
    const z1 = P.plinth.z1;
    // the looms on show; while they fade in from nothing, all of them, so the box is never empty
    const shown = P.looms.filter(L => L.a >= 0.3),
      looms = shown.length ? shown : P.looms;
    for (const L of looms) {
      // the plate in front, on the plinth's edge
      const half = (L.weave.n * L.px) / 2 + 0.4;
      pts.push([L.cx - half, 0, z1], [L.cx + half, 0, z1], [L.cx, -Lay.PH, z1]);
    }
    for (const L of looms) {
      this.useLoom(L, P.dz);
      const n = L.weave.n;
      const far = (L.rows + 1) * P.dz;
      for (const s of [-0.5, n - 0.5]) {
        const x = this.X(L, s);
        for (const [h, d] of [
          [0, 0],
          [Lay.H_HI + 0.4, 0],
          [0, far],
          [0.2, far],
        ]) {
          const q = this.at(x, h, d);
          pts.push([q.x, q.y, q.z]);
        }
      }
    }
    const c = [0, 1.2, -2];
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
      hw: Math.max(4.5, (r1 - r0) / 2 + 0.3),
      hh: Math.max(3, (u1 - u0) / 2 + 0.3),
      depth: f1 * 0.12,
    };
  }

  /** The key light and its shadow camera follow the plinth. */
  fitLights(): void {
    const { key, pool, KEY_DIR } = this.stage;
    const P = this.pose;
    const cx = P ? (P.plinth.x0 + P.plinth.x1) / 2 : 0,
      cz = P ? (P.plinth.z0 + P.plinth.z1) / 2 : 0;
    const half = P ? Math.max(P.plinth.x1 - P.plinth.x0, P.plinth.z1 - P.plinth.z0) / 2 + 4 : 12;
    key.target.position.set(cx, 1, cz);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 100;
    sc.updateProjectionMatrix();
    pool.position.set(cx - 2, 28, cz + 12);
    pool.target.position.set(cx, 0, cz);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 28));
  }
}
