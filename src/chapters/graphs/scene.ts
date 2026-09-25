// The Graph Net scene: a floor, one plinth per algorithm, and instanced meshes
// for discs, strings, knots and arrowheads. draw() renders any ScenePose; the
// scene keeps no algorithm state of its own.

import * as THREE from 'three';
import { glyphWidth } from '../../core/glyphs';
import { lerp, smooth } from '../../core/math';
import { createStage, plasterTexture, type FrameBox, type Stage } from '../../core/stage';
import type { AlgoKey, EdgeId, NodeId } from './algorithms';
import { LabelBatch, MODE } from './labels';
import { COL, KNOT, L0, PEG, PH, R, mix3, type RGB } from './palette';
import type { EdgePose, NetPose, NodePose, ScenePose } from './poses';

const MAX_DISCS = 140,
  MAX_RODS = 7000,
  MAX_BALLS = 700,
  MAX_CONES = 440;
const UP = new THREE.Vector3(0, 1, 0);

/** Interaction state the scene needs to draw, owned by the page. */
export interface DrawView {
  /** Generation of the graph being edited; highlights only apply to it. */
  gen: number;
  selected: NodeId | null;
  pending: { j: number; id: NodeId } | null;
  pointer: { x: number; z: number } | null;
  drag: { id: NodeId; x: number; z: number } | null;
  /** The string whose weight card is open. */
  hotEdge: EdgeId | null;
  /** Show weights on plinths running this algorithm. */
  weightsFor(algo: AlgoKey): boolean;
  clock: number;
}

/** Where a knot's disc was drawn this frame. */
export interface NodeWorld {
  x: number;
  y: number;
  z: number;
  /** The knot itself, on or above the plinth. */
  X: number;
  Y: number;
  Z: number;
  r: number;
  id: NodeId;
  j: number;
  gen: number;
}
/** Where a string was drawn this frame, for picking. */
export interface EdgeWorld {
  j: number;
  id: EdgeId;
  gen: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  sag: number;
  /** The weight label's anchor, when shown. */
  wx: number;
  wy: number;
  wz: number;
  showW: boolean;
}

/**
 * A string hangs between two knots. It lies flat while both are on the plinth;
 * once lifted, it sags by however much of its length is not pulled straight.
 */
function sagOf(net: NetPose, e: EdgePose, A: NodePose, B: NodePose): number {
  const hi = Math.max(A.h, B.h);
  if (hi < 0.01 || net.HS <= 0) return 0;
  const len = lerp(e.w, 1, net.unit) * net.HS;
  const slack = Math.max(0, len - Math.abs(A.h - B.h));
  return Math.min(1.3, slack * 0.34) * Math.min(1, hi / L0);
}

/** A point on a hanging string: straight between the ends, minus a parabolic sag, never below the plinth. */
export function curveAt(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  sag: number,
  u: number,
  out: number[],
): number[] {
  out[0] = ax + (bx - ax) * u;
  out[2] = az + (bz - az) * u;
  out[1] = Math.max(0.025, ay + (by - ay) * u - 4 * sag * u * (1 - u));
  return out;
}

export class GraphScene {
  readonly stage: Stage;
  readonly nodeWorld = new Map<string, NodeWorld>();
  readonly edgeWorld: EdgeWorld[] = [];
  private readonly plinths: THREE.Mesh[];
  private readonly discs: THREE.InstancedMesh;
  private readonly rods: THREE.InstancedMesh;
  private readonly balls: THREE.InstancedMesh;
  private readonly cones: THREE.InstancedMesh;
  private readonly labels: LabelBatch;
  private nR = 0;
  private nB = 0;
  private nC = 0;
  private nD = 0;
  /** Eased visibility of the weight labels on each plinth. */
  private readonly wVis = [0, 0];
  private readonly camUp = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camBack = new THREE.Vector3();
  // scratch objects, reused every frame
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _p = new THREE.Vector3();
  private readonly _d = new THREE.Vector3();
  private readonly _c = new THREE.Color();
  private readonly _v = new THREE.Vector3();
  private readonly curve = new Float32Array(3 * 13);
  private readonly tmp = [0, 0, 0];

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage({
      canvas,
      background: 0xe2dacb,
      keyDir: [-0.38, 1, 0.5],
      cameraPos: [-3, 17, 22],
      target: [0, 0, 0],
      controls: {
        minPolarAngle: 0.3,
        maxPolarAngle: 1.45,
        minAzimuthAngle: -1.4,
        maxAzimuthAngle: 1.4,
        minDistance: 5,
        maxDistance: 130,
      },
    });
    const { scene } = this.stage;
    scene.fog = new THREE.Fog(0xe2dacb, 130, 320);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({
        map: plasterTexture({ base: '#DCD3C3', repeat: [26, 26], seed: 11 }),
        roughness: 0.97,
        metalness: 0,
        envMapIntensity: 0.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -PH;
    floor.receiveShadow = true;
    scene.add(floor);
    this.plinths = [0, 1].map(() => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xf7f3eb, roughness: 0.88, metalness: 0, envMapIntensity: 0.5 }),
      );
      m.castShadow = true;
      m.receiveShadow = true;
      m.visible = false;
      scene.add(m);
      return m;
    });
    const mat = (o: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.08,
        envMapIntensity: 0.55,
        ...o,
      });
    const discGeo = new THREE.CylinderGeometry(R, R, 0.08, 40, 1);
    discGeo.rotateX(Math.PI / 2);
    this.discs = new THREE.InstancedMesh(
      discGeo,
      mat({ roughness: 0.78, metalness: 0, envMapIntensity: 0.35 }),
      MAX_DISCS,
    );
    this.rods = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 6, 1),
      mat({ roughness: 0.5, metalness: 0.15 }),
      MAX_RODS,
    );
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), mat({ roughness: 0.4 }), MAX_BALLS);
    const coneGeo = new THREE.ConeGeometry(1, 1, 12);
    coneGeo.translate(0, -0.5, 0); // tip at the origin
    this.cones = new THREE.InstancedMesh(coneGeo, mat(), MAX_CONES);
    for (const m of [this.discs, this.rods, this.balls, this.cones]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, new THREE.Color(0xffffff));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor?.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.labels = new LabelBatch(scene);
  }

  get camera(): THREE.PerspectiveCamera {
    return this.stage.camera;
  }

  counts(): { rods: number; balls: number; discs: number; cones: number; labels: number } {
    return { rods: this.nR, balls: this.nB, discs: this.nD, cones: this.nC, labels: this.labels.count };
  }

  render(): void {
    this.stage.renderer.render(this.stage.scene, this.stage.camera);
  }

  /* ---------- instanced primitives ---------- */

  private setCol(m: THREE.InstancedMesh, i: number, c: RGB): void {
    this._c.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    m.setColorAt(i, this._c);
  }
  private addRod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, col: RGB): void {
    if (this.nR >= MAX_RODS) return;
    const d = this._d.set(bx - ax, by - ay, bz - az);
    const len = d.length();
    if (len < 1e-4 || r < 1e-4) return;
    d.divideScalar(len);
    this._q.setFromUnitVectors(UP, d);
    this._p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this._s.set(r, len, r);
    this._m.compose(this._p, this._q, this._s);
    this.rods.setMatrixAt(this.nR, this._m);
    this.setCol(this.rods, this.nR, col);
    this.nR++;
  }
  private addBall(x: number, y: number, z: number, r: number, col: RGB): void {
    if (this.nB >= MAX_BALLS || r < 1e-4) return;
    this._q.identity();
    this._p.set(x, y, z);
    this._s.set(r, r, r);
    this._m.compose(this._p, this._q, this._s);
    this.balls.setMatrixAt(this.nB, this._m);
    this.setCol(this.balls, this.nB, col);
    this.nB++;
  }
  private addCone(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    r: number,
    h: number,
    col: RGB,
  ): void {
    if (this.nC >= MAX_CONES) return;
    this._d.set(dx, dy, dz).normalize();
    this._q.setFromUnitVectors(UP, this._d); // tip forward, base trailing
    this._p.set(x, y, z);
    this._s.set(r, h, r);
    this._m.compose(this._p, this._q, this._s);
    this.cones.setMatrixAt(this.nC, this._m);
    this.setCol(this.cones, this.nC, col);
    this.nC++;
  }
  private addDisc(x: number, y: number, z: number, s: number, col: RGB): void {
    if (this.nD >= MAX_DISCS) return;
    this._p.set(x, y, z);
    this._s.set(s, s, s);
    this._m.compose(this._p, this.camera.quaternion, this._s);
    this.discs.setMatrixAt(this.nD, this._m);
    this.setCol(this.discs, this.nD, col);
    this.nD++;
  }
  private curvePts(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    sag: number,
    n: number,
  ): void {
    const CP = this.curve;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      let y = ay + (by - ay) * u - 4 * sag * u * (1 - u);
      if (y < 0.025) y = 0.025;
      CP[k * 3] = ax + (bx - ax) * u;
      CP[k * 3 + 1] = y;
      CP[k * 3 + 2] = az + (bz - az) * u;
    }
  }
  /** Draw part of the current curve, fraction f, starting from end a (fromA) or end b. */
  private drawPartial(n: number, f: number, fromA: boolean, r: number, col: RGB): void {
    if (f <= 0.001) return;
    const CP = this.curve,
      upto = f * n;
    for (let k = 0; k < n; k++) {
      if (k >= upto) break;
      const k0 = fromA ? k : n - k,
        k1 = fromA ? k + 1 : n - k - 1;
      const frac = Math.min(1, upto - k);
      const x0 = CP[k0 * 3],
        y0 = CP[k0 * 3 + 1],
        z0 = CP[k0 * 3 + 2];
      this.addRod(
        x0,
        y0,
        z0,
        lerp(x0, CP[k1 * 3], frac),
        lerp(y0, CP[k1 * 3 + 1], frac),
        lerp(z0, CP[k1 * 3 + 2], frac),
        r,
        col,
      );
      if (k > 0) this.addBall(x0, y0, z0, r, col);
    }
  }

  /* ---------- drawing a pose ---------- */

  draw(P: ScenePose, dt: number, view: DrawView): void {
    this.nR = this.nB = this.nC = this.nD = 0;
    this.labels.begin();
    this.nodeWorld.clear();
    this.edgeWorld.length = 0;
    const camera = this.camera;
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camBack);
    this.plinths.forEach((m, j) => {
      m.visible = !!P.nets[j] && P.nets[j].pa > 0.01;
    });
    P.nets.forEach((net, j) => this.drawNet(net, j, dt, view));
    if (view.pending && view.pointer) {
      // the string being tied follows the pointer
      const w = this.nodeWorld.get(`${view.pending.j}|${view.gen}:${view.pending.id}`);
      if (w) this.addRod(w.X, w.Y + 0.03, w.Z, view.pointer.x, 0.03, view.pointer.z, 0.022, COL.cobalt);
    }
    for (const m of [this.discs, this.rods, this.balls, this.cones]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.discs.count = this.nD;
    this.rods.count = this.nR;
    this.balls.count = this.nB;
    this.cones.count = this.nC;
    this.labels.end(camera);
  }

  private drawNet(net: NetPose, j: number, dt: number, view: DrawView): void {
    const LB = this.labels,
      camUp = this.camUp,
      clock = view.clock;
    const ox = net.ox,
      oz = net.oz,
      pl = net.plinth;
    // the plinth sinks into the floor when it is taken away
    const pm = this.plinths[j];
    if (pm) {
      const hgt = Math.max(0.001, PH * net.pa);
      pm.position.set(ox + pl.cx, -PH + hgt / 2, oz + pl.cz);
      pm.scale.set(pl.w, hgt, pl.d);
    }
    const top = -PH + PH * net.pa;
    this.wVis[j] += ((view.weightsFor(net.algo) ? 1 : 0) - this.wVis[j]) * (1 - Math.exp(-dt * 8));
    const current = net.gen === view.gen;
    const drag = current ? view.drag : null;
    const nx = (n: NodePose) => ox + (drag && n.id === drag.id ? drag.x : n.x);
    const nz = (n: NodePose) => oz + (drag && n.id === drag.id ? drag.z : n.z);
    const ny = (n: NodePose) => top + n.h;

    // knots, pegs and discs
    for (const n of net.nodes.values()) {
      if (n.s < 0.01) continue;
      const s = n.s,
        X = nx(n),
        Y = ny(n),
        Z = nz(n),
        rr = R * s;
      this.addBall(X, Y + 0.03, Z, KNOT * s, COL.ink);
      this.addRod(X, Y + 0.03, Z, X, Y + PEG * s, Z, 0.02 * s, COL.ink);
      const cx = X + camUp.x * rr,
        cy = Y + PEG * s + camUp.y * rr,
        cz = Z + camUp.z * rr;
      this.addDisc(cx, cy, cz, s, n.fill);
      this.nodeWorld.set(`${j}|${n.key}`, { x: cx, y: cy, z: cz, X, Y, Z, r: rr, id: n.id, j, gen: net.gen });
      // a dashed socket marks where a lifted knot used to lie
      if (n.h > 0.02) {
        LB.group(X, top, Z);
        LB.shape(
          MODE.ring,
          X,
          top + 0.012,
          Z,
          0.62 * s,
          0.62 * s,
          COL.ink,
          0.5 * Math.min(1, n.h / L0) * s,
          0,
          0,
          1,
          0.02,
          9,
          0,
          1,
        );
      }
      LB.group(cx, cy, cz);
      if (n.halo > 0.01)
        LB.shape(
          MODE.glow,
          cx,
          cy,
          cz,
          2 * (rr + 0.5),
          2 * (rr + 0.5),
          COL.cobalt,
          0.34 * n.halo * (0.85 + 0.15 * Math.sin(clock * 4)),
          0,
          0,
          0,
          rr + 0.17,
          0.2,
        );
      LB.shape(MODE.ring, cx, cy, cz, 2 * rr, 2 * rr, n.rim, 1, 0, 0, 1, n.rimW * s);
      LB.text(n.label, cx, cy, cz, (n.label.length > 1 ? 0.27 : 0.36) * s, n.glyph, 1);
      if (n.tgt > 0.01) {
        const tr = rr + 0.17 * s;
        LB.shape(
          MODE.ring,
          cx,
          cy,
          cz,
          2 * tr,
          2 * tr,
          COL.red,
          n.tgt * (1 - n.tgtSolid),
          0,
          0,
          1,
          0.048 * s,
          14,
          clock * 0.12,
        );
        LB.shape(MODE.ring, cx, cy, cz, 2 * tr, 2 * tr, COL.red, n.tgt * n.tgtSolid, 0, 0, 1, 0.06 * s);
      }
      if (current && view.selected === n.id)
        LB.shape(MODE.ring, cx, cy, cz, 2 * (rr + 0.1), 2 * (rr + 0.1), COL.cobalt, 1, 0, 0, 1, 0.035);
      if (current && view.pending && view.pending.id === n.id)
        LB.shape(
          MODE.ring,
          cx,
          cy,
          cz,
          2 * (rr + 0.12),
          2 * (rr + 0.12),
          COL.cobalt,
          1,
          0,
          0,
          1,
          0.05,
          10,
          clock * 0.4,
        );
      if (n.hook > 0.01)
        LB.shape(MODE.ring, cx, cy, cz, 0.16 * s, 0.16 * s, COL.ink, n.hook * s, 0, rr + 0.075 * s, 1, 0.024 * s);
      if (n.tag && n.tagA > 0.01) {
        const th = 0.23 * Math.min(1, s),
          W = glyphWidth(n.tag, th) + th * 1.05,
          st = n.tagSt;
        const border = st === 'wait' ? COL.yellowDeep : st === 'inf' ? COL.faint : COL.ink;
        const bw = st === 'wait' ? 0.03 : st === 'inf' ? 0.012 : 0.017;
        LB.pill(
          cx,
          cy,
          cz,
          n.tag,
          th,
          rr + W / 2 - 0.05,
          rr * 0.66,
          COL.paper,
          border,
          bw,
          st === 'inf' ? COL.graphite : COL.ink,
          n.tagA * (st === 'inf' ? 0.85 : 1),
        );
      }
    }
    // old distances lift away, struck through
    for (const gh of net.ghosts) {
      const w = this.nodeWorld.get(`${j}|${gh.node}`);
      if (!w) continue;
      const th = 0.23,
        W = glyphWidth(gh.text, th) + th * 1.05,
        a = 1 - gh.g,
        oR = w.r + W / 2 - 0.05,
        oU = w.r * 0.66 + 0.1 + gh.g * 0.5;
      LB.group(w.x, w.y, w.z);
      LB.pill(w.x, w.y, w.z, gh.text, th, oR, oU, COL.paper, COL.faint, 0.012, COL.graphite, a);
      LB.shape(MODE.fill, w.x, w.y, w.z, W * 0.8, 0.03, COL.red, a * smooth(0, 0.25, gh.g), oR, oU, 1);
    }

    // strings
    const showW = this.wVis[j] > 0.01,
      CP = this.curve;
    for (const e of net.edges.values()) {
      if (e.s < 0.01) continue;
      const A = net.nodes.get(e.a),
        B = net.nodes.get(e.b);
      if (!A || !B || A.s < 0.01 || B.s < 0.01) continue;
      const s = e.s * Math.min(1, A.s, B.s);
      const ax = nx(A),
        ay = ny(A) + 0.03,
        az = nz(A),
        bx = nx(B),
        by = ny(B) + 0.03,
        bz = nz(B);
      const sag = sagOf(net, e, A, B),
        n = sag > 0.02 ? 12 : 1;
      this.curvePts(ax, ay, az, bx, by, bz, sag, n);
      const rec: EdgeWorld = { j, id: e.id, gen: net.gen, ax, ay, az, bx, by, bz, sag, wx: 0, wy: 0, wz: 0, showW };
      this.edgeWorld.push(rec);
      let col = mix3(COL.string, COL.ink, e.tree);
      if (e.hl > 0.01) col = mix3(col, COL.cobalt, 0.7 * e.hl);
      const r = lerp(0.016, 0.026, e.tree) * (1 + 0.35 * e.hl) * s;
      for (let k = 0; k < n; k++) {
        this.addRod(CP[k * 3], CP[k * 3 + 1], CP[k * 3 + 2], CP[k * 3 + 3], CP[k * 3 + 4], CP[k * 3 + 5], r, col);
        if (k > 0 && r > 0.02) this.addBall(CP[k * 3], CP[k * 3 + 1], CP[k * 3 + 2], r, col);
      }
      if (e.thr > 0.001) this.drawPartial(n, e.thr, e.thrFrom === e.a, 0.046 * s, COL.cobalt);
      if (e.path > 0.001) this.drawPartial(n, e.path, e.pathFrom === e.a, 0.05 * s, COL.cobalt);
      if (e.dir > 0.01) {
        // arrowhead just short of the far knot
        const len = Math.hypot(bx - ax, by - ay, bz - az) || 1,
          u1 = Math.max(0.5, 1 - (KNOT + 0.05) / len),
          u0 = Math.max(0.3, u1 - 0.05);
        const p1 = curveAt(ax, ay, az, bx, by, bz, sag, u1, [0, 0, 0]),
          p0 = curveAt(ax, ay, az, bx, by, bz, sag, u0, this.tmp);
        const c = e.path > 0.5 || e.thr > 0.5 ? COL.cobalt : col;
        this.addCone(
          p1[0],
          p1[1],
          p1[2],
          p1[0] - p0[0],
          p1[1] - p0[1],
          p1[2] - p0[2],
          0.085 * e.dir * s,
          0.24 * e.dir * s,
          c,
        );
      }
      if (showW) {
        const m = curveAt(ax, ay, az, bx, by, bz, sag, 0.5, this.tmp);
        rec.wx = m[0];
        rec.wy = m[1] + 0.1;
        rec.wz = m[2];
        const a = this.wVis[j] * s * e.wA;
        const hot = e.hl > 0.5 || (current && view.hotEdge === e.id);
        LB.group(rec.wx, rec.wy, rec.wz);
        LB.pill(
          rec.wx,
          rec.wy,
          rec.wz,
          String(e.w),
          0.2,
          0,
          0,
          hot ? COL.cobalt : COL.paper,
          COL.ink,
          hot ? 0 : 0.013,
          hot ? COL.white : COL.ink,
          a * (e.tree > 0.5 || hot ? 1 : 0.92),
          0.42,
        );
      }
    }
    // beads travel along strings
    for (const b of net.beads) {
      const e = net.edges.get(b.edge);
      if (!e || b.a < 0.01) continue;
      const A = net.nodes.get(e.a),
        Bn = net.nodes.get(e.b);
      if (!A || !Bn) continue;
      const sag = sagOf(net, e, A, Bn),
        u = b.from === e.a ? b.u : 1 - b.u;
      const p = curveAt(nx(A), ny(A) + 0.03, nz(A), nx(Bn), ny(Bn) + 0.03, nz(Bn), sag, u, this.tmp);
      this.addBall(p[0], p[1] + 0.02, p[2], (b.r || 0.1) * Math.min(1, b.a * 1.5), b.col);
    }
    // ripples spread across the plinth
    for (const rp of net.ripples) {
      const n = net.nodes.get(rp.node);
      if (!n) continue;
      const X = nx(n),
        Z = nz(n),
        Y = ny(n);
      LB.group(X, Y, Z);
      LB.shape(MODE.ring, X, Y + 0.015, Z, 2 * rp.r, 2 * rp.r, rp.col, rp.a, 0, 0, 1, 0.04, 0, 0, 1);
    }
    // the ceiling wire that lifts the start, and the ruler beside it
    const S = net.startKey ? net.nodes.get(net.startKey) : undefined;
    if (S && S.s > 0.01) {
      const w = this.nodeWorld.get(`${j}|${S.key}`);
      if (net.wire > 0.01 && w) {
        const o = w.r + 0.15,
          hx = w.x + camUp.x * o,
          hy = w.y + camUp.y * o,
          hz = w.z + camUp.z * o;
        this.addRod(hx, hy + (1 - net.wire) * 14, hz, hx, 70, hz, 0.014, COL.ink);
      }
      if (net.ruler > 0.01 && net.HS > 0) {
        const rx = ox + pl.cx - pl.w / 2 - 0.55,
          rz = nz(S),
          yTop = ny(S) + 0.03,
          span = net.tau * net.HS,
          a = net.ruler;
        this.addRod(rx, yTop, rz, rx, yTop - span, rz, 0.012 * a, COL.ink);
        const T = Math.max(1, net.tau);
        const stepD = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(v => T / v <= 8) || 1000;
        LB.group(rx, yTop, rz);
        LB.text(net.rulerText, rx, yTop + 0.45, rz, 0.15, COL.graphite, a, 0.2, 0);
        for (let d = 0; d <= net.tau + 1e-6; d += stepD) {
          const y = yTop - d * net.HS;
          this.addRod(rx - 0.02, y, rz, rx + 0.18, y, rz, 0.01 * a, COL.ink);
          LB.text(String(d), rx, y, rz, 0.2, COL.graphite, a, -0.3, 0);
        }
      }
    }
    if (net.title && net.titleA > 0.01) {
      // the algorithm's name stands beside its plinth
      const tx = ox + pl.cx + pl.w / 2 + 0.35,
        tz = oz + pl.cz,
        ty = 0.3,
        h = 0.44;
      LB.group(tx, ty, tz);
      LB.text(net.title, tx, ty, tz, h, COL.ink, net.titleA, glyphWidth(net.title, h) / 2, 0);
    }
  }

  /* ---------- camera and lights ---------- */

  /** The extent of everything worth keeping on screen, measured across and up the current view. */
  frameBox(P: ScenePose): FrameBox {
    const pts: [number, number, number][] = [];
    for (const net of P.nets) {
      if (net.pa < 0.05) continue;
      const pl = net.plinth,
        x0 = net.ox + pl.cx - pl.w / 2,
        x1 = x0 + pl.w,
        z0 = net.oz + pl.cz - pl.d / 2,
        z1 = z0 + pl.d;
      pts.push([x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1], [x0, -PH, z1], [x1, -PH, z1]);
      for (const n of net.nodes.values())
        if (n.s > 0.05 && n.h > 0.05) pts.push([net.ox + n.x, n.h + PEG + 2 * R + 0.3, net.oz + n.z]);
      pts.push([net.ox + pl.cx, 1.25, z0]); // discs standing on the back row
      if (net.title && net.titleA > 0.05) pts.push([x1 + 0.45 + glyphWidth(net.title, 0.44), 0.6, net.oz + pl.cz]);
      if (net.ruler > 0.05 && net.startKey) {
        const S = net.nodes.get(net.startKey);
        if (S) pts.push([net.ox + pl.cx - pl.w / 2 - 0.8, S.h + 0.6, net.oz + S.z]);
      }
    }
    if (!pts.length) pts.push([-4, 0, -2.5], [4, 0, 2.5]);
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
      z0 = Math.min(z0, p[2]);
      z1 = Math.max(z1, p[2]);
    }
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
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
      hw: Math.max(3, (r1 - r0) / 2),
      hh: Math.max(2, (u1 - u0) / 2),
      depth: f1 * 0.25,
    };
  }

  /** The key light and its shadow camera follow the plinths. */
  fitLights(P: ScenePose): void {
    const { key, pool, KEY_DIR } = this.stage;
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (const net of P.nets) {
      const pl = net.plinth;
      x0 = Math.min(x0, net.ox + pl.cx - pl.w / 2);
      x1 = Math.max(x1, net.ox + pl.cx + pl.w / 2);
      z0 = Math.min(z0, net.oz + pl.cz - pl.d / 2);
      z1 = Math.max(z1, net.oz + pl.cz + pl.d / 2);
    }
    if (x0 === Infinity) {
      x0 = -4;
      x1 = 4;
      z0 = -3;
      z1 = 3;
    }
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      half = Math.max(x1 - x0, z1 - z0) / 2 + 4;
    key.target.position.set(cx, 0, cz);
    key.position.copy(key.target.position).addScaledVector(KEY_DIR, 40);
    const sc = key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 4;
    sc.far = 90;
    sc.updateProjectionMatrix();
    pool.position.set(cx - 2, 26, cz + 12);
    pool.target.position.set(cx, 0, cz);
    pool.angle = Math.min(1.1, Math.atan((half + 2) / 28));
  }

  /** Screen position (CSS px) of a world point, or null if it is behind the camera. */
  toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    this._v.set(x, y, z).project(this.camera);
    if (this._v.z > 1) return null;
    return { x: ((this._v.x + 1) / 2) * innerWidth, y: ((1 - this._v.y) / 2) * innerHeight };
  }
  /** The camera's right vector this frame. */
  get right(): THREE.Vector3 {
    return this.camRight;
  }
}
